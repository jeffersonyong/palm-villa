-- ═══════════════════════════════════════════════════════════════════════════
-- The photographs on the public site (capability F7; architecture.md §8).
--
-- The landing page has shown a labelled placeholder where every photograph
-- belongs since it was built. This is the images and the way to manage them,
-- together: staff add, replace, reframe and remove the photographs from the
-- portal, and a repaint or a new photo shoot stops being a developer deploy.
--
-- ── The one public bucket, and why it is deliberate ───────────────────────
--
-- architecture.md §8 has always said "private buckets only", and this is the
-- exception it named in advance. A marketing photograph inverts every rule the
-- four document buckets run on: it is public, cached and served to anonymous
-- visitors, with no signed URL, no permission check on read and no access log.
-- And the one that would do real damage if it were inherited — it has **no
-- retain_until**, because the nightly job that deletes a guest's IC on schedule
-- would otherwise delete the front page.
--
-- So it is a separate bucket over a separate table, not a kind on `document`,
-- and `document_retention.kind` stays the closed four-value check that makes
-- the second mistake impossible. Writing is permission-gated like every other
-- portal action (`site_image.manage`); only reading is open.
--
-- ── What a row is ─────────────────────────────────────────────────────────
--
-- One photograph that was, or is, on the site. **One current photograph per
-- place**, enforced by a partial unique index, and a replaced or removed one is
-- retired rather than deleted: the audit trail points at its id, and a
-- retirement records who took it down. Its OBJECT does not survive retirement.
-- A public bucket serves anything in it to anyone holding the URL, so "removed
-- from the site" has to mean the file is gone, and lib/db/site-images.ts deletes
-- it straight after the write, with the nightly sweep retrying a deletion that
-- did not finish.
--
-- A place is one of three things, as typed pointers rather than a polymorphic
-- pair, for the reason architecture.md §8.1 gives about `document`: a pointer
-- can carry a foreign key.
--
-- - a **unit type** or a **facility** — a row already, with a slug a rename
--   never moves. Both foreign keys cascade: F3 hard-deletes a facility
--   (save_day_pass_settings, 20260912000100), and a photograph must not stop
--   Property settings from saving. The cascaded row's object is swept.
-- - a **slot** — the hero or one of the four "Follow along" tiles, which hang
--   off nothing.
--
-- Six parts, in dependency order.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The bucket.
--
-- `public = true` changes one thing: Storage answers the unauthenticated
-- `/object/public/site-images/…` GET. It grants no write path — there are still
-- no policies on storage.objects, and the service-role client is still the only
-- thing that uploads or deletes (20260907000100 part 1).
--
-- 4 MiB and the three image types, matching MAX_SITE_IMAGE_BYTES and
-- SITE_IMAGE_MIME_TYPES. A backstop, not the control: the real gate is
-- checkSiteImageUpload(), which reads the file's own header.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-images', 'site-images', true, 4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The table.
-- ═══════════════════════════════════════════════════════════════════════════

create table site_image (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,

  -- Where it belongs: exactly one of the three (site_image_one_place).
  -- Mirrors SITE_IMAGE_SLOTS in lib/domain/site-image.ts.
  slot text check (slot in ('hero', 'feed-1', 'feed-2', 'feed-3', 'feed-4')),
  unit_type_id uuid,
  facility_id uuid,

  -- `{propertyId}/{imageId}.{ext}`, a fresh uuid every upload and never
  -- overwritten, so a replaced photograph is a new URL and no cache can serve
  -- the old one in its place.
  storage_key text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 4194304),

  -- What the photograph shows, for somebody who cannot see it. One sentence,
  -- folded to one line by place_site_image() and checkAltText().
  alt_text text not null check (btrim(alt_text) <> '' and char_length(alt_text) <= 200),

  -- Which part stays in view when the site crops it. Mirrors SITE_IMAGE_FOCUS.
  focus text not null default 'center' check (
    focus in (
      'top-left', 'top', 'top-right', 'left', 'center', 'right',
      'bottom-left', 'bottom', 'bottom-right'
    )
  ),

  -- Always a person: the system never puts a photograph on the site. A staff
  -- account with rows here cannot be deleted, which is the history rule
  -- lib/db/staff.ts already applies and this foreign key backs up.
  uploaded_by uuid not null references auth.users (id),
  uploaded_at timestamptz not null default now(),

  -- Retirement, not deletion — see the header.
  retired_at timestamptz,
  retired_reason text check (retired_reason in ('replaced', 'removed')),
  retired_by uuid references auth.users (id),
  -- Set once the OBJECT is confirmed gone from Storage. A retired row with no
  -- purge is the sweep's retry queue.
  purged_at timestamptz,

  unique (property_id, id),

  foreign key (property_id, unit_type_id) references unit_type (property_id, id) on delete cascade,
  foreign key (property_id, facility_id) references facility (property_id, id) on delete cascade,

  constraint site_image_one_place check (num_nonnulls(slot, unit_type_id, facility_id) = 1),

  -- The both-or-neither pair document_deletion_is_whole uses.
  constraint site_image_retirement_is_whole check ((retired_at is null) = (retired_reason is null)),

  -- Nothing is purged that was not first retired, or a current photograph
  -- could be a row pointing at an object that is already gone.
  constraint site_image_purge_needs_retirement check (purged_at is null or retired_at is not null)
);

