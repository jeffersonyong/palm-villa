-- Documents and guest records (capabilities B10, G2, G3, G4).
--
-- scope-of-capabilities.md G2: "Identity documents are stored encrypted, in
-- private storage, and can only be viewed by roles explicitly granted access."
-- G3: "Every access to an identity document is logged: who viewed which
-- document, and when." G4: "Documents are kept under a configurable retention
-- policy and deleted automatically when it expires."
--
-- prd.md §2 lists the gap this closes as the fourth of the five the platform
-- exists for: "Guest data, including identity documents, accumulates
-- indefinitely in a folder on a computer with no retention or access control."
-- prd.md §13 is the normative rule set, and it sits under Brunei's Personal
-- Data Protection Order 2025, which commenced 1 January 2026.
--
-- architecture.md §8 is the design this implements, and it was written before
-- any of it existed. Three of its four sentences are met exactly; the fourth —
-- the accounting pack (G5) — is not built here, but its kind and its bucket
-- are, so that slice adds a writer rather than a schema.
--
-- ── Redeeming two notes earlier migrations left ───────────────────────────
--
-- 20260831000100 (payments) created `payment.slip_document_id` with no foreign
-- key and said why: "Reserved for the documents slice; no foreign key until the
-- document table exists." It exists below, and the key is added in part 4.
--
-- 20260906000100 (deposits) commented on the `inspection` table: "Photographic
-- evidence (prd.md §11 req 2, capability C2) arrives with the documents slice."
-- It arrives here, as `kind = 'inspection_photo'` pointing at an inspection.
--
-- ── One table, four kinds ─────────────────────────────────────────────────
--
-- prd.md §6.2 sketches `Document owner_type, owner_id, kind, storage_key,
-- retain_until` — a polymorphic owner. This uses **typed nullable pointers**
-- instead (`booking_id` always, plus `payment_id` or `inspection_id` where the
-- kind calls for one), because a polymorphic pair cannot carry a foreign key
-- and this schema's whole posture is that referential rules are the database's
-- job (architecture.md §5.1's composite keys, §5.2's exclusion constraint).
-- architecture.md supersedes the PRD's technical sketches where they differ,
-- and the as-built §8 records this one.
--
-- Every kind hangs off a booking. That is true of all four today and is NOT
-- true forever: a lease that ends can be inspected (the reason an inspection
-- hangs off an occupancy at all), and a tenancy agreement has no booking. Phase
-- three relaxes `booking_id` to nullable with an "exactly one owner" check, the
-- shape `occupancy.booking_id` already took in 20260904000100. Left NOT NULL
-- now rather than widened early, because a nullable column nothing can write is
-- the same mistake as an unread status column (architecture.md §5.1).
--
-- ── A deleted document is a tombstone ─────────────────────────────────────
--
-- Rows are never deleted, only marked: `deleted_at` with a reason, then
-- `purged_at` once the object itself is confirmed gone from Storage. Three
-- reasons, in order of weight. The audit trail references the document by id
-- and `audit_event` is append-only, so a hard delete would leave a trail
-- pointing at nothing. The two-step is what makes the delete **recoverable
-- rather than atomic**: Storage and Postgres are two systems and a crash
-- between them is a real state, so the row is tombstoned first (from that
-- instant nothing serves it) and the object removed second, with the nightly
-- job retrying whatever it did not finish. And G4 promises deletion, which is
-- about the file rather than the row — the bytes go, the record that they
-- existed and were destroyed stays, which is what a retention policy is for.
--
-- The one exception is a booking being deleted, which cascades. Nothing in the
-- product deletes a booking; the tests do.
--
-- Six parts, in dependency order.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The buckets (architecture.md §8: "private buckets only").
--
-- Created here rather than in supabase/config.toml, so there is one source of
-- truth that the local stack, a preview project and production all replay from
-- the same file. architecture.md §10: "No dashboard-only schema changes."
--
-- `public = false` is the whole of G2's access control at this layer: there is
-- no unauthenticated path to an object, and every read goes through a signed
-- URL issued server-side after a permission check (part 5 has no signing in it
-- — that is lib/db/documents.ts, because signing is not a database operation).
--
-- `allowed_mime_types` and `file_size_limit` are a backstop and NOT the
-- control. Storage checks the content type the *uploader declared*, which is a
-- claim by whoever is uploading; the real gate is `sniffMimeType()` in
-- lib/domain/document.ts, which reads the file's own header before any of this
-- is reached. Both are set anyway, because a limit the platform enforces costs
-- nothing and catches a caller that never asked the domain.
--
-- 4 MiB, matching MAX_DOCUMENT_BYTES. That constant's note explains why the
-- number is what it is: Vercel caps a function's request body at 4.5 MB and
-- `serverActions.bodySizeLimit` cannot raise it. The pack bucket is larger
-- because a pack is assembled server-side and never crosses that boundary.
--
-- Encryption at rest (G2) is Supabase Storage's own, on its S3 backend. There
-- is deliberately no application-level encryption: a key this application holds
-- would be a key on the same host as the data, which is a longer sentence in a
-- report and not a stronger control.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'identity-docs', 'identity-docs', false, 4194304,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ),
  (
    'payment-slips', 'payment-slips', false, 4194304,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ),
  (
    'inspection-photos', 'inspection-photos', false, 4194304,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'packs', 'packs', false, 26214400,
    array['application/pdf']
  )
