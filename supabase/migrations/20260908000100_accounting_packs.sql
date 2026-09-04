-- ═══════════════════════════════════════════════════════════════════════════
-- Accounting packs (capability G5, prd.md §13 requirement 4, architecture.md
-- §8.2).
--
-- The documents slice (20260907000100) built the `accounting_pack` kind, its
-- bucket, its retention row and its constraints, and left it with no writer:
-- "a pack is written by nobody". This migration is what lets the system write
-- one — and, since a pack is rebuilt whenever what it records changes, what
-- lets it write the next one without leaving two on file.
--
-- Three things, and the middle one is the design:
--
-- 1. A third way a document can be tombstoned: `superseded`, by a newer pack.
-- 2. A watermark. `document.assembled_from` is the instant a pack's facts were
--    read — captured BEFORE the reads, so anything that changed during the
--    seconds of assembly is newer than the pack and the nightly job rebuilds
--    it. Compared against `uploaded_at` the same change would be invisible
--    forever: the upload lands after the render, so its timestamp is later
--    than the change it missed. Two assemblies in flight resolve the same way,
--    by snapshot age rather than by which insert landed last.
-- 3. The due-list: which bookings need a pack tonight.
--
-- attach_document() gains one argument and one branch. It is dropped and
-- recreated because `create or replace` cannot change a signature.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A pack replaced by a newer one is tombstoned, like everything else.
--
-- The trail references the row (20260907000100's header), so the old pack is
-- never deleted outright: it is tombstoned with a reason that says what
-- happened to it, and the nightly purge removes the object. Somebody asking
-- "what did the accountant get last month" can still find that a pack existed
-- and when it was replaced.
-- ═══════════════════════════════════════════════════════════════════════════

alter table document drop constraint document_deleted_reason_check;

alter table document add constraint document_deleted_reason_check
  check (deleted_reason in ('retention_expired', 'removed', 'superseded'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The watermark.
-- ═══════════════════════════════════════════════════════════════════════════

alter table document add column assembled_from timestamptz;

comment on column document.assembled_from is
  'For an accounting pack only: the instant its facts were read, captured before the reads (architecture.md §8.2). The due-list compares this, never uploaded_at, against what has changed since.';

-- Both-or-neither with the kind, the construction every other pair in this
-- schema uses. No pack exists yet, so there is nothing to backfill.
alter table document add constraint document_assembled_from_matches_kind
  check ((kind = 'accounting_pack') = (assembled_from is not null));

-- The live pack per booking, which the due-list and the supersede both look
-- up. Partial, because tombstoned packs are the majority once a booking has
-- been rebuilt a few times and nothing queries them by booking.
create index document_live_pack_idx
  on document (property_id, booking_id)
  where kind = 'accounting_pack' and deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. attach_document(), with a thirteenth argument.
--
-- Everything below the new branches is 20260907000100's function verbatim.
-- For every kind but a pack the argument is refused when present, so nothing
-- an existing caller does changes.
-- ═══════════════════════════════════════════════════════════════════════════

drop function attach_document(
  uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, integer, uuid
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
  p_assembled_from timestamptz default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_payment payment%rowtype;
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
  -- ── The pointer belongs to this booking ─────────────────────────────
  --
  -- Without this a slip could be filed against a payment on somebody else's
  -- booking and would then be served to anyone who could view THAT booking.
  -- The constraint above knows a slip needs a payment; only this knows whose.

  if p_kind = 'payment_slip' then
    if p_payment_id is null then
      return jsonb_build_object('ok', false, 'error', 'pointer_missing');
    end if;

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
    if exists (
      select 1 from document
      where payment_id = p_payment_id
        and property_id = p_property_id
        and kind = 'payment_slip'
        and deleted_at is null
    ) then
      return jsonb_build_object('ok', false, 'error', 'slip_already_attached');
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
    and (p_payment_id is not null or p_inspection_id is not null)
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
      -- **[A]** A booking with no stay — a day pass (prd.md §6.1), which
      -- nothing writes yet — has no checkout to count from, so the clock starts
      -- when the document was taken. Recorded in prd.md §13; N22 asks the
      -- client what a cancelled booking's IC should do, which is the same
      -- question about an anchor that never arrives.
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

  insert into document (
    id, property_id, kind, booking_id, payment_id, inspection_id,
    bucket_id, storage_key, original_filename, mime_type, byte_size,
    uploaded_by, retain_until, assembled_from
  )
  values (
    p_document_id, p_property_id, p_kind, p_booking_id, p_payment_id, p_inspection_id,
    p_bucket_id, p_storage_key, left(v_filename, 120), p_mime_type, v_size,
    p_actor_id, v_retain_until, p_assembled_from
  );

  if p_kind = 'payment_slip' then
    update payment
    set slip_document_id = p_document_id
    where id = p_payment_id and property_id = p_property_id;
  end if;

  -- ── The pack this one replaces ──────────────────────────────────────────
  --
  -- In the same transaction as the insert, so there is never a moment with no
  -- live pack and never one with two — a reader between the two statements
  -- would see either the old pack or the new, and a crash leaves whichever
  -- was committed. The objects behind the tombstoned rows are the caller's to
  -- delete afterwards, and the nightly purge's to retry.
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
      'retain_until', v_retain_until
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
-- 4. Which bookings need a pack.
--
-- A booking is due when it has money verified against it and either no live
-- pack, or a live pack whose watermark predates the newest of the things the
-- pack records:
--
--   - a payment being verified (payment.verified_at);
--   - a slip or an identity document being attached (document.uploaded_at,
--     live rows of those two kinds);
--   - a slip or an identity document being REMOVED by a person
--     (document.deleted_at where deleted_reason = 'removed');
--   - the booking itself changing (booking.updated_at — a status move, an
--     amendment, a discount).
--
-- What is deliberately NOT a source: an identity document expiring on its
-- retention clock. It is tombstoned twelve months after checkout, and if that
-- counted, every pack would fall due a year later and be rebuilt WITHOUT its
-- identity reference — a seven-year accounting record silently losing a page
-- because a different record reached the end of its own life. A pack states
-- what was on file when it was assembled, and a scheduled deletion elsewhere
-- does not change what was true then.
--
-- Photographs are not a source either: they belong to the deposit's record,
-- which the pack points at and does not carry (lib/domain/pack.ts).
--
-- Oldest change first, so a backlog is worked through in the order it arose,
-- and limited so a night's work is bounded. `greatest` ignores nulls.
-- ═══════════════════════════════════════════════════════════════════════════

create function bookings_due_accounting_pack(
  p_property_id uuid,
  p_limit integer default 25
)
returns table (booking_id uuid, changed_at timestamptz)
language sql
stable
as $function$
  with paid as (
    select b.id, b.updated_at, max(p.verified_at) as last_verified_at
    from booking b
    join payment p
      on p.booking_id = b.id
     and p.property_id = b.property_id
     and p.status = 'verified'
    where b.property_id = p_property_id
    group by b.id, b.updated_at
  ),
  changed as (
    select
      paid.id,
      greatest(
        paid.updated_at,
        paid.last_verified_at,
        (
          select max(d.uploaded_at)
          from document d
          where d.property_id = p_property_id
            and d.booking_id = paid.id
            and d.kind in ('identity', 'payment_slip')
            and d.deleted_at is null
        ),
        (
          select max(d.deleted_at)
          from document d
          where d.property_id = p_property_id
            and d.booking_id = paid.id
            and d.kind in ('identity', 'payment_slip')
            and d.deleted_reason = 'removed'
        )
      ) as changed_at
    from paid
  ),
  live_pack as (
    select d.booking_id, max(d.assembled_from) as assembled_from
    from document d
    where d.property_id = p_property_id
      and d.kind = 'accounting_pack'
      and d.deleted_at is null
    group by d.booking_id
  )
  select c.id, c.changed_at
  from changed c
  left join live_pack lp on lp.booking_id = c.id
  where lp.assembled_from is null or lp.assembled_from < c.changed_at
  order by c.changed_at
  limit greatest(coalesce(p_limit, 25), 1)
$function$;

comment on function bookings_due_accounting_pack is
  'Bookings whose accounting pack is missing or older than what it records (capability G5, architecture.md §8.2). Read by the nightly job.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. The clock the watermark is read from.
--
-- Every timestamp the due-list compares a pack's watermark against — a
-- payment's verified_at, a document's uploaded_at, a booking's updated_at —
-- was stamped by this database's now(). The watermark has to come from the
-- same clock: a function on one provider running a few seconds ahead of a
-- database on another would stamp a pack "newer" than a change that landed
-- after its reads, which is the one thing the watermark exists to prevent.
-- ═══════════════════════════════════════════════════════════════════════════

create function database_now()
returns timestamptz
language sql
stable
as $function$
  select now()
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Grants — service-role only, like every writer in this schema.
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function attach_document(
  uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, integer, uuid, timestamptz
) from public, anon, authenticated;
revoke execute on function bookings_due_accounting_pack(uuid, integer)
  from public, anon, authenticated;
revoke execute on function database_now() from public, anon, authenticated;

grant execute on function attach_document(
  uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, integer, uuid, timestamptz
) to service_role;
grant execute on function bookings_due_accounting_pack(uuid, integer) to service_role;
grant execute on function database_now() to service_role;