-- **One current photograph per place**, structurally. place_site_image() takes
-- an advisory lock and refuses a stale write with a sentence; these make a
-- second current photograph impossible rather than unlikely.
create unique index site_image_one_current_slot
  on site_image (property_id, slot)
  where retired_at is null and slot is not null;

create unique index site_image_one_current_unit_type
  on site_image (property_id, unit_type_id)
  where retired_at is null and unit_type_id is not null;

create unique index site_image_one_current_facility
  on site_image (property_id, facility_id)
  where retired_at is null and facility_id is not null;

-- The sweep's retry queue: retired, object not yet confirmed gone.
create index site_image_unpurged_idx on site_image (property_id, retired_at)
  where retired_at is not null and purged_at is null;

-- Enabled with no policies, like every table since 20260829000800 — and see
-- 20260920000100 for the two that were missed. The rows are public in
-- substance, but they are read through lib/db like everything else; the anon
-- key has no business with this table.
alter table site_image enable row level security;

comment on table site_image is
  'The photographs on the public site (capability F7, architecture.md §8). One current row per place; replaced and removed rows are retired, and their objects deleted from the public site-images bucket. Never carries a retention period.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A photograph's place, in words.
--
-- Written into every audit event as `name`, so the trail can still say which
-- photograph it was once the row has cascaded away with its facility — and read
-- by audit_event_summary while the row exists, so a renamed facility shows its
-- new name. The slot wording mirrors slotLabel() in lib/domain/site-image.ts.
-- ═══════════════════════════════════════════════════════════════════════════

create function site_image_name(p_slot text, p_unit_type_id uuid, p_facility_id uuid)
returns text
language sql
stable
as $function$
  select case
    when p_slot = 'hero' then 'Front page'
    when p_slot like 'feed-%' then 'Follow along — tile ' || substr(p_slot, 6)
    when p_unit_type_id is not null then (select t.name from unit_type t where t.id = p_unit_type_id)
    when p_facility_id is not null then (select f.name from facility f where f.id = p_facility_id)
  end
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The writers.
--
-- The shape every writer in this schema has: lock, validate everything, then
-- write, returning a refusal as a VALUE rather than raising. What is NOT here
-- is anything that touches bytes — uploading and deleting objects are Storage
-- API calls and live in lib/db/site-images.ts.
-- ═══════════════════════════════════════════════════════════════════════════