on conflict (id) do nothing;

-- No policies on storage.objects, and that is deliberate rather than
-- unfinished. The service-role client is the only thing that ever touches
-- Storage (architecture.md §2: the browser never holds a data-access client),
-- and it bypasses RLS. A policy here would be the first thing in this schema
-- granting `anon` or `authenticated` a path to an object, which is the opposite
-- of what G2 promises.

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. How long each kind is kept (capability G4, architecture.md §8, §11).
--
-- Rows rather than constants, for the reason §11 gives about every other
-- policy figure: "rates, fees, policies, facilities, retention periods and hold
-- durations are rows in per-property config, never constants." G4 says
-- "configurable" to the client in as many words, and F3 is the screen that will
-- edit them. That screen is not built here — this slice ships the defaults
-- architecture.md §8 already states, and F3 stays a planned screen.
--
-- The defaults, and where each comes from:
--   identity          12 months after checkout   (§8; the anchor is the stay)
--   payment_slip      84 months = 7 years        (§8, accounting records)
--   accounting_pack   84 months = 7 years        (§8, same)
--   inspection_photo  24 months                  (§8)
--
-- attach_document() REFUSES rather than defaulting when a kind has no row. A
-- default hidden in a function is a retention period nobody agreed, applied to
-- somebody's identity document — and the failure mode of refusing is a visible
-- error at a desk, where the failure mode of guessing is silent and legal.
--
-- Changing a row affects new uploads only. Nothing back-applies a changed
-- period to documents already stored, because `retain_until` is the promise
-- made when the document was taken; whether F3 should offer to re-anchor
-- existing rows is a question for that screen.
-- ═══════════════════════════════════════════════════════════════════════════

create table document_retention (
  property_id uuid not null references property (id) on delete cascade,
  kind text not null check (
    kind in ('identity', 'payment_slip', 'inspection_photo', 'accounting_pack')
  ),
  months integer not null check (months > 0),
  updated_at timestamptz not null default now(),
  primary key (property_id, kind)
);

comment on table document_retention is
  'Per-property retention periods (capability G4, architecture.md §8, §11). Edited by capability F3; attach_document() refuses a kind with no row rather than defaulting.';

alter table document_retention enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The document itself.
--
-- One row per stored object, whatever the kind. `storage_key` is unique across
-- the table rather than per bucket: keys carry a uuid, so a collision would be
-- a bug rather than a coincidence, and a single unique index is what makes the
-- orphan sweep's "is this object known?" one lookup.
--
-- `byte_size` and `mime_type` are what the object ACTUALLY is — attach_document
-- reads the size from storage.objects rather than believing the caller, and the
-- mime type comes from sniffing the file's header, never from the browser. The
-- filename is display text and nothing else; it is sanitised on the way in and
-- never appears in a key or a path.
-- ═══════════════════════════════════════════════════════════════════════════

