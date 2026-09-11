-- ═══════════════════════════════════════════════════════════════════════════
-- A slip the customer sent, and a deposit to hang it on (capabilities A6, A7)
--
-- Two things arrive together because they are one path. A customer who has
-- transferred wants to send the screenshot (A6) and the IC the desk would
-- otherwise chase over WhatsApp (A7), and both travel the same way: through the
-- booking's own access token, into the same private buckets, under the same
-- sniffing and the same retention clock as a staff upload. What changes here is
-- who may be at the other end of it.
--
-- ── The obstacle A6 had to clear first (N39) ───────────────────────────────
--
-- A slip hangs off a PAYMENT id, and a deposit is deliberately not a payment
-- (prd.md §9.1, §11 — "it lives on `deposit` rather than as a kind of
-- `payment`, and that is the decision the whole design turns on"). Every online
-- stay booking pays the deposit and nothing else, so until now a customer's
-- screenshot of the one transfer they were asked to make had nowhere to live.
-- The payments queue printed a sentence saying so rather than "None".
--
-- N39's own assumed-meanwhile named the fix — "it is a column and a permission
-- mapping whenever A6 lands" — and this is that column.
--
-- **It is not a fifth kind.** A deposit slip is a transfer slip: the same
-- `payment-slips` bucket, the same seven-year accounting clock, the same
-- `booking.view` to open it, the same "evidence, not verification" rule
-- (prd.md §10.4). A fifth kind would mint a bucket, a `document_retention` row
-- and a label for a file identical in every respect but the row it points at —
-- and it would silently drop out of `accounting_pack_changed_at`, which asks
-- for `kind in ('identity', 'payment_slip')` and would go on believing a pack
-- was current after a slip was added to it. The pointer is what differs, so the
-- pointer is what this changes.
--
-- ── What a customer may do, and the one thing they may not ─────────────────
--
-- `p_uploaded_by_customer` is not a permission. There is no permission here:
-- the 128-bit access token IS the credential (architecture.md §4a), and
-- `requirePermission` cannot express an anonymous caller. What the flag decides
-- is narrower — whether this upload may replace the last one.
--
-- A customer retakes a photograph of an IC that came out dark, and the second
-- one must supersede the first rather than pile up beside it or be refused. A
-- staff member's file is never touched by a customer: where a clerk has already
-- filed the slip a guest sent them over WhatsApp, the customer's upload is
-- refused and the page tells them it is already on file, which is true.
--
-- `uploaded_by is null` is what separates the two, and it is exact rather than
-- convenient: a staff attach always carries the actor `requirePermission`
-- returned, and `uploaded_by` references `auth.users` with no ON DELETE, so the
-- row cannot be orphaned into looking like a customer's later.
--
-- **Nothing here lets a customer open anything.** Reading a document is a
-- signed URL issued after a permission check (architecture.md §8), and no
-- customer holds a permission. A token travels in forwarded WhatsApp messages;
-- it must never hand back somebody's IC.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The second pointer.
--
-- The shape `payment_id` and `inspection_id` already use: a typed column with a
-- composite foreign key, never a polymorphic (owner_type, owner_id) pair —
-- architecture.md §8.1 spends a paragraph on why, and the reason is that a
-- polymorphic pair cannot carry a foreign key and so cannot be made to point at
-- something that exists.
-- ═══════════════════════════════════════════════════════════════════════════

alter table document add column deposit_id uuid;

alter table document
  add constraint document_deposit_fkey
  foreign key (property_id, deposit_id) references deposit (property_id, id)
  on delete cascade;

comment on column document.deposit_id is
  'The deposit a transfer slip evidences, where the money was the security deposit rather than a booking payment (N39). Exactly one of payment_id / deposit_id is set on a slip.';

-- **Exactly one of the two**, not at least one.
--
-- A slip evidences one transfer of one sum. A row carrying both pointers would
-- be claiming to be the evidence for two different moneys — and since a
-- customer paying "everything" sends BND 700 once against a BND 100 deposit and
-- a BND 600 stay (prd.md §10.3: "two rows for one transfer, and they stay
-- two"), that is exactly the mistake available to be made. Two rows for one
-- transfer means two documents, each pointing at its own.
alter table document drop constraint document_pointer_matches_kind;

alter table document
  add constraint document_pointer_matches_kind check (
    (
      kind = 'payment_slip'
      and (payment_id is not null) <> (deposit_id is not null)
      and inspection_id is null
    )
    or (
      kind = 'inspection_photo'
      and inspection_id is not null
      and payment_id is null
      and deposit_id is null
    )
    or (
      kind in ('identity', 'accounting_pack')
      and payment_id is null
      and deposit_id is null
      and inspection_id is null
    )
  );

-- The mirror of document_one_live_slip_per_payment, for the same reason: the
-- function refuses first under the deposit's row lock, and this refuses last
-- when two callers race. Partial on `deleted_at is null`, so removing a slip
-- and attaching a corrected one stays an ordinary thing to do.
create unique index document_one_live_slip_per_deposit
  on document (deposit_id)
  where kind = 'payment_slip' and deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The deposit's own copy of the pointer.
--
-- Redundant with document.deposit_id and kept anyway, for the reason the
-- payment's copy is kept (20260907000100 §4): the verification queue reads
-- `deposit_summary`, and answering "is there a slip" with a join per queue row
-- would add a read to the screen prd.md §20 measures. The two are kept in step
-- by attach_document() and remove_document(), the only writers of either.
-- ═══════════════════════════════════════════════════════════════════════════

alter table deposit add column slip_document_id uuid;

alter table deposit
  add constraint deposit_slip_document_fkey
  foreign key (property_id, slip_document_id) references document (property_id, id)
  on delete set null;

comment on column deposit.slip_document_id is
  'The transfer slip on file for this deposit, or null (N39). Written only by attach_document() and remove_document().';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. attach_document(), with a fourteenth and fifteenth argument.
--
-- Re-created rather than altered, which is what 20260908000100 did to add
-- `p_assembled_from`; everything not called out in the comments below is that
-- function verbatim. Both new arguments default, so no existing caller changes.
-- ═══════════════════════════════════════════════════════════════════════════

drop function attach_document(
  uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, integer, uuid, timestamptz
);

create function attach_document(
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
  -- A slip takes the PAYMENT's lock before the booking's, because
  -- verify_payment() takes them in that order and says so in as many words:
  -- "nothing else in this schema takes them in the opposite order". Attaching
  -- the slip and verifying the transfer it evidences are two things staff do to
  -- the same pair of rows within seconds of each other, so taking them
  -- booking-first here would deadlock on the ordinary case rather than the
  -- exotic one — and Postgres settles a deadlock by aborting somebody's work.
  --
  -- A slip on a DEPOSIT takes the deposit's lock first for the same reason and
  -- in the same direction: verify_deposit() and top_up_booking_deposit() both
  -- take deposit-then-booking (20260913000200, 20260917000100), so this joins
  -- an ordering that already exists rather than introducing a second one.
  --
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

  -- The booking is locked second, or alone for a kind that points at no
  -- payment. It is read as well as held: the retention anchor and the audit
  -- event below both come off it.
  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. remove_document(), which now has two columns to keep in step.
--
-- Everything but the deposit branch is 20260907000100's function verbatim.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function remove_document(
  p_property_id uuid,
  p_document_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_document document%rowtype;
begin
  select * into v_document
  from document
  where id = p_document_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_document.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_removed');
  end if;

  update document
  set deleted_at = now(), deleted_reason = 'removed', deleted_by = p_actor_id
  where id = p_document_id and property_id = p_property_id;

  -- Kept in step with document.payment_id — see the note on the column.
  if v_document.payment_id is not null then
    update payment
    set slip_document_id = null
    where property_id = p_property_id and slip_document_id = p_document_id;
  end if;

  -- And with document.deposit_id, for the same reason (N39).
  if v_document.deposit_id is not null then
    update deposit
    set slip_document_id = null
    where property_id = p_property_id and slip_document_id = p_document_id;
  end if;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'document.removed', 'document', p_document_id,
    jsonb_build_object(
      'kind', v_document.kind,
      'booking_id', v_document.booking_id,
      'filename', v_document.original_filename
    ),
    jsonb_build_object('deleted_reason', 'removed')
  );

  return jsonb_build_object(
    'ok', true,
    'bucket_id', v_document.bucket_id,
    'storage_key', v_document.storage_key
  );
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. deposit_summary, with the slip on it.
--
-- 20260917000100's view with one column added, for the reason the payment's
-- copy of the pointer exists at all: the verification queue reads this view,
-- and "is there a slip" has to be answerable without a join per row.
--
-- Re-stated in full rather than altered because a view's column list cannot be
-- extended in place, which is the same reason that migration re-stated it.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view deposit_summary
with (security_invoker = true)
as
select
  d.id,
  d.property_id,
  d.booking_id,
  b.reference as booking_reference,
  b.status as booking_status,
  g.name as guest_name,
  g.phone as guest_phone,
  o.id as occupancy_id,
  o.unit_id,
  u.ref as unit_ref,
  o.start_date as check_in,
  o.end_date as check_out,

  d.amount_cents,
  d.method,
  d.collected_by,
  d.collected_at,

  i.id as inspection_id,
  i.outcome as inspection_outcome,
  i.notes as inspection_notes,
  i.inspected_by,
  i.inspected_at,

  coalesce(c.charges_total_cents, 0)::integer as charges_total_cents,
  coalesce(c.charge_count, 0)::integer as charge_count,

  d.released_at,
  d.released_by,
  d.release_note,
  d.released_amount_cents,
  d.charges_total_cents as approved_charges_total_cents,
  d.owed_cents,

  d.owed_settled_at,
  d.owed_settled_by,
  d.owed_settled_method,

  d.promised_at,
  d.observed_reference,
  d.observed_sender,
  d.observed_on,
  d.amount_override_reason,

  -- What the booking quotes, beside what is held. The pair is the shortfall.
  b.security_deposit_cents as quoted_cents,

  -- Appended rather than slotted in beside `collected_at` where it belongs:
  -- `create or replace view` may add a column at the end and may not rename
  -- one, so inserting it mid-list renames every column after it and Postgres
  -- refuses. The same reason `quoted_cents` above sits here.
  d.slip_document_id
from deposit d
join booking b on b.id = d.booking_id
join guest g on g.id = b.guest_id
left join occupancy o on o.booking_id = b.id
left join unit u on u.id = o.unit_id
left join inspection i on i.occupancy_id = o.id
left join lateral (
  select
    sum(dc.amount_cents) as charges_total_cents,
    count(*) as charge_count
  from deposit_charge dc
  where dc.deposit_id = d.id and dc.waived_at is null
) c on true;
-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Grants.
--
-- Re-stated because section 3 dropped and re-created the function, which drops
-- its grants with it. The service-role client is the only thing that calls
-- these; authorisation is requirePermission() in the server layer, or — for the
-- two public callers — the access token (architecture.md §4, §4a).
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function attach_document(
  uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, integer, uuid,
  timestamptz, uuid, boolean
) from public, anon, authenticated;

grant execute on function attach_document(
  uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, integer, uuid,
  timestamptz, uuid, boolean
) to service_role;