-- The object is uploaded BEFORE this is called, under a key derived from the
-- image id, which is why the id is a parameter. A row pointing at nothing would
-- be a broken image on the front page; an object with no row is invisible and
-- swept. This function then confirms the object landed, so the first case
-- cannot happen at all.
--
-- `p_expected_current_id` is the photograph the dialog was opened on, or null
-- for an empty place. If that is no longer what is there, somebody else changed
-- it in the meantime and this upload would silently undo their work, so it is
-- refused as `stale`.
create function place_site_image(
  p_property_id uuid,
  p_image_id uuid,
  p_target text,
  p_slug text,
  p_expected_current_id uuid,
  p_storage_key text,
  p_mime_type text,
  p_byte_size integer,
  p_alt_text text,
  p_focus text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
as $function$
declare
  v_slot text;
  v_unit_type_id uuid;
  v_facility_id uuid;
  v_name text;
  v_alt_text text;
  v_current site_image%rowtype;
  v_object_size bigint;
  v_size integer;
begin
  if p_actor_id is null then
    return jsonb_build_object('ok', false, 'error', 'actor_required');
  end if;

  -- ── Where it goes ───────────────────────────────────────────────────────

  if p_target = 'slot' then
    if p_slug is null or p_slug not in ('hero', 'feed-1', 'feed-2', 'feed-3', 'feed-4') then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    v_slot := p_slug;
  elsif p_target = 'unit_type' then
    select t.id into v_unit_type_id
    from unit_type t
    where t.property_id = p_property_id and t.slug = p_slug;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  elsif p_target = 'facility' then
    select f.id into v_facility_id
    from facility f
    where f.property_id = p_property_id and f.slug = p_slug;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- ── What it is ──────────────────────────────────────────────────────────

  if p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    return jsonb_build_object('ok', false, 'error', 'not_an_image');
  end if;

  v_alt_text := btrim(regexp_replace(coalesce(p_alt_text, ''), '\s+', ' ', 'g'));

  if v_alt_text = '' or char_length(v_alt_text) > 200 then
    return jsonb_build_object('ok', false, 'error', 'alt_text_invalid');
  end if;

  if p_focus is null or p_focus not in (
    'top-left', 'top', 'top-right', 'left', 'center', 'right',
    'bottom-left', 'bottom', 'bottom-right'
  ) then
    return jsonb_build_object('ok', false, 'error', 'focus_invalid');
  end if;

  -- Flat under this property and nobody else's (architecture.md §8.1).
  if p_storage_key is null or p_storage_key not like (p_property_id::text || '/%') then
    return jsonb_build_object('ok', false, 'error', 'storage_key_invalid');
  end if;

  -- ── One writer per place ────────────────────────────────────────────────
  --
  -- An advisory lock rather than a row lock, for the reason 20260913000100
  -- gives: the first photograph in a place has no row to lock, and two first
  -- uploads would otherwise both find it empty. Keyed on the place, so two
  -- different places never wait on each other, and taken on nothing F3's
  -- settings save locks, so it adds no lock order to reason about.
  perform pg_advisory_xact_lock(
    hashtext(p_property_id::text || ':site_image:' || p_target || ':' || p_slug)
  );

  select si.* into v_current
  from site_image si
  where si.property_id = p_property_id
    and si.retired_at is null
    and (
      si.slot = v_slot
      or si.unit_type_id = v_unit_type_id
      or si.facility_id = v_facility_id
    )
  for update;

  if v_current.id is distinct from p_expected_current_id then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;

  -- ── The object actually landed ──────────────────────────────────────────
  --
  -- Storage keeps its objects in this database, so this is a lookup rather
  -- than an act of faith, and the size is read from here rather than believed
  -- from the caller (attach_document, 20260907000100).
  select (o.metadata ->> 'size')::bigint into v_object_size
  from storage.objects o
  where o.bucket_id = 'site-images' and o.name = p_storage_key;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'object_missing');
  end if;

  v_size := coalesce(v_object_size, p_byte_size)::integer;

  if v_size is null or v_size <= 0 then
    return jsonb_build_object('ok', false, 'error', 'object_empty');
  end if;

  if v_size > 4194304 then
    return jsonb_build_object('ok', false, 'error', 'too_large');
  end if;

  -- ── Write ───────────────────────────────────────────────────────────────

  if v_current.id is not null then
    update site_image
    set retired_at = now(), retired_reason = 'replaced', retired_by = p_actor_id
    where id = v_current.id;
  end if;

  insert into site_image (
    id, property_id, slot, unit_type_id, facility_id, storage_key,
    mime_type, byte_size, alt_text, focus, uploaded_by
  )
  values (
    p_image_id, p_property_id, v_slot, v_unit_type_id, v_facility_id, p_storage_key,
    p_mime_type, v_size, v_alt_text, p_focus, p_actor_id
  );

  v_name := site_image_name(v_slot, v_unit_type_id, v_facility_id);

  -- Two inserts rather than one with the verb in a `case`: the audit vocabulary
  -- test reads every (verb, entity) pair out of the migrations, and a verb
  -- inside a `case` is one it cannot see (lib/domain/audit-label.test.ts).
  if v_current.id is null then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'site_image.added', 'site_image', p_image_id,
      null,
      jsonb_build_object(
        'name', v_name, 'alt_text', v_alt_text, 'focus', p_focus,
        'mime_type', p_mime_type, 'byte_size', v_size
      )
    );
  else
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'site_image.replaced', 'site_image', p_image_id,
      jsonb_build_object(
        'name', v_name, 'image_id', v_current.id,
        'alt_text', v_current.alt_text, 'focus', v_current.focus
      ),
      jsonb_build_object(
        'name', v_name, 'alt_text', v_alt_text, 'focus', p_focus,
        'mime_type', p_mime_type, 'byte_size', v_size
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'retired', case
      when v_current.id is null then null
      else jsonb_build_object('id', v_current.id, 'storage_key', v_current.storage_key)
    end
  );
