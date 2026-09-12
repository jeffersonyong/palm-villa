-- The deposit slip stops taking its locks backwards.
--
-- ── The bug ────────────────────────────────────────────────────────────────
--
-- `attach_document()` locked a DEPOSIT and then its BOOKING. Every other
-- writer that holds both locks them the other way round:
--
--   verify_deposit()          20260919000100   booking, then deposit
--   top_up_booking_deposit()  20260917000100   booking, then deposit
--   record_booking_deposit()  20260914000200   booking, then deposit
--   check_in_booking()        20260917000100   booking, then deposit
--   submit_public_payment()   20260913000200   booking, then deposit
--
-- Two transactions taking one pair of rows in opposite orders is the textbook
-- deadlock, and this pair is not exotic. A customer sending their deposit slip
-- from the link in their confirmation (capability A6) while a clerk confirms
-- that same deposit in the verification queue (B5) is two ordinary Saturday
-- actions seconds apart. Each transaction takes one row and waits for the
-- other's; Postgres breaks the tie by aborting one of them, and the clerk or
-- the guest gets an error with nothing wrong on their end and nothing to do
-- about it but try again.
--
-- ── Why the comment said otherwise ────────────────────────────────────────
--
-- The note in 20260918000100 asserted that verify_deposit() and
-- top_up_booking_deposit() were both deposit-then-booking. That was not true
-- of either when it was written, and the same migration's payment branch —
-- which really does match verify_payment() — made the claim look checked.
-- A comment that names the functions it is consistent with is only worth
-- having if somebody has opened them, so this one now lists all five.
--
-- ── The fix ───────────────────────────────────────────────────────────────
--
-- The booking's lock moves up: after the payment branch, before the deposit
-- branch. Nothing else changes — the body below is the 20260918000100
-- function with that one block relocated and the two lock comments rewritten.
--
-- The two branches now take their locks in different orders, which is
-- deliberate and safe. A payment slip stays payment-then-booking because
-- verify_payment() is, and reversing it would trade this deadlock for that
-- one. No transaction ever holds a payment and a deposit at the same time —
-- the pointer check admits exactly one — so the two orders cannot form a
-- cycle between them.
--
-- ── One refusal changes precedence ────────────────────────────────────────
--
-- A caller passing a real deposit together with a booking id that does not
-- exist now gets `not_found` where it got `not_on_this_booking`, because the
-- booking is looked up first. Both are refusals and neither is reachable from
-- the product: the staff action resolves the booking before calling, and the
-- customer path resolves it from the access token.