create table document (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,

  -- Mirrors DOCUMENT_KINDS in lib/domain/document.ts. A check rather than an
  -- enum, like every other vocabulary here: widening a check is a one-line
  -- migration where widening an enum is not.
  kind text not null check (
    kind in ('identity', 'payment_slip', 'inspection_photo', 'accounting_pack')
  ),

  -- Every kind belongs to a booking today. See the header for what phase three
  -- has to relax and why it is not relaxed now.
  booking_id uuid not null,

  -- The second owner, where the kind has one. Exactly one of these is set for
  -- a slip or a photograph, and neither for an IC or a pack.
  payment_id uuid,
  inspection_id uuid,

  bucket_id text not null,
  storage_key text not null unique,

  -- Sanitised by sanitiseFilename() before it arrives — path separators and
  -- control characters removed, length capped. Kept only so a screen can name
  -- the file and a person can recognise it.
  original_filename text not null,
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  byte_size integer not null check (byte_size > 0),

  uploaded_by uuid references auth.users (id),
  uploaded_at timestamptz not null default now(),

  -- When this stops being kept (capability G4). Computed at upload from
  -- document_retention, and re-anchored for an identity document if the stay's
  -- end date moves (part 6).
  retain_until timestamptz not null,

  -- The tombstone. See the header for why a document is never deleted outright.
  deleted_at timestamptz,
  deleted_reason text check (deleted_reason in ('retention_expired', 'removed')),
  deleted_by uuid references auth.users (id),
  -- Set once the OBJECT is confirmed gone from Storage, which is a second
  -- system and a second failure. A tombstoned row with no purge is the nightly
  -- job's retry queue.
  purged_at timestamptz,

  unique (property_id, id),

  foreign key (property_id, booking_id) references booking (property_id, id) on delete cascade,
  foreign key (property_id, payment_id) references payment (property_id, id) on delete cascade,
  foreign key (property_id, inspection_id) references inspection (property_id, id) on delete cascade,

  -- A slip points at a payment, a photograph at an inspection, and the other
  -- two at neither. Without this a slip could be filed against an inspection,
  -- which would put a bank screenshot behind the housekeeping permission and
  -- out of the queue that needs it.
  constraint document_pointer_matches_kind check (
    (kind = 'payment_slip' and payment_id is not null and inspection_id is null)
    or (kind = 'inspection_photo' and inspection_id is not null and payment_id is null)
    or (
      kind in ('identity', 'accounting_pack')
      and payment_id is null
      and inspection_id is null
    )
  ),

  -- BUCKET_FOR_KIND in lib/domain/document.ts, said again in SQL. A kind maps
  -- to exactly one bucket, so a mismatched pair is a document retained on one
  -- schedule and read under another permission — the two facts a reader would
  -- take from the bucket name are both wrong, and neither is visible on screen.
  constraint document_bucket_matches_kind check (
    bucket_id = case kind
      when 'identity' then 'identity-docs'
      when 'payment_slip' then 'payment-slips'
      when 'inspection_photo' then 'inspection-photos'
      when 'accounting_pack' then 'packs'
    end
  ),

  constraint document_filename_length check (
    btrim(original_filename) <> '' and length(original_filename) <= 120
  ),

  -- The both-or-neither pair, the construction unit_out_of_service_is_whole
  -- and booking_discount_is_whole both use. `deleted_by` is deliberately NOT
  -- in it: retention expiry is performed by nobody, and a system act with a
  -- forged actor is worse than one with none.
  constraint document_deletion_is_whole check ((deleted_at is null) = (deleted_reason is null)),

  -- Nothing is purged that was not first tombstoned, or a live document could
  -- be a row pointing at an object that is already gone.
  constraint document_purge_needs_deletion check (purged_at is null or deleted_at is not null)
);