end;
$function$;

-- A description and a framing, changed on the photograph that is on the site.
--
-- Diffed by hand rather than through audit_settings_change(), which strips every
-- unchanged key — including `name`, which the trail needs to say which
-- photograph it was once the row is gone. So `name` rides on both sides and
-- only what changed rides beside it. A save that changed nothing writes nothing.
create function update_site_image(
  p_property_id uuid,
  p_image_id uuid,
  p_alt_text text,
  p_focus text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
as $function$
declare
  v_image site_image%rowtype;
  v_alt_text text;
  v_name text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  select * into v_image
  from site_image
  where id = p_image_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Replaced or removed while the dialog was open. Describing a photograph
  -- that is no longer on the site would describe nothing.
  if v_image.retired_at is not null then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;

  v_alt_text := btrim(regexp_replace(coalesce(p_alt_text, ''), '\s+', ' ', 'g'));

  if v_alt_text = '' or char_length(v_alt_text) > 200 then
    return jsonb_build_object('ok', false, 'error', 'alt_text_invalid');
  end if;

  if p_focus is null or p_focus not in (
    'top-left', 'top', 'top-right', 'left', 'center', 'right',
    'bottom-left', 'bottom', 'bottom-right'
  ) then
    return jsonb_build_object('ok', false, 'error', 'focus_invalid');
  end if;

  if v_image.alt_text is distinct from v_alt_text then
    v_before := v_before || jsonb_build_object('alt_text', v_image.alt_text);
    v_after := v_after || jsonb_build_object('alt_text', v_alt_text);
  end if;

  if v_image.focus is distinct from p_focus then
    v_before := v_before || jsonb_build_object('focus', v_image.focus);
    v_after := v_after || jsonb_build_object('focus', p_focus);
  end if;

  if v_after = '{}'::jsonb then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update site_image
  set alt_text = v_alt_text, focus = p_focus
  where id = p_image_id;

  v_name := site_image_name(v_image.slot, v_image.unit_type_id, v_image.facility_id);

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'site_image.updated', 'site_image', p_image_id,
    jsonb_build_object('name', v_name) || v_before,
    jsonb_build_object('name', v_name) || v_after
  );

  return jsonb_build_object('ok', true, 'changed', true);
end;
$function$;

-- Takes a photograph off the site. The row is retired and its key returned, and
-- lib/db/site-images.ts deletes the object straight after — a public bucket
-- serves whatever is in it, so a photograph is only removed once its file is.
create function remove_site_image(
  p_property_id uuid,
  p_image_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
as $function$
declare
  v_image site_image%rowtype;
  v_name text;
begin
  select * into v_image
  from site_image
  where id = p_image_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_image.retired_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_removed');
  end if;

  update site_image
  set retired_at = now(), retired_reason = 'removed', retired_by = p_actor_id
  where id = p_image_id;

  v_name := site_image_name(v_image.slot, v_image.unit_type_id, v_image.facility_id);

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'site_image.removed', 'site_image', p_image_id,
    jsonb_build_object('name', v_name, 'alt_text', v_image.alt_text, 'focus', v_image.focus),
    jsonb_build_object('name', v_name, 'retired_reason', 'removed')
  );

  return jsonb_build_object('ok', true, 'storage_key', v_image.storage_key);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. `site_image.manage` — who may change what the front page shows.
--
-- Its own string, where prd.md §4 twice reused `config.manage` for a screen an
-- administrator opens a couple of times a year. The difference is who does
-- this: whoever runs the Instagram account refreshes the "Follow along" tiles,
-- and `config.manage` would also hand them pricing, roles and the audit log.
-- Seeded to Admin only; any other role is one tick in Roles & staff. Granted
-- here as well as in seed.sql because production moves by `db push`, which runs
-- no seed (the construction 20260910000100 used for `deposit.waive`).
-- ═══════════════════════════════════════════════════════════════════════════