create or replace function attach_document(
  p_property_id uuid,
  p_document_id uuid,
  p_kind text,
  p_booking_id uuid,
  p_payment_id uuid,
  p_inspection_id uuid,
  p_bucket_id text,
  p_storage_key text,
  p_original_filename text,
  p_mime_type text,
  p_byte_size integer,
  p_actor_id uuid default null,
  p_assembled_from timestamptz default null,
  p_deposit_id uuid default null,
  p_uploaded_by_customer boolean default false
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_payment payment%rowtype;
  v_deposit deposit%rowtype;
  v_existing document%rowtype;
  v_object_size bigint;
  v_size integer;
  v_months integer;
  v_time_zone text;
  v_end_date date;
  v_retain_until timestamptz;
  v_filename text := nullif(btrim(coalesce(p_original_filename, '')), '');
  v_superseded jsonb := '[]'::jsonb;
begin
  if p_kind is null or p_kind not in
    ('identity', 'payment_slip', 'inspection_photo', 'accounting_pack')
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  if p_mime_type is null or p_mime_type not in
    ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_mime_type');
  end if;

  if v_filename is null then
    return jsonb_build_object('ok', false, 'error', 'filename_required');
  end if;

  -- A customer sends their own slip and their own IC and nothing else. An
  -- inspection photograph is Housekeeping's record of what they found and a
  -- pack is assembled by the system; neither is a thing a guest holds.
  -- Mirrored by CUSTOMER_ATTACHABLE_KINDS in lib/domain/document.ts.
  if p_uploaded_by_customer and p_kind not in ('identity', 'payment_slip') then
    return jsonb_build_object('ok', false, 'error', 'not_a_customer_kind');
  end if;

  -- A customer has no actor. Passing both would be a caller claiming an upload
  -- was made by a member of staff and by a guest at once, and `uploaded_by is
  -- null` is what the supersede rule below reads to tell them apart.
  if p_uploaded_by_customer and p_actor_id is not null then
    return jsonb_build_object('ok', false, 'error', 'customer_has_no_actor');
  end if;

  -- The watermark belongs to a pack and to nothing else. Refused rather than
  -- ignored: a slip arriving with one is a caller that has confused the two,
  -- and the constraint on the column would refuse it a few statements later
  -- anyway, as an exception rather than a sentence.
  if p_kind = 'accounting_pack' then
    if p_assembled_from is null then
      return jsonb_build_object('ok', false, 'error', 'assembled_from_required');
    end if;
  elsif p_assembled_from is not null then
    return jsonb_build_object('ok', false, 'error', 'assembled_from_not_allowed');
  end if;

  -- ── Two locks, and the order they are taken in ──────────────────────
  --
  -- **The order is not the same for the two branches, deliberately.** Each one
  -- joins the ordering that already exists around the row it touches:
  --
  --   a slip on a PAYMENT   payment, then booking
  --   a slip on a DEPOSIT   booking, then deposit
  --
  -- A payment slip takes the payment's lock first because verify_payment()
  -- does, and says so in as many words: "nothing else in this schema takes
  -- them in the opposite order". Attaching a slip and verifying the transfer
  -- it evidences are two things staff do to the same pair within seconds, so
  -- taking them booking-first here would deadlock on the ordinary case.
  --
  -- A deposit slip takes the BOOKING's lock first, and until 21 September 2026
  -- it did the opposite. The comment that stood here claimed verify_deposit()
  -- and top_up_booking_deposit() were deposit-then-booking; neither is, and
  -- nor are record_booking_deposit(), check_in_booking() or
  -- submit_public_payment(). All five take booking, then deposit. This was the
  -- only writer in the schema going the other way, which is exactly the shape
  -- of a deadlock: a customer sending their deposit slip while a clerk
  -- confirms that same deposit is two transactions holding one row each and
  -- waiting for the other's. Postgres settles that by aborting somebody's
  -- work, and the somebody is whoever the desk is serving.
  --
  -- Mixing the two directions is safe because no transaction ever holds a
  -- payment and a deposit at once, so there is no cycle between them: the
  -- pointer check below admits exactly one.

  -- ── The pointer belongs to this booking ─────────────────────────────
  --
  -- Without this a slip could be filed against a payment on somebody else's
  -- booking and would then be served to anyone who could view THAT booking.
  -- The constraint above knows a slip needs a payment or a deposit; only this
  -- knows whose.

  if p_kind = 'payment_slip' then
    if (p_payment_id is null) = (p_deposit_id is null) then
      -- Neither, or both. The constraint says exactly one; so does this, with a
      -- sentence instead of an exception.
      return jsonb_build_object('ok', false, 'error', 'pointer_missing');
    end if;
  end if;

  if p_kind = 'payment_slip' and p_payment_id is not null then
    select * into v_payment
    from payment
    where id = p_payment_id and property_id = p_property_id
    for update;

    if not found or v_payment.booking_id <> p_booking_id then
      return jsonb_build_object('ok', false, 'error', 'not_on_this_booking');
    end if;

    -- **[A]** A slip is a bank transfer's evidence. Cash is counted at the desk
    -- and has no slip to send, so attaching one to a cash payment is a filing
    -- mistake rather than a record. prd.md §10.4 is about transfers throughout.
    if v_payment.method <> 'bank_transfer' then
      return jsonb_build_object('ok', false, 'error', 'not_a_transfer');
    end if;

    -- Under the payment's lock, so two clerks confirming the same transfer
    -- queue rather than both writing. document_one_live_slip_per_payment
    -- refuses last.
    select * into v_existing
    from document
    where payment_id = p_payment_id
      and property_id = p_property_id
      and kind = 'payment_slip'
      and deleted_at is null;

    if found then
      if not (p_uploaded_by_customer and v_existing.uploaded_by is null) then
        return jsonb_build_object('ok', false, 'error', 'slip_already_attached');
      end if;
    end if;
  end if;

  -- The booking's lock, taken BEFORE the deposit's below and AFTER the
  -- payment's above. That asymmetry is the whole point of this migration —
  -- see the header. It is read as well as held: the retention anchor and the
  -- audit event below both come off it.
  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_kind = 'payment_slip' and p_deposit_id is not null then
    select * into v_deposit
    from deposit
    where id = p_deposit_id and property_id = p_property_id
    for update;

    if not found or v_deposit.booking_id <> p_booking_id then
      return jsonb_build_object('ok', false, 'error', 'not_on_this_booking');
    end if;

    -- The same rule the payment branch applies, and for the same reason: cash
    -- handed over at the desk has no slip. A deposit's method says how the
    -- money was FIRST seen and is deliberately not rewritten by a top-up
    -- (20260917000100), so a transfer that was later topped up in cash still
    -- has a transfer to evidence.
    if v_deposit.method <> 'bank_transfer' then
      return jsonb_build_object('ok', false, 'error', 'not_a_transfer');
    end if;

    select * into v_existing
    from document
    where deposit_id = p_deposit_id
      and property_id = p_property_id
      and kind = 'payment_slip'
      and deleted_at is null;

    if found then
      if not (p_uploaded_by_customer and v_existing.uploaded_by is null) then
        return jsonb_build_object('ok', false, 'error', 'slip_already_attached');
      end if;
    end if;
  end if;

  -- ── A customer's own identity document is replaced, not repeated ────────
  --
  -- There is no one-live-identity index and there must not be: a booking can
  -- legitimately hold several ICs, because the desk photographs the front and
  -- the back, and a family arriving together is more than one person. What must
  -- not accumulate is one guest retaking the same photograph, which is what the
  -- customer surface makes easy for the first time.
  --
  -- So the replacement is scoped to the customer's own: theirs supersedes
  -- theirs, and a staff member's is left exactly where it is.
  if p_uploaded_by_customer and p_kind = 'identity' then
    select * into v_existing
    from document
    where property_id = p_property_id
      and booking_id = p_booking_id
      and kind = 'identity'
      and uploaded_by is null
      and deleted_at is null;
  end if;

  -- ── A pack is refused by a newer pack ───────────────────────────────────
  --
  -- Under the booking's lock, so two assemblies of the same booking — the one
  -- a verification started and the one the nightly job started — settle here
  -- in turn. Whichever read its facts later is the one that stands, whatever
  -- order their uploads landed in; the older snapshot is refused, and its
  -- caller discards the object it uploaded.
  if p_kind = 'accounting_pack' and exists (
    select 1 from document
    where property_id = p_property_id
      and booking_id = p_booking_id
      and kind = 'accounting_pack'
      and deleted_at is null
      and assembled_from > p_assembled_from
  ) then
    return jsonb_build_object('ok', false, 'error', 'superseded_by_newer');
  end if;

  if p_kind = 'inspection_photo' then
    if p_inspection_id is null then
      return jsonb_build_object('ok', false, 'error', 'pointer_missing');
    end if;

    -- An inspection hangs off the occupancy, so "does this inspection belong to
    -- this booking" is a join rather than a column comparison.
    if not exists (
      select 1
      from inspection i
      join occupancy o on o.id = i.occupancy_id and o.property_id = i.property_id
      where i.id = p_inspection_id
        and i.property_id = p_property_id
        and o.booking_id = p_booking_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'not_on_this_booking');
    end if;
  elsif p_kind <> 'payment_slip'
    and (p_payment_id is not null or p_inspection_id is not null or p_deposit_id is not null)
  then
    return jsonb_build_object('ok', false, 'error', 'pointer_not_allowed');
  end if;

  -- ── The object actually landed ──────────────────────────────────────────
  --
  -- Storage keeps its objects in this same database, so "did the upload
  -- succeed" is a lookup rather than an act of faith. This is what makes a row
  -- pointing at nothing structurally impossible rather than merely unlikely,
  -- and it is why the size is read from here rather than believed from the
  -- caller.
  select (o.metadata ->> 'size')::bigint into v_object_size
  from storage.objects o
  where o.bucket_id = p_bucket_id and o.name = p_storage_key;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'object_missing');
  end if;

  -- Storage has not always written `size` into metadata; where it has not, the
  -- caller's figure stands rather than refusing an upload that succeeded.
  v_size := coalesce(v_object_size, p_byte_size)::integer;

  if v_size is null or v_size <= 0 then
    return jsonb_build_object('ok', false, 'error', 'object_empty');
  end if;

  -- ── When it stops being kept (capability G4) ────────────────────────────

  select months into v_months
  from document_retention
  where property_id = p_property_id and kind = p_kind;

  if v_months is null then
    return jsonb_build_object('ok', false, 'error', 'retention_unconfigured');
  end if;

  if p_kind = 'identity' then
    -- architecture.md §8: "identity docs 12 months after checkout". The anchor
    -- is the stay's last day, in the property's own timezone — a stay date is a
    -- calendar date there (architecture.md §5.1), so adding months to it and
    -- reading the result as UTC would move the expiry by eight hours and, at a
    -- month boundary, by a day.
    select p.time_zone into v_time_zone from property p where p.id = p_property_id;

    select o.end_date into v_end_date
    from occupancy o
    where o.booking_id = p_booking_id and o.property_id = p_property_id;

    if v_end_date is null then
      -- **[A]** A booking with no stay — a day pass (prd.md §6.1) — has no
      -- checkout to count from, so the clock starts when the document was
      -- taken. Recorded in prd.md §13; N22 asks the client what a cancelled
      -- booking's IC should do, which is the same question about an anchor that
      -- never arrives — and A7 makes it the likely case rather than the exotic
      -- one, because a guest can now upload an IC to a booking nobody ever pays
      -- for.
      v_retain_until := now() + make_interval(months => v_months);
    else
      v_retain_until := (v_end_date + make_interval(months => v_months))
        at time zone coalesce(v_time_zone, 'Asia/Brunei');
    end if;
  else
    -- A slip, a pack and a photograph all date from when they were taken: an
    -- accounting record's seven years run from the transaction, and a
    -- photograph's two from the inspection.
    v_retain_until := now() + make_interval(months => v_months);
  end if;

  -- ── The guest's own file, replaced before the new one lands ────────────
  --
  -- Before the insert rather than after it, because both slip indexes are
  -- UNIQUE: tombstoning afterwards would mean a moment — one statement long,
  -- but a real one — with two live slips against a payment or a deposit, and
  -- the index refuses that outright. A pack's index is not unique, which is
  -- why the block further down may run in the other order.
  --
  -- Still one transaction, so a failure anywhere below puts the guest's first
  -- file back exactly as it was. `deleted_by` stays null, as it does for a
  -- retention expiry: the customer is not a user, and a system act with a
  -- forged actor is worse than one with none (20260907000100's note on
  -- document_deletion_is_whole).
  if p_uploaded_by_customer and v_existing.id is not null then
    update document
    set deleted_at = now(), deleted_reason = 'superseded', deleted_by = null
    where id = v_existing.id and property_id = p_property_id;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, null, 'document.superseded', 'document', v_existing.id,
      jsonb_build_object(
        'kind', v_existing.kind,
        'booking_id', p_booking_id,
        'filename', v_existing.original_filename
      ),
      jsonb_build_object(
        'deleted_reason', 'superseded',
        'superseded_by', p_document_id,
        'by', 'customer'
      )
    );

    v_superseded := jsonb_build_array(
      jsonb_build_object(
        'id', v_existing.id,
        'bucket_id', v_existing.bucket_id,
        'storage_key', v_existing.storage_key
      )
    );
  end if;

  insert into document (
    id, property_id, kind, booking_id, payment_id, deposit_id, inspection_id,
    bucket_id, storage_key, original_filename, mime_type, byte_size,
    uploaded_by, retain_until, assembled_from
  )
  values (
    p_document_id, p_property_id, p_kind, p_booking_id, p_payment_id, p_deposit_id,
    p_inspection_id, p_bucket_id, p_storage_key, left(v_filename, 120), p_mime_type,
    v_size, p_actor_id, v_retain_until, p_assembled_from
  );

  if p_kind = 'payment_slip' and p_payment_id is not null then
    update payment
    set slip_document_id = p_document_id
    where id = p_payment_id and property_id = p_property_id;
  end if;

  if p_kind = 'payment_slip' and p_deposit_id is not null then
    update deposit
    set slip_document_id = p_document_id
    where id = p_deposit_id and property_id = p_property_id;
  end if;

  -- ── The pack this one replaces ──────────────────────────────────────────
  --
  -- In the same transaction as the insert, so there is never a moment with no
  -- live pack and never one with two. This one runs AFTER the insert and the
  -- customer's supersede above runs BEFORE it, and the difference is not
  -- stylistic: `document_live_pack_idx` is a plain index, while the two slip
  -- indexes are unique, so a second live slip cannot exist even for the
  -- statement between the insert and the tombstone.
  if p_kind = 'accounting_pack' then
    with older as (
      update document
      set deleted_at = now(), deleted_reason = 'superseded', deleted_by = p_actor_id
      where property_id = p_property_id
        and booking_id = p_booking_id
        and kind = 'accounting_pack'
        and deleted_at is null
        and id <> p_document_id
      returning id, bucket_id, storage_key, original_filename
    ),
    -- A data-modifying CTE always runs, referenced or not. `kind` is in the
    -- payload because the history panel reads it to name the document.
    logged as (
      insert into audit_event (
        property_id, actor_id, action, entity_type, entity_id, before, after
      )
      select
        p_property_id, p_actor_id, 'document.superseded', 'document', o.id,
        jsonb_build_object(
          'kind', 'accounting_pack',
          'booking_id', p_booking_id,
          'filename', o.original_filename
        ),
        jsonb_build_object('deleted_reason', 'superseded', 'superseded_by', p_document_id)
      from older o
      returning 1
    )
    select coalesce(
      jsonb_agg(jsonb_build_object('id', o.id, 'bucket_id', o.bucket_id, 'storage_key', o.storage_key)),
      '[]'::jsonb
    )
    into v_superseded
    from older o;
  end if;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'document.attached', 'document', p_document_id,
    null,
    jsonb_build_object(
      'kind', p_kind,
      'booking_id', p_booking_id,
      'booking_reference', v_booking.reference,
      'filename', left(v_filename, 120),
      'mime_type', p_mime_type,
      'byte_size', v_size,
      'retain_until', v_retain_until,
      -- What the history panel needs to say "the guest sent this" rather than
      -- naming nobody. Every other public write already audits with a null
      -- actor; this is the one where the difference is worth printing.
      'by', case when p_uploaded_by_customer then 'customer' else 'staff' end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'document_id', p_document_id,
    'byte_size', v_size,
    'retain_until', v_retain_until,
    'superseded', v_superseded
  );
end;
$function$;

-- Re-issued rather than assumed. `create or replace` keeps the privileges a
-- function already had, so these are belt and braces — and the belt is what
-- every other migration here wears.
revoke execute on function attach_document(
  uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, integer, uuid,
  timestamptz, uuid, boolean
) from public, anon, authenticated;

grant execute on function attach_document(
  uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, integer, uuid,
  timestamptz, uuid, boolean
) to service_role;