-- **One live slip per payment**, structurally.
--
-- attach_document() takes the payment's row lock and refuses a second slip with
-- a sentence a clerk can act on; this is what makes it impossible rather than
-- unlikely when two people confirm the same transfer at once. The same
-- construction as payment_mismatch_needs_reason: the code refuses first, the
-- constraint refuses last.
--
-- Partial on `deleted_at is null`, so removing a slip and attaching a corrected
-- one is an ordinary thing to do.
create unique index document_one_live_slip_per_payment
  on document (payment_id)
  where kind = 'payment_slip' and deleted_at is null;

-- The three questions asked of this table. The first is every screen's — what
-- is on file for this booking — and it is the one that must stay fast.
create index document_booking_idx on document (property_id, booking_id, uploaded_at)
  where deleted_at is null;

-- The retention job's scan (capability G4).
create index document_retention_due_idx on document (property_id, retain_until)
  where deleted_at is null;

-- The retry queue: tombstoned, object not yet confirmed gone.
create index document_unpurged_idx on document (property_id, deleted_at)
  where deleted_at is not null and purged_at is null;

-- 20260829000800 enumerates the tables it enables RLS on, so a table created
-- afterwards is not covered by it. Enabled with no policies: deny-all for anon
-- and authenticated, bypassed by the service-role client, authorisation in
-- requirePermission() (architecture.md §4).
alter table document enable row level security;

comment on table document is
  'One row per stored file (architecture.md §8). Never hard-deleted: deleted_at tombstones the row, purged_at records that the object itself is gone.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The slip column gets its key.
--
-- 20260831000100 created `payment.slip_document_id` without one because the
-- table it pointed at did not exist. `on delete set null` rather than cascade:
-- removing a slip must not remove the payment it was evidence for.
--
-- The column is redundant with `document.payment_id` and is kept anyway,
-- because `payment_summary` already selects it and the verification queue reads
-- that view — a join per queue row to answer "is there a slip" would be a read
-- added to the screen prd.md §20 measures at under 30 seconds per booking. The
-- two are kept in step by attach_document() and remove_document(), which are
-- the only writers of either.
-- ═══════════════════════════════════════════════════════════════════════════

alter table payment
  add constraint payment_slip_document_fkey
  foreign key (property_id, slip_document_id) references document (property_id, id)
  on delete set null;

comment on column payment.slip_document_id is
  'The transfer slip on file, or null (prd.md §10.4: evidence, not verification). Written only by attach_document() and remove_document().';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Attaching, removing and expiring.
--
-- The same shape as every other writer in this schema: lock first, validate
-- everything, then write, returning a refusal as a VALUE rather than raising —
-- a `return` in plpgsql does not roll back, so a guard that fired after an
-- insert would leave the insert behind it.
--
-- What is NOT here: signing a URL, uploading bytes, deleting an object. Those
-- are Storage API calls and live in lib/db/documents.ts. In particular this
-- file never deletes from `storage.objects` — the row would go and the backing
-- file would survive, which is the one outcome a retention policy cannot have.
-- ═══════════════════════════════════════════════════════════════════════════

-- The object is uploaded BEFORE this is called, and its key is derived from the
-- document id, which is why the id is a parameter rather than generated here.
-- The order is deliberate: a row pointing at nothing is a broken link on a
-- screen, where an object with no row is invisible and swept up by the nightly
-- job. This function then checks the object actually landed, so the first case
-- cannot happen at all.
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
  p_actor_id uuid default null
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
    uploaded_by, retain_until
  )
  values (
    p_document_id, p_property_id, p_kind, p_booking_id, p_payment_id, p_inspection_id,
    p_bucket_id, p_storage_key, left(v_filename, 120), p_mime_type, v_size,
    p_actor_id, v_retain_until
  );

  if p_kind = 'payment_slip' then
    update payment
    set slip_document_id = p_document_id
    where id = p_payment_id and property_id = p_property_id;
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
    'retain_until', v_retain_until
  );
end;
$function$;