alter table role_permission drop constraint role_permission_permission_check;

alter table role_permission add constraint role_permission_permission_check check (
  permission in (
    'booking.view', 'booking.create', 'booking.amend', 'booking.cancel',
    'booking.override_hold', 'booking.discount', 'payment.verify',
    'payment.record_cash', 'inspection.record', 'charge.create', 'charge.waive',
    'deposit.approve_release', 'deposit.waive', 'unit.manage', 'tenancy.manage',
    'config.manage', 'report.view', 'document.view_identity', 'site_image.manage'
  )
);

insert into role_permission (property_id, role_id, permission)
select r.property_id, r.id, 'site_image.manage'
from staff_role r
where r.slug = 'admin'
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. The audit trail names a photograph.
--
-- audit_event_summary as 20260912000200 defined it, with one branch added:
-- a photograph's place in words, read live so a renamed facility shows its new
-- name. A row that has cascaded away resolves to null, and the screen falls
-- back to the `name` the event carries — which is why it carries one.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view audit_event_summary
with (security_invoker = true)
as
select
  e.id,
  e.property_id,
  e.actor_id,
  e.action,
  split_part(e.action, '.', 1) as action_family,
  e.entity_type,
  e.entity_id,
  e.before,
  e.after,
  e.at,
  case e.entity_type
    when 'booking' then (select b.reference from booking b where b.id = e.entity_id)
    when 'payment' then (
      select b.reference from payment p join booking b on b.id = p.booking_id
      where p.id = e.entity_id
    )
    when 'deposit' then (
      select b.reference from deposit d join booking b on b.id = d.booking_id
      where d.id = e.entity_id
    )
    when 'deposit_charge' then (
      select b.reference
      from deposit_charge c
      join deposit d on d.id = c.deposit_id
      join booking b on b.id = d.booking_id
      where c.id = e.entity_id
    )
    when 'inspection' then (
      select b.reference
      from inspection i
      join occupancy o on o.id = i.occupancy_id
      join booking b on b.id = o.booking_id
      where i.id = e.entity_id
    )
    when 'document' then (
      select b.reference from document doc join booking b on b.id = doc.booking_id
      where doc.id = e.entity_id
    )
    when 'unit' then (select u.ref from unit u where u.id = e.entity_id)
    when 'unit_type' then (select t.name from unit_type t where t.id = e.entity_id)
    when 'staff_role' then (select r.name from staff_role r where r.id = e.entity_id)
    when 'cash_banking' then (
      select to_char(c.business_date, 'YYYY-MM-DD') from cash_banking c where c.id = e.entity_id
    )
    when 'day_pass_band' then (
      select b.label from day_pass_age_band b where b.id = e.entity_id
    )
    when 'day_pass_bundle' then (
      select d.label from day_pass_bundle d where d.id = e.entity_id
    )
    when 'facility' then (select f.name from facility f where f.id = e.entity_id)
    when 'bank_account' then (
      select a.bank_name || ' ' || a.account_number from bank_account a where a.id = e.entity_id
    )
    when 'property' then (select p.name from property p where p.id = e.entity_id)
    when 'document_retention' then (select p.name from property p where p.id = e.entity_id)
    when 'site_image' then (
      select site_image_name(si.slot, si.unit_type_id, si.facility_id)
      from site_image si
      where si.id = e.entity_id
    )
    else null
  end as subject_label
from audit_event e;

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants.
--
-- Service-role only, like every other writer: the data client is the only
-- caller, and authorisation happens above it in requirePermission().
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on site_image from public, anon, authenticated;
grant select, insert, update on site_image to service_role;

revoke all on audit_event_summary from public, anon, authenticated;
grant select on audit_event_summary to service_role;

revoke execute on function site_image_name(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function place_site_image(
  uuid, uuid, text, text, uuid, text, text, integer, text, text, uuid
) from public, anon, authenticated;
revoke execute on function update_site_image(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
revoke execute on function remove_site_image(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function site_image_name(text, uuid, uuid) to service_role;
grant execute on function place_site_image(
  uuid, uuid, text, text, uuid, text, text, integer, text, text, uuid
) to service_role;
grant execute on function update_site_image(uuid, uuid, text, text, uuid) to service_role;
grant execute on function remove_site_image(uuid, uuid, uuid) to service_role;