-- Removing one by hand. The tombstone is written here; the object is deleted by
-- the caller afterwards, and the bucket and key are returned so it can be.
create function remove_document(
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

-- The nightly job's first half (capability G4).
--
-- One statement rather than one call per document: a property with a year of
-- trading behind it can have a day's worth of identity documents fall due
-- together, and a round trip each would make the job's duration a function of
-- how busy last September was.
--
-- `skip locked` so a run that overlaps a removal does not block on it; the
-- skipped row is due again in a second.
create function expire_due_documents(
  p_property_id uuid,
  p_now timestamptz default now(),
  p_limit integer default 200
)
returns jsonb
language plpgsql
as $function$
declare
  v_documents jsonb;
begin
  with due as (
    select d.id
    from document d
    where d.property_id = p_property_id
      and d.deleted_at is null
      and d.retain_until <= p_now
    order by d.retain_until
    limit greatest(coalesce(p_limit, 200), 1)
    for update skip locked
  ),
  expired as (
    update document d
    set deleted_at = now(), deleted_reason = 'retention_expired'
    from due
    where d.id = due.id
    returning d.id, d.kind, d.booking_id, d.bucket_id, d.storage_key, d.retain_until
  ),
  -- A data-modifying CTE always runs, referenced or not. The actor is null
  -- because nobody did this: EventHistory renders that as the system.
  logged as (
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    select
      p_property_id, null, 'document.expired', 'document', e.id,
      jsonb_build_object('kind', e.kind, 'booking_id', e.booking_id),
      jsonb_build_object('deleted_reason', 'retention_expired', 'retain_until', e.retain_until)
    from expired e
    returning 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', e.id, 'bucket_id', e.bucket_id, 'storage_key', e.storage_key)
    ),
    '[]'::jsonb
  )
  into v_documents
  from expired e;

  return jsonb_build_object('ok', true, 'documents', v_documents);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. An identity document's clock follows the stay.
--
-- architecture.md §8 says identity documents are kept "12 months after
-- checkout", and a booking's checkout can move: amend_booking() reprices a stay
-- and rewrites its occupancy. Without this, extending a stay by a week leaves
-- the IC expiring a week early — quietly, and in the direction that deletes
-- somebody's record before the period they were promised.
--
-- A trigger on the occupancy rather than a statement inside amend_booking(),
-- which has been re-created three times already and is the wrong place for a
-- rule that belongs to a date rather than to an amendment. It fires for any
-- writer that moves an end date, including one nobody has written yet.
--
-- A lease has no booking, so the guard skips it: there are no documents on an
-- occupancy that no booking owns, and phase three's tenancy agreement will need
-- its own anchor anyway.
-- ═══════════════════════════════════════════════════════════════════════════

create function refresh_identity_document_retention()
returns trigger
language plpgsql
as $function$
declare
  v_months integer;
  v_time_zone text;
begin
  if new.booking_id is null or new.end_date is null then
    return new;
  end if;

  select months into v_months
  from document_retention
  where property_id = new.property_id and kind = 'identity';

  if v_months is null then
    return new;
  end if;

  select p.time_zone into v_time_zone from property p where p.id = new.property_id;

  update document
  set retain_until = (new.end_date + make_interval(months => v_months))
    at time zone coalesce(v_time_zone, 'Asia/Brunei')
  where property_id = new.property_id
    and booking_id = new.booking_id
    and kind = 'identity'
    and deleted_at is null;

  return new;
end;
$function$;

create trigger occupancy_refreshes_identity_retention
  after update of end_date on occupancy
  for each row
  when (new.end_date is distinct from old.end_date)
  execute function refresh_identity_document_retention();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Grants.
--
-- Service-role only, like every other writer in this schema: the data client is
-- the only caller and authorisation happens above it, in requirePermission()
-- (architecture.md §4).
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function attach_document(
  uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, integer, uuid
) from public, anon, authenticated;
revoke execute on function remove_document(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function expire_due_documents(uuid, timestamptz, integer)
  from public, anon, authenticated;

grant execute on function attach_document(
  uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, integer, uuid
) to service_role;
grant execute on function remove_document(uuid, uuid, uuid) to service_role;
grant execute on function expire_due_documents(uuid, timestamptz, integer) to service_role;
