-- ═══════════════════════════════════════════════════════════════════════════
-- Property settings (capability F3; prd.md §7.1, §7.2, §8, §10.1, §11, §13).
--
-- architecture.md §11 has said since the first migration that "rates, fees,
-- policies, facilities, retention periods and hold durations are rows in
-- per-property config, never constants". Half of that was true: unit_type has
-- carried the rates since 20260829000100 and document_retention the periods
-- since 20260907000100. The rest lived in lib/domain/config.ts as a TypeScript
-- literal, which made every price a deploy — and prd.md §7.2's promise that a
-- pending decision "becomes a settings change rather than a code change"
-- untrue of every figure the client has not yet decided.
--
-- This migration moves the rest of PropertyConfig into rows and gives F3 the
-- functions to write them.
--
-- ── What is NOT here, and why ──────────────────────────────────────────────
--
-- **Hold durations.** open-questions.md N7 is answered (10 September 2026): a
-- unit is held indefinitely, until somebody checks. Nothing expires a hold and
-- nothing should, so `holdMinutesStay` / `holdMinutesDayPass` are deleted from
-- the config type rather than given columns. A setting the client can change
-- that changes nothing is worse than no setting: it invites him to shorten a
-- timer that does not exist. If the public flow (phase two) wants to *state* an
-- expectation to a customer, that is a screen decision with no row behind it.
--
-- **Effective dating.** There is none, and that is a decision rather than an
-- omission (**[A]**, open-questions.md N33). prd.md §8 makes the lines the
-- price and §9.6 reprices every amendment through the same engine, so a rate
-- change touches no stored booking_line: a booking already taken keeps the
-- figures it was quoted, and an amendment reprices at today's. Nobody has asked
-- for a rate that starts on a date, and a valid-from column nothing reads would
-- be the second copy of a fact this migration exists to remove.
--
-- **A second property's values.** Every policy column is added WITH a default
-- so the existing row is filled, then the default is DROPPED. A default left
-- behind would hand Palm Villa's rates to the next property silently, which is
-- the "never constants" §11 refuses, expressed as a default instead of as a
-- literal.
--
-- ── Why the tables look like this ──────────────────────────────────────────
--
-- **A bundle's composition is a child table, not jsonb on the bundle.** A band
-- id inside jsonb is a pointer no foreign key can check, and the failure it
-- allows is a real one: remove the "Child" band while a bundle still names it,
-- and `perPersonCost()` throws on the next day-pass quote — at a desk, for a
-- customer, long after the save that caused it. With day_pass_bundle_line and
-- `on delete restrict`, the same mistake is a refusal on the settings screen
-- naming the bundle that is in the way.
--
-- **A facility carries a slug it never loses.** Names change — "Playroom"
-- becomes "Indoor playground" — and a public page has to keep pointing at the
-- same facility across the rename. So the slug is derived from the name once,
-- at creation, and a rename never touches it: the arrangement unit_type has had
-- since 20260829000100, and what architecture.md §8's F7 note asks F3 to leave
-- behind for the public site's photographs.
--
-- **document_retention.kind stays a closed four-value check.** F3 makes the
-- PERIODS editable and deliberately not the kinds: a fifth kind is a bucket, a
-- permission and a retention decision, not a row somebody types. architecture
-- §8's F7 note relies on that refusal — a public marketing image must never be
-- able to acquire a retention period, because the nightly job would then delete
-- the front page.
--
-- **Retention changes re-anchor what is already held**, which supersedes the
-- note in 20260907000100 §3 ("changing a row affects new uploads only ...
-- whether F3 should re-anchor existing rows is a question for that screen").
-- This is that screen, and the answer is yes: a retention policy describes what
-- the business keeps, not what it happened to promise on the day each file
-- arrived. Anchors are unchanged — an identity document counts from the stay's
-- last day in the property's timezone, everything else from when it was taken —
-- so this recomputes with the new period and nothing else. A document that is
-- past its date the moment the period shortens is left for the nightly job
-- rather than deleted inline: 20260907000100 §6 makes every read refuse an
-- expired document anyway, so it is already invisible, and deleting Storage
-- objects inside a settings save would put a second system's failure inside a
-- transaction that has nothing to do with it.
--
-- ── Concurrency ────────────────────────────────────────────────────────────
--
-- `property.settings_updated_at` is the optimistic token, the role `unit.ref`
-- plays in apply_unit_registry(): every save states the value the screen was
-- opened on, and is refused if it has moved. One token covers all four tabs —
-- saving the day pass refuses an unrefreshed pricing tab — which is honest and
-- cheap, where a token per table would be four columns to keep straight for a
-- screen two people open at once about twice a year.
--
-- The token moves only when something actually changed. A save that submits
-- what is already stored writes no row, no audit event and no new token, so an
-- idle click cannot fabricate history.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The policy figures, on `property`.
--
-- Times are `text` with a shape check rather than `time`: nothing computes on
-- them — priceStay() only asks whether a check-in time exists — and `time`
-- returns through PostgREST as '14:00:00', which would need normalising in the
-- mapper and again in the form. The day the desk computes hours from a clock is
-- the day to cast the column.
--
-- `check_in_time` is `not null` though the domain type is nullable. N6 is [C],
-- and a cleared check-in time would silently stop early check-in being
-- priceable — a setting whose empty state disables a feature somewhere else.
-- The type keeps its null for the fixture and for a second property that has
-- not said yet.
-- ═══════════════════════════════════════════════════════════════════════════

alter table property
  add column pax_policy text not null default 'surcharge_threshold'
    check (pax_policy in ('hard_cap', 'surcharge_threshold')),
  add column extra_person_per_night_cents integer not null default 700
    check (extra_person_per_night_cents >= 0),
  add column pax_exempt_age_max integer not null default 3
    check (pax_exempt_age_max >= 0 and pax_exempt_age_max < 130),
  add column sofa_bed_fee_cents integer not null default 2800
    check (sofa_bed_fee_cents >= 0),
  add column sofa_bed_stock integer
    check (sofa_bed_stock is null or sofa_bed_stock >= 0),
  add column early_check_in_per_hour_cents integer not null default 1000
    check (early_check_in_per_hour_cents >= 0),
  add column late_check_out_per_hour_cents integer not null default 1500
    check (late_check_out_per_hour_cents >= 0),
  add column check_in_time text not null default '14:00'
    check (check_in_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column check_out_time text not null default '12:00'
    check (check_out_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column security_deposit_cents integer not null default 10000
    check (security_deposit_cents >= 0),
  add column max_advance_booking_days integer not null default 62
    check (max_advance_booking_days > 0),
  add column settings_updated_at timestamptz not null default now();

alter table property
  alter column pax_policy drop default,
  alter column extra_person_per_night_cents drop default,
  alter column pax_exempt_age_max drop default,
  alter column sofa_bed_fee_cents drop default,
  alter column early_check_in_per_hour_cents drop default,
  alter column late_check_out_per_hour_cents drop default,
  alter column check_in_time drop default,
  alter column check_out_time drop default,
  alter column security_deposit_cents drop default,
  alter column max_advance_booking_days drop default;

comment on column property.sofa_bed_stock is
  'Sofa beds across the property, or null for "unknown, do not constrain" (open-questions.md N8). A number here starts refusing parties above it.';

comment on column property.settings_updated_at is
  'Optimistic concurrency token for the settings screen (capability F3). Moves only when a save changes something.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Day-pass pricing: age bands and family bundles (prd.md §8.1).
--
-- Bands have no sort column — they are ordered by `min_age`, which is the only
-- order that can be right, and a second field saying so could disagree with it.
-- The contiguity rule bandForAge() depends on (cover from zero, no gaps, one
-- open-ended band last) is checked at save time, not by a constraint: it spans
-- rows, and a check constraint cannot see across them.
-- ═══════════════════════════════════════════════════════════════════════════

create table day_pass_age_band (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  label text not null check (btrim(label) <> '' and char_length(label) <= 40),
  min_age integer not null check (min_age >= 0 and min_age < 130),
  -- Null means "and above". Exactly one band may have it, and it must be the
  -- last — enforced at save time with the rest of the contiguity rule.
  max_age_exclusive integer check (max_age_exclusive > min_age and max_age_exclusive <= 130),
  price_cents integer not null check (price_cents >= 0),
  unique (property_id, id)
);

create table day_pass_bundle (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  label text not null check (btrim(label) <> '' and char_length(label) <= 60),
  price_cents integer not null check (price_cents >= 0),
  sort_order integer not null,
  unique (property_id, id)
);

-- The composition, one row per band the bundle includes. `on delete restrict`
-- on the band is the point of the table: it turns "removed a band a bundle
-- still names" from a throw at the next quote into a refusal at the save.
create table day_pass_bundle_line (
  property_id uuid not null references property (id) on delete cascade,
  bundle_id uuid not null,
  band_id uuid not null,
  headcount integer not null check (headcount > 0),
  primary key (bundle_id, band_id),
  foreign key (property_id, bundle_id) references day_pass_bundle (property_id, id) on delete cascade,
  foreign key (property_id, band_id) references day_pass_age_band (property_id, id) on delete restrict
);

alter table day_pass_age_band enable row level security;
alter table day_pass_bundle enable row level security;
alter table day_pass_bundle_line enable row level security;

comment on table day_pass_age_band is
  'Day-pass price per person by age (prd.md §8.1, capability F3). Ordered by min_age; the last band is open-ended.';

comment on table day_pass_bundle_line is
  'A bundle''s composition, one row per band. A child table rather than jsonb so a band a bundle names cannot be removed (capability F3).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Facilities (prd.md §7.2).
--
-- The seed has said since 20260829000100 that facilities land "with the
-- day-pass flow in phase two, which is the first thing that needs facility
-- headroom to mean something". Inclusion arrived first instead: the client
-- answered C1 on 10 September 2026 with a list, and framed it as "I will list
-- out all the options so your team can enable or disable whenever you want" —
-- which is this table.
--
-- `day_pass_capacity` is nullable and seeded null on every row. C2 is open: no
-- capacity has ever been agreed, and the number here is headroom for day-pass
-- visitors rather than physical capacity (prd.md §7.2 [A]), because tenants
-- have facility access at no service charge and form a permanent baseline. A
-- guessed denominator would make E5's day-pass panel state a percentage of a
-- number nobody chose.
-- ═══════════════════════════════════════════════════════════════════════════

create table facility (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  -- Derived from the name once, at creation, and never moved by a rename. What
  -- a public page joins on (architecture.md §8, capability F7).
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  included_in_day_pass boolean not null default false,
  day_pass_capacity integer check (day_pass_capacity is null or day_pass_capacity >= 0),
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (property_id, slug),
  unique (property_id, id)
);

alter table facility enable row level security;

comment on column facility.day_pass_capacity is
  'Headroom available to day-pass visitors, not physical capacity (prd.md §7.2). Null until the client agrees one (open-questions.md C2).';

comment on column facility.slug is
  'Stable identifier derived from the name at creation. A rename never changes it — a public page joins on this (capability F7).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Bank accounts (prd.md §10.1).
--
-- Two accounts for one reason: a Bruneian customer already banks with one or
-- the other and transfers within their own bank without a fee or a delay. It is
-- a choice of convenience, not two products — nothing routes on which one a
-- customer picks, and nothing reconciles them differently.
--
-- Here rather than in a content file because prd.md §10.1 [A] says so: "the day
-- a number changes is the day every transfer instruction and every accounting
-- pack has to change with it — and a number pasted into a marketing page is the
-- copy nobody remembers to update". Nothing reads these yet; the customer-facing
-- transfer instructions are capability A5, phase two.
-- ═══════════════════════════════════════════════════════════════════════════

create table bank_account (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  bank_name text not null check (btrim(bank_name) <> '' and char_length(bank_name) <= 60),
  account_number text not null check (btrim(account_number) <> '' and char_length(account_number) <= 40),
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (property_id, id)
);

alter table bank_account enable row level security;

comment on table bank_account is
  'The property''s bank accounts for customer transfers (prd.md §10.1, capability F3). The number alone is shown to a customer — no account name.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. facility_slug() — a name, as a slug.
--
-- Apostrophes are DROPPED rather than treated as separators, so "Indoor
-- children's playground" is `indoor-childrens-playground` and not
-- `indoor-children-s-playground`. A stray single-letter segment in a public URL
-- reads as a typo, and this slug is permanent — it survives every rename, so
-- it is worth getting right the once.
--
-- Both apostrophes, because a name typed on a phone carries the curly one.
-- ═══════════════════════════════════════════════════════════════════════════

create function facility_slug(p_name text)
returns text
language sql
immutable
as $function$
  select coalesce(
    nullif(
      btrim(
        regexp_replace(
          regexp_replace(lower(btrim(coalesce(p_name, ''))), '[''’]', '', 'g'),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-'
      ),
      ''
    ),
    'facility'
  )
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. seed_property_settings() — the defaults, in one place.
--
-- Called twice and idempotent both times: once at the foot of this migration,
-- which is what fills a database that already has a property (every deployed
-- one), and once from supabase/seed.sql, which is what fills a freshly reset
-- local stack where the property does not exist yet when migrations run.
--
-- One function rather than two copies because the alternative was the state
-- document_retention has been in since 20260907000100: seeded in seed.sql only,
-- so every deployed database has no retention rows at all and attach_document()
-- refuses `retention_unconfigured` for every upload. The `on conflict do
-- nothing` below is what fixes that, and the shape is what stops it recurring.
--
-- Every figure is a [C] from prd.md except the two flagged inline.
-- ═══════════════════════════════════════════════════════════════════════════

create function seed_property_settings(p_property_id uuid)
returns void
language plpgsql
as $function$
declare
  v_child uuid;
  v_adult uuid;
  v_bundle uuid;
begin
  -- Day-pass age bands (prd.md §8.1). The 12-year-old boundary is [A], settled
  -- 2026-09-05 by Jeff against the client's overlapping wording; under-1 is free
  -- by inference from the stays rule and is still open (N3).
  insert into day_pass_age_band (property_id, label, min_age, max_age_exclusive, price_cents)
  select p_property_id, spec.label, spec.min_age, spec.max_age, spec.price
  from (
    values ('Under 1', 0, 1, 0), ('Child', 1, 12, 500), ('Adult', 12, null, 1000)
  ) as spec (label, min_age, max_age, price)
  where not exists (select 1 from day_pass_age_band b where b.property_id = p_property_id);

  select id into v_child from day_pass_age_band
  where property_id = p_property_id and min_age = 1;
  select id into v_adult from day_pass_age_band
  where property_id = p_property_id and max_age_exclusive is null;

  -- Family bundles (prd.md §8.1). Only these two shapes are stated; N4 covers
  -- every other family, and priceDayPass() resolves it by applying bundles
  -- repeatedly and charging the cheapest arrangement.
  if v_child is not null and v_adult is not null
    and not exists (select 1 from day_pass_bundle b where b.property_id = p_property_id)
  then
    insert into day_pass_bundle (property_id, label, price_cents, sort_order)
    values (p_property_id, '2 adults + 1 child', 2000, 1)
    returning id into v_bundle;

    insert into day_pass_bundle_line (property_id, bundle_id, band_id, headcount)
    values (p_property_id, v_bundle, v_adult, 2), (p_property_id, v_bundle, v_child, 1);

    insert into day_pass_bundle (property_id, label, price_cents, sort_order)
    values (p_property_id, '2 adults + 2 children', 2500, 2)
    returning id into v_bundle;

    insert into day_pass_bundle_line (property_id, bundle_id, band_id, headcount)
    values (p_property_id, v_bundle, v_adult, 2), (p_property_id, v_bundle, v_child, 2);
  end if;

  -- Facilities (prd.md §7.2). Pool, water park and playroom in; BBQ, gym and
  -- the billiard room out, all confirmed by the client 10 September 2026 except
  -- the sauna, which he named neither way — so it is seeded OUT, which is the
  -- half that cannot mis-sell a pass. Capacities are null: C2 is open.
  insert into facility (property_id, slug, name, included_in_day_pass, sort_order)
  select p_property_id, facility_slug(spec.name), spec.name, spec.included, spec.sort_order
  from (
    values
      ('Swimming pool', true, 1),
      ('Water park', true, 2),
      ('Indoor children''s playground', true, 3),
      ('BBQ area', false, 4),
      ('Gym', false, 5),
      ('Billiard room', false, 6),
      ('Sauna room', false, 7)
  ) as spec (name, included, sort_order)
  where not exists (select 1 from facility f where f.property_id = p_property_id);

  -- Bank accounts (prd.md §10.1, given by the client 10 September 2026).
  insert into bank_account (property_id, bank_name, account_number, sort_order)
  select p_property_id, spec.bank, spec.number, spec.sort_order
  from (
    values ('BIBD', '0018-02-0010611', 1), ('Baiduri', '03-0110-455273', 2)
  ) as spec (bank, number, sort_order)
  where not exists (select 1 from bank_account a where a.property_id = p_property_id);

  -- Retention periods (architecture.md §8, capability G4).
  insert into document_retention (property_id, kind, months)
  select p_property_id, spec.kind, spec.months
  from (
    values ('identity', 12), ('payment_slip', 84), ('inspection_photo', 24), ('accounting_pack', 84)
  ) as spec (kind, months)
  on conflict (property_id, kind) do nothing;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. The audit helpers.
--
-- architecture.md §4 keeps approvals as events; a settings change is the same
-- kind of fact, and F4 promises the owner the full trail. What it does NOT
-- promise is a row per field somebody tabbed through: an event carrying eleven
-- unchanged policy figures beside the one that moved is a trail nobody reads.
--
-- So an update is diffed and only the differing keys are recorded — the
-- granularity `unit.renamed` has always used, generalised. An add or a remove
-- is written whole, because "what was this row" is the whole point of both.
-- ═══════════════════════════════════════════════════════════════════════════

create function audit_changed_fields(
  p_before jsonb,
  p_after jsonb,
  out changed_before jsonb,
  out changed_after jsonb
)
language sql
immutable
as $function$
  select
    coalesce(jsonb_object_agg(k, p_before -> k) filter (where p_before ? k), '{}'::jsonb),
    coalesce(jsonb_object_agg(k, p_after -> k) filter (where p_after ? k), '{}'::jsonb)
  from jsonb_object_keys(coalesce(p_before, '{}'::jsonb) || coalesce(p_after, '{}'::jsonb)) as k
  where (p_before -> k) is distinct from (p_after -> k)
$function$;

-- Returns whether anything was recorded, which is what the callers count. A
-- no-op update writes nothing and reports false, so the settings token below
-- stays where it was.
create function audit_settings_change(
  p_property_id uuid,
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns boolean
language plpgsql
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if p_before is null or p_after is null then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, p_action, p_entity_type, p_entity_id, p_before, p_after
    );

    return true;
  end if;

  select changed_before, changed_after into v_before, v_after
  from audit_changed_fields(p_before, p_after);

  if v_before = '{}'::jsonb and v_after = '{}'::jsonb then
    return false;
  end if;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, p_action, p_entity_type, p_entity_id, v_before, v_after
  );

  return true;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. property_settings() — everything the screen and the engine read, once.
--
-- A function rather than a view for the reason unit_registry() is one: it is a
-- single shaped answer rather than a row source, and the alternative is seven
-- round trips assembled in the application. getPropertyConfig() derives the
-- pricing engine's PropertyConfig from exactly this, so the figures a quote
-- uses and the figures the settings screen shows cannot come apart.
-- ═══════════════════════════════════════════════════════════════════════════

create function property_settings(p_property_id uuid)
returns jsonb
language sql
stable
as $function$
  select jsonb_build_object(
    'property_id', p.id,
    'name', p.name,
    'time_zone', p.time_zone,
    'currency', p.currency,
    'settings_updated_at', p.settings_updated_at,
    'policy', jsonb_build_object(
      'pax_policy', p.pax_policy,
      'extra_person_per_night_cents', p.extra_person_per_night_cents,
      'pax_exempt_age_max', p.pax_exempt_age_max,
      'sofa_bed_fee_cents', p.sofa_bed_fee_cents,
      'sofa_bed_stock', p.sofa_bed_stock,
      'early_check_in_per_hour_cents', p.early_check_in_per_hour_cents,
      'late_check_out_per_hour_cents', p.late_check_out_per_hour_cents,
      'check_in_time', p.check_in_time,
      'check_out_time', p.check_out_time,
      'security_deposit_cents', p.security_deposit_cents,
      'max_advance_booking_days', p.max_advance_booking_days
    ),
    'unit_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ut.id,
        'slug', ut.slug,
        'name', ut.name,
        'base_rate_cents', ut.base_rate_cents,
        'max_pax', ut.max_pax,
        'car_parks', ut.car_parks
      ) order by ut.base_rate_cents, ut.slug)
      from unit_type ut where ut.property_id = p.id
    ), '[]'::jsonb),
    'bands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'label', b.label,
        'min_age', b.min_age,
        'max_age_exclusive', b.max_age_exclusive,
        'price_cents', b.price_cents
      ) order by b.min_age)
      from day_pass_age_band b where b.property_id = p.id
    ), '[]'::jsonb),
    'bundles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'label', d.label,
        'price_cents', d.price_cents,
        'sort_order', d.sort_order,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object('band_id', l.band_id, 'headcount', l.headcount)
            order by l.band_id)
          from day_pass_bundle_line l where l.bundle_id = d.id
        ), '[]'::jsonb)
      ) order by d.sort_order, d.label)
      from day_pass_bundle d where d.property_id = p.id
    ), '[]'::jsonb),
    'facilities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'slug', f.slug,
        'name', f.name,
        'included_in_day_pass', f.included_in_day_pass,
        'day_pass_capacity', f.day_pass_capacity,
        'sort_order', f.sort_order
      ) order by f.sort_order, f.name)
      from facility f where f.property_id = p.id
    ), '[]'::jsonb),
    'retention', coalesce((
      select jsonb_agg(jsonb_build_object('kind', r.kind, 'months', r.months) order by r.kind)
      from document_retention r where r.property_id = p.id
    ), '[]'::jsonb),
    'bank_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'bank_name', a.bank_name,
        'account_number', a.account_number,
        'sort_order', a.sort_order
      ) order by a.sort_order, a.bank_name)
      from bank_account a where a.property_id = p.id
    ), '[]'::jsonb)
  )
  from property p
  where p.id = p_property_id
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. settings_token() — the guard every save opens with.
--
-- Locks the property row, and refuses if the token the screen was opened on is
-- not the one stored. `for update` rather than a bare read because two saves
-- landing together would otherwise both read the same token, both pass, and
-- both write — the check would then be decoration.
-- ═══════════════════════════════════════════════════════════════════════════

create function settings_token(p_property_id uuid, p_expected timestamptz)
returns timestamptz
language plpgsql
as $function$
declare
  v_current timestamptz;
begin
  select settings_updated_at into v_current
  from property
  where id = p_property_id
  for update;

  if not found then
    raise exception 'not_found:' using errcode = 'PV001';
  end if;

  if p_expected is null or p_expected <> v_current then
    raise exception 'changed:' using errcode = 'PV001';
  end if;

  return v_current;
end;
$function$;

-- Moves the token, but only when a save changed something.
create function settings_touched(p_property_id uuid, p_changed integer, p_current timestamptz)
returns timestamptz
language plpgsql
as $function$
declare
  v_updated_at timestamptz;
begin
  if p_changed = 0 then
    return p_current;
  end if;

  update property set settings_updated_at = now()
  where id = p_property_id
  returning settings_updated_at into v_updated_at;

  return v_updated_at;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. save_pricing_settings() — the unit types and the policy figures.
--
-- Refusals inside the loop RAISE rather than return, for the reason
-- apply_unit_registry() records: a `return` after a write commits the writes
-- already made, and only an exception unwinds the subtransaction the exception
-- clause creates. That is the difference between "the save was refused" and
-- "two of the four rates changed".
-- ═══════════════════════════════════════════════════════════════════════════

create function save_pricing_settings(
  p_property_id uuid,
  p_expected_updated_at timestamptz,
  p_unit_types jsonb,
  p_policy jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  entry jsonb;
  v_current timestamptz;
  v_changed integer := 0;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_current := settings_token(p_property_id, p_expected_updated_at);

  for entry in select * from jsonb_array_elements(coalesce(p_unit_types, '[]'::jsonb)) loop
    select ut.id, jsonb_build_object(
      'name', ut.name,
      'base_rate_cents', ut.base_rate_cents,
      'max_pax', ut.max_pax,
      'car_parks', ut.car_parks
    )
    into v_id, v_before
    from unit_type ut
    where ut.property_id = p_property_id and ut.slug = entry ->> 'slug';

    if not found then
      raise exception 'unit_type_not_found:%', entry ->> 'slug' using errcode = 'PV001';
    end if;

    v_after := jsonb_build_object(
      'name', v_before ->> 'name',
      'base_rate_cents', (entry ->> 'base_rate_cents')::integer,
      'max_pax', (entry ->> 'max_pax')::integer,
      'car_parks', (entry ->> 'car_parks')::integer
    );

    update unit_type set
      base_rate_cents = (v_after ->> 'base_rate_cents')::integer,
      max_pax = (v_after ->> 'max_pax')::integer,
      car_parks = (v_after ->> 'car_parks')::integer
    where id = v_id;

    if audit_settings_change(
      p_property_id, p_actor_id, 'unit_type.updated', 'unit_type', v_id, v_before, v_after
    ) then
      v_changed := v_changed + 1;
    end if;
  end loop;

  select jsonb_build_object(
    'pax_policy', p.pax_policy,
    'extra_person_per_night_cents', p.extra_person_per_night_cents,
    'pax_exempt_age_max', p.pax_exempt_age_max,
    'sofa_bed_fee_cents', p.sofa_bed_fee_cents,
    'sofa_bed_stock', p.sofa_bed_stock,
    'early_check_in_per_hour_cents', p.early_check_in_per_hour_cents,
    'late_check_out_per_hour_cents', p.late_check_out_per_hour_cents,
    'check_in_time', p.check_in_time,
    'check_out_time', p.check_out_time,
    'security_deposit_cents', p.security_deposit_cents,
    'max_advance_booking_days', p.max_advance_booking_days
  )
  into v_before
  from property p
  where p.id = p_property_id;

  v_after := jsonb_build_object(
    'pax_policy', p_policy ->> 'pax_policy',
    'extra_person_per_night_cents', (p_policy ->> 'extra_person_per_night_cents')::integer,
    'pax_exempt_age_max', (p_policy ->> 'pax_exempt_age_max')::integer,
    'sofa_bed_fee_cents', (p_policy ->> 'sofa_bed_fee_cents')::integer,
    'sofa_bed_stock', (p_policy ->> 'sofa_bed_stock')::integer,
    'early_check_in_per_hour_cents', (p_policy ->> 'early_check_in_per_hour_cents')::integer,
    'late_check_out_per_hour_cents', (p_policy ->> 'late_check_out_per_hour_cents')::integer,
    'check_in_time', p_policy ->> 'check_in_time',
    'check_out_time', p_policy ->> 'check_out_time',
    'security_deposit_cents', (p_policy ->> 'security_deposit_cents')::integer,
    'max_advance_booking_days', (p_policy ->> 'max_advance_booking_days')::integer
  );

  update property set
    pax_policy = v_after ->> 'pax_policy',
    extra_person_per_night_cents = (v_after ->> 'extra_person_per_night_cents')::integer,
    pax_exempt_age_max = (v_after ->> 'pax_exempt_age_max')::integer,
    sofa_bed_fee_cents = (v_after ->> 'sofa_bed_fee_cents')::integer,
    sofa_bed_stock = (v_after ->> 'sofa_bed_stock')::integer,
    early_check_in_per_hour_cents = (v_after ->> 'early_check_in_per_hour_cents')::integer,
    late_check_out_per_hour_cents = (v_after ->> 'late_check_out_per_hour_cents')::integer,
    check_in_time = v_after ->> 'check_in_time',
    check_out_time = v_after ->> 'check_out_time',
    security_deposit_cents = (v_after ->> 'security_deposit_cents')::integer,
    max_advance_booking_days = (v_after ->> 'max_advance_booking_days')::integer
  where id = p_property_id;

  if audit_settings_change(
    p_property_id, p_actor_id, 'property.policy_updated', 'property', p_property_id,
    v_before, v_after
  ) then
    v_changed := v_changed + 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'settings_updated_at', settings_touched(p_property_id, v_changed, v_current)
  );

exception
  when sqlstate 'PV001' then
    return jsonb_build_object(
      'ok', false,
      'error', split_part(sqlerrm, ':', 1),
      'detail', nullif(split_part(sqlerrm, ':', 2), '')
    );
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_value', 'detail', sqlerrm);
  when not_null_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'invalid_value', 'detail', sqlerrm);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. The day pass: bands, bundles and facilities.
--
-- Split into four functions because the ORDER matters and stating it once, in
-- the caller, is the only way it stays true:
--
--   1. bands are added and updated  — so a bundle can name a band created in
--                                     the same save
--   2. bundles are replaced         — so a line naming a band about to go is
--                                     already gone
--   3. bands are pruned             — what is left is unreferenced, or refused
--   4. facilities                   — independent of all three
--
-- Doing removals first, as apply_unit_registry() does, would refuse every save
-- that renames a band's coverage and rewrites the bundle that uses it in one
-- go, which is the ordinary edit.
-- ═══════════════════════════════════════════════════════════════════════════

-- The rule bandForAge() depends on: cover from zero, no gaps, exactly one
-- open-ended band and it last. Checked here as well as in lib/domain because
-- this is the constraint the pricing engine cannot express — a party whose age
-- falls in a gap gets no band, and priceDayPass() throws rather than quotes.
create function day_pass_bands_are_contiguous(p_bands jsonb)
returns boolean
language sql
immutable
as $function$
  with ordered as (
    select
      (b ->> 'min_age')::integer as min_age,
      nullif(b ->> 'max_age_exclusive', '')::integer as max_age,
      row_number() over (order by (b ->> 'min_age')::integer) as rn,
      count(*) over () as total
    from jsonb_array_elements(coalesce(p_bands, '[]'::jsonb)) b
  ),
  paired as (
    select rn, total, min_age, max_age, lead(min_age) over (order by min_age) as next_min
    from ordered
  )
  select coalesce(bool_and(
    case
      when rn = 1 and min_age <> 0 then false
      when rn = total then max_age is null
      else max_age is not null and max_age = next_min
    end
  ), false)
  from paired
$function$;

-- Adds and updates only; returns the count of changes and the map from the
-- screen's temporary key to the row's real id, which is how a bundle line
-- names a band that did not exist when the form was submitted.
create function save_day_pass_bands(
  p_property_id uuid,
  p_bands jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  entry jsonb;
  v_changed integer := 0;
  v_ids jsonb := '{}'::jsonb;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  for entry in select * from jsonb_array_elements(coalesce(p_bands, '[]'::jsonb)) loop
    v_after := jsonb_build_object(
      'label', btrim(entry ->> 'label'),
      'min_age', (entry ->> 'min_age')::integer,
      'max_age_exclusive', nullif(entry ->> 'max_age_exclusive', '')::integer,
      'price_cents', (entry ->> 'price_cents')::integer
    );

    if entry ->> 'id' is null then
      insert into day_pass_age_band (property_id, label, min_age, max_age_exclusive, price_cents)
      values (
        p_property_id,
        v_after ->> 'label',
        (v_after ->> 'min_age')::integer,
        (v_after ->> 'max_age_exclusive')::integer,
        (v_after ->> 'price_cents')::integer
      )
      returning id into v_id;

      perform audit_settings_change(
        p_property_id, p_actor_id, 'day_pass_band.added', 'day_pass_band', v_id, null, v_after
      );

      v_changed := v_changed + 1;
    else
      v_id := (entry ->> 'id')::uuid;

      select jsonb_build_object(
        'label', b.label,
        'min_age', b.min_age,
        'max_age_exclusive', b.max_age_exclusive,
        'price_cents', b.price_cents
      )
      into v_before
      from day_pass_age_band b
      where b.property_id = p_property_id and b.id = v_id;

      if not found then
        raise exception 'band_not_found:%', entry ->> 'label' using errcode = 'PV001';
      end if;

      update day_pass_age_band set
        label = v_after ->> 'label',
        min_age = (v_after ->> 'min_age')::integer,
        max_age_exclusive = (v_after ->> 'max_age_exclusive')::integer,
        price_cents = (v_after ->> 'price_cents')::integer
      where id = v_id;

      if audit_settings_change(
        p_property_id, p_actor_id, 'day_pass_band.updated', 'day_pass_band', v_id, v_before, v_after
      ) then
        v_changed := v_changed + 1;
      end if;
    end if;

    v_ids := v_ids || jsonb_build_object(entry ->> 'key', v_id);
  end loop;

  return jsonb_build_object('changed', v_changed, 'ids', v_ids);
end;
$function$;

-- Removes the bands the submission no longer carries. Runs after the bundles,
-- so a band freed by the same save is free by the time it is checked.
--
-- It takes the key→id map save_day_pass_bands() returned rather than the
-- submission, and that distinction is load-bearing: a band ADDED in this same
-- save was submitted with a null id, so a prune driven by the submitted ids
-- would delete the row it had just created.
create function prune_day_pass_bands(
  p_property_id uuid,
  p_band_ids jsonb,
  p_actor_id uuid default null
)
returns integer
language plpgsql
as $function$
declare
  doomed record;
  v_changed integer := 0;
begin
  for doomed in
    select b.id, b.label, b.min_age, b.max_age_exclusive, b.price_cents
    from day_pass_age_band b
    where b.property_id = p_property_id
      and b.id not in (
        select value::uuid from jsonb_each_text(coalesce(p_band_ids, '{}'::jsonb))
      )
  loop
    if exists (select 1 from day_pass_bundle_line l where l.band_id = doomed.id) then
      raise exception 'band_in_use:%', doomed.label using errcode = 'PV001';
    end if;

    delete from day_pass_age_band where id = doomed.id;

    perform audit_settings_change(
      p_property_id, p_actor_id, 'day_pass_band.removed', 'day_pass_band', doomed.id,
      jsonb_build_object(
        'label', doomed.label,
        'min_age', doomed.min_age,
        'max_age_exclusive', doomed.max_age_exclusive,
        'price_cents', doomed.price_cents
      ),
      null
    );

    v_changed := v_changed + 1;
  end loop;

  return v_changed;
end;
$function$;

-- A bundle's lines are replaced wholesale rather than reconciled, for the
-- reason amend_booking() replaces a booking's lines: the composition IS the
-- bundle, and the honest representation of a change to it is the new set. They
-- ride in the audit payload so a composition change shows as a changed field.
create function save_day_pass_bundles(
  p_property_id uuid,
  p_bundles jsonb,
  p_band_ids jsonb,
  p_actor_id uuid default null
)
returns integer
language plpgsql
as $function$
declare
  entry jsonb;
  doomed record;
  line jsonb;
  v_changed integer := 0;
  v_id uuid;
  v_band uuid;
  v_key text;
  v_label text;
  v_before jsonb;
  v_after jsonb;
  v_sort integer := 0;
begin
  for doomed in
    select d.id, d.label, d.price_cents
    from day_pass_bundle d
    where d.property_id = p_property_id
      and d.id not in (
        select (e ->> 'id')::uuid
        from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) e
        where e ->> 'id' is not null
      )
  loop
    delete from day_pass_bundle where id = doomed.id;

    perform audit_settings_change(
      p_property_id, p_actor_id, 'day_pass_bundle.removed', 'day_pass_bundle', doomed.id,
      jsonb_build_object('label', doomed.label, 'price_cents', doomed.price_cents), null
    );

    v_changed := v_changed + 1;
  end loop;

  for entry in select * from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) loop
    v_sort := v_sort + 1;

    v_after := jsonb_build_object(
      'label', btrim(entry ->> 'label'),
      'price_cents', (entry ->> 'price_cents')::integer,
      'lines', entry -> 'lines'
    );

    if entry ->> 'id' is null then
      insert into day_pass_bundle (property_id, label, price_cents, sort_order)
      values (p_property_id, v_after ->> 'label', (v_after ->> 'price_cents')::integer, v_sort)
      returning id into v_id;

      perform audit_settings_change(
        p_property_id, p_actor_id, 'day_pass_bundle.added', 'day_pass_bundle', v_id, null, v_after
      );

      v_changed := v_changed + 1;
    else
      v_id := (entry ->> 'id')::uuid;

      select jsonb_build_object(
        'label', d.label,
        'price_cents', d.price_cents,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object('band_key', l.band_id::text, 'headcount', l.headcount)
            order by l.band_id)
          from day_pass_bundle_line l where l.bundle_id = d.id
        ), '[]'::jsonb)
      )
      into v_before
      from day_pass_bundle d
      where d.property_id = p_property_id and d.id = v_id;

      if not found then
        raise exception 'bundle_not_found:%', entry ->> 'label' using errcode = 'PV001';
      end if;

      update day_pass_bundle set
        label = v_after ->> 'label',
        price_cents = (v_after ->> 'price_cents')::integer,
        sort_order = v_sort
      where id = v_id;

      delete from day_pass_bundle_line where bundle_id = v_id;

      if audit_settings_change(
        p_property_id, p_actor_id, 'day_pass_bundle.updated', 'day_pass_bundle', v_id,
        v_before, v_after
      ) then
        v_changed := v_changed + 1;
      end if;
    end if;

    for line in select * from jsonb_array_elements(coalesce(entry -> 'lines', '[]'::jsonb)) loop
      v_key := line ->> 'band_key';
      v_band := nullif(p_band_ids ->> v_key, '')::uuid;

      if v_band is null then
        -- The line names a band the submission no longer carries. Where that
        -- band still exists, this IS the removal prune_day_pass_bands() would
        -- refuse a moment later — caught here instead, because here the band's
        -- own name is in hand and "you cannot remove Child" is the sentence the
        -- screen needs. Anything else is a key that never named a band.
        v_label := null;

        if v_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          select b.label into v_label
          from day_pass_age_band b
          where b.property_id = p_property_id and b.id = v_key::uuid;
        end if;

        if v_label is not null then
          raise exception 'band_in_use:%', v_label using errcode = 'PV001';
        end if;

        raise exception 'band_not_found:%', v_key using errcode = 'PV001';
      end if;

      insert into day_pass_bundle_line (property_id, bundle_id, band_id, headcount)
      values (p_property_id, v_id, v_band, (line ->> 'headcount')::integer);
    end loop;
  end loop;

  return v_changed;
end;
$function$;

create function save_facilities(
  p_property_id uuid,
  p_facilities jsonb,
  p_actor_id uuid default null
)
returns integer
language plpgsql
as $function$
declare
  entry jsonb;
  doomed record;
  v_changed integer := 0;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_sort integer := 0;
begin
  for doomed in
    select f.id, f.slug, f.name, f.included_in_day_pass, f.day_pass_capacity
    from facility f
    where f.property_id = p_property_id
      and f.id not in (
        select (e ->> 'id')::uuid
        from jsonb_array_elements(coalesce(p_facilities, '[]'::jsonb)) e
        where e ->> 'id' is not null
      )
  loop
    delete from facility where id = doomed.id;

    perform audit_settings_change(
      p_property_id, p_actor_id, 'facility.removed', 'facility', doomed.id,
      jsonb_build_object(
        'slug', doomed.slug,
        'name', doomed.name,
        'included_in_day_pass', doomed.included_in_day_pass,
        'day_pass_capacity', doomed.day_pass_capacity
      ),
      null
    );

    v_changed := v_changed + 1;
  end loop;

  for entry in select * from jsonb_array_elements(coalesce(p_facilities, '[]'::jsonb)) loop
    v_sort := v_sort + 1;

    v_after := jsonb_build_object(
      'name', btrim(entry ->> 'name'),
      'included_in_day_pass', (entry ->> 'included_in_day_pass')::boolean,
      'day_pass_capacity', nullif(entry ->> 'day_pass_capacity', '')::integer
    );

    if entry ->> 'id' is null then
      insert into facility (
        property_id, slug, name, included_in_day_pass, day_pass_capacity, sort_order
      )
      values (
        p_property_id,
        facility_slug(v_after ->> 'name'),
        v_after ->> 'name',
        (v_after ->> 'included_in_day_pass')::boolean,
        (v_after ->> 'day_pass_capacity')::integer,
        v_sort
      )
      returning id into v_id;

      perform audit_settings_change(
        p_property_id, p_actor_id, 'facility.added', 'facility', v_id, null,
        v_after || jsonb_build_object('slug', facility_slug(v_after ->> 'name'))
      );

      v_changed := v_changed + 1;
    else
      v_id := (entry ->> 'id')::uuid;

      select jsonb_build_object(
        'name', f.name,
        'included_in_day_pass', f.included_in_day_pass,
        'day_pass_capacity', f.day_pass_capacity
      )
      into v_before
      from facility f
      where f.property_id = p_property_id and f.id = v_id;

      if not found then
        raise exception 'facility_not_found:%', entry ->> 'name' using errcode = 'PV001';
      end if;

      -- The slug is deliberately not updated. See the table comment: a rename
      -- must not move what a public page joins on.
      update facility set
        name = v_after ->> 'name',
        included_in_day_pass = (v_after ->> 'included_in_day_pass')::boolean,
        day_pass_capacity = (v_after ->> 'day_pass_capacity')::integer,
        sort_order = v_sort
      where id = v_id;

      if audit_settings_change(
        p_property_id, p_actor_id, 'facility.updated', 'facility', v_id, v_before, v_after
      ) then
        v_changed := v_changed + 1;
      end if;
    end if;
  end loop;

  return v_changed;
end;
$function$;

create function save_day_pass_settings(
  p_property_id uuid,
  p_expected_updated_at timestamptz,
  p_bands jsonb,
  p_bundles jsonb,
  p_facilities jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_current timestamptz;
  v_changed integer := 0;
  v_bands jsonb;
begin
  v_current := settings_token(p_property_id, p_expected_updated_at);

  if jsonb_array_length(coalesce(p_bands, '[]'::jsonb)) = 0 then
    raise exception 'bands_required:' using errcode = 'PV001';
  end if;

  if not day_pass_bands_are_contiguous(p_bands) then
    raise exception 'bands_not_contiguous:' using errcode = 'PV001';
  end if;

  v_bands := save_day_pass_bands(p_property_id, p_bands, p_actor_id);
  v_changed := v_changed + (v_bands ->> 'changed')::integer;
  v_changed := v_changed + save_day_pass_bundles(
    p_property_id, p_bundles, v_bands -> 'ids', p_actor_id
  );
  v_changed := v_changed + prune_day_pass_bands(p_property_id, v_bands -> 'ids', p_actor_id);
  v_changed := v_changed + save_facilities(p_property_id, p_facilities, p_actor_id);

  return jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'settings_updated_at', settings_touched(p_property_id, v_changed, v_current)
  );

exception
  when sqlstate 'PV001' then
    return jsonb_build_object(
      'ok', false,
      'error', split_part(sqlerrm, ':', 1),
      'detail', nullif(split_part(sqlerrm, ':', 2), '')
    );
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate_label', 'detail', sqlerrm);
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'band_in_use', 'detail', sqlerrm);
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_value', 'detail', sqlerrm);
  when not_null_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'invalid_value', 'detail', sqlerrm);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. save_document_retention() — the periods, and what they do to what is
--     already held.
--
-- The anchors are attach_document()'s, unchanged: an identity document counts
-- from the stay's last day in the property's own timezone — a stay date is a
-- calendar date there, so adding months to it and reading the result as UTC
-- would move the expiry by eight hours and, at a month boundary, by a day —
-- and every other kind from when the file was taken. Only the period moves.
--
-- All four kinds must arrive. A partial save would leave a kind unstated, and
-- the one thing 20260907000100 refuses to do is apply a period nobody agreed.
-- ═══════════════════════════════════════════════════════════════════════════

create function save_document_retention(
  p_property_id uuid,
  p_expected_updated_at timestamptz,
  p_months jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_kind text;
  v_current timestamptz;
  v_changed integer := 0;
  v_months integer;
  v_was integer;
  v_time_zone text;
  v_rescheduled integer;
begin
  v_current := settings_token(p_property_id, p_expected_updated_at);

  select time_zone into v_time_zone from property where id = p_property_id;

  foreach v_kind in array array['identity', 'payment_slip', 'inspection_photo', 'accounting_pack']
  loop
    v_months := nullif(p_months ->> v_kind, '')::integer;

    if v_months is null then
      raise exception 'kind_missing:%', v_kind using errcode = 'PV001';
    end if;

    if v_months <= 0 or v_months > 1200 then
      raise exception 'months_invalid:%', v_kind using errcode = 'PV001';
    end if;

    select months into v_was
    from document_retention
    where property_id = p_property_id and kind = v_kind;

    if v_was is not distinct from v_months then
      continue;
    end if;

    insert into document_retention (property_id, kind, months)
    values (p_property_id, v_kind, v_months)
    on conflict (property_id, kind) do update set months = excluded.months, updated_at = now();

    if v_kind = 'identity' then
      update document d
      set retain_until = coalesce(
        (
          select (o.end_date + make_interval(months => v_months))
            at time zone coalesce(v_time_zone, 'Asia/Brunei')
          from occupancy o
          where o.booking_id = d.booking_id
            and o.property_id = d.property_id
            and o.end_date is not null
        ),
        d.uploaded_at + make_interval(months => v_months)
      )
      where d.property_id = p_property_id and d.kind = v_kind and d.deleted_at is null;
    else
      update document d
      set retain_until = d.uploaded_at + make_interval(months => v_months)
      where d.property_id = p_property_id and d.kind = v_kind and d.deleted_at is null;
    end if;

    get diagnostics v_rescheduled = row_count;

    -- Written directly rather than through audit_settings_change(), and this is
    -- the one place that is right. `kind` is equal on both sides — it is what
    -- the event is ABOUT, not something that changed — so the diff would strip
    -- it and leave a row saying twelve months became six with no way to tell
    -- which document it governed. The months are known to differ by the
    -- `continue` above, so there is nothing for a diff to decide.
    --
    -- `documents_rescheduled` is on the row because it is the consequence the
    -- person needs to see: shortening identity retention to six months is a
    -- different act when it moves four files than when it moves none.
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'document_retention.updated', 'document_retention',
      p_property_id,
      jsonb_build_object('kind', v_kind, 'months', v_was),
      jsonb_build_object(
        'kind', v_kind, 'months', v_months, 'documents_rescheduled', v_rescheduled
      )
    );

    v_changed := v_changed + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'settings_updated_at', settings_touched(p_property_id, v_changed, v_current)
  );

exception
  when sqlstate 'PV001' then
    return jsonb_build_object(
      'ok', false,
      'error', split_part(sqlerrm, ':', 1),
      'detail', nullif(split_part(sqlerrm, ':', 2), '')
    );
  when check_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'invalid_value', 'detail', sqlerrm);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. save_bank_accounts().
-- ═══════════════════════════════════════════════════════════════════════════

create function save_bank_accounts(
  p_property_id uuid,
  p_expected_updated_at timestamptz,
  p_accounts jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  entry jsonb;
  doomed record;
  v_current timestamptz;
  v_changed integer := 0;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_sort integer := 0;
begin
  v_current := settings_token(p_property_id, p_expected_updated_at);

  for doomed in
    select a.id, a.bank_name, a.account_number
    from bank_account a
    where a.property_id = p_property_id
      and a.id not in (
        select (e ->> 'id')::uuid
        from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb)) e
        where e ->> 'id' is not null
      )
  loop
    delete from bank_account where id = doomed.id;

    perform audit_settings_change(
      p_property_id, p_actor_id, 'bank_account.removed', 'bank_account', doomed.id,
      jsonb_build_object('bank_name', doomed.bank_name, 'account_number', doomed.account_number),
      null
    );

    v_changed := v_changed + 1;
  end loop;

  for entry in select * from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb)) loop
    v_sort := v_sort + 1;

    v_after := jsonb_build_object(
      'bank_name', btrim(entry ->> 'bank_name'),
      'account_number', btrim(entry ->> 'account_number')
    );

    if entry ->> 'id' is null then
      insert into bank_account (property_id, bank_name, account_number, sort_order)
      values (
        p_property_id, v_after ->> 'bank_name', v_after ->> 'account_number', v_sort
      )
      returning id into v_id;

      perform audit_settings_change(
        p_property_id, p_actor_id, 'bank_account.added', 'bank_account', v_id, null, v_after
      );

      v_changed := v_changed + 1;
    else
      v_id := (entry ->> 'id')::uuid;

      select jsonb_build_object('bank_name', a.bank_name, 'account_number', a.account_number)
      into v_before
      from bank_account a
      where a.property_id = p_property_id and a.id = v_id;

      if not found then
        raise exception 'account_not_found:%', entry ->> 'bank_name' using errcode = 'PV001';
      end if;

      update bank_account set
        bank_name = v_after ->> 'bank_name',
        account_number = v_after ->> 'account_number',
        sort_order = v_sort
      where id = v_id;

      if audit_settings_change(
        p_property_id, p_actor_id, 'bank_account.updated', 'bank_account', v_id, v_before, v_after
      ) then
        v_changed := v_changed + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'settings_updated_at', settings_touched(p_property_id, v_changed, v_current)
  );

exception
  when sqlstate 'PV001' then
    return jsonb_build_object(
      'ok', false,
      'error', split_part(sqlerrm, ':', 1),
      'detail', nullif(split_part(sqlerrm, ':', 2), '')
    );
  when check_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'invalid_value', 'detail', sqlerrm);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. Fill what already exists.
--
-- A no-op on a fresh local stack, where migrations run before seed.sql and
-- there is no property yet. On every database that has one — which is every
-- deployed database — this is the backfill, and it is also the first time
-- document_retention has ever been populated outside `db reset`.
-- ═══════════════════════════════════════════════════════════════════════════

select seed_property_settings(id) from property;

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. Grants. Service-role only, like every other writer in this schema.
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function facility_slug(text) from public, anon, authenticated;
revoke execute on function seed_property_settings(uuid) from public, anon, authenticated;
revoke execute on function audit_changed_fields(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function audit_settings_change(uuid, uuid, text, text, uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function property_settings(uuid) from public, anon, authenticated;
revoke execute on function settings_token(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function settings_touched(uuid, integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function day_pass_bands_are_contiguous(jsonb) from public, anon, authenticated;
revoke execute on function save_pricing_settings(uuid, timestamptz, jsonb, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function save_day_pass_bands(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function prune_day_pass_bands(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function save_day_pass_bundles(uuid, jsonb, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function save_facilities(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function save_day_pass_settings(uuid, timestamptz, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function save_document_retention(uuid, timestamptz, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function save_bank_accounts(uuid, timestamptz, jsonb, uuid)
  from public, anon, authenticated;

grant execute on function property_settings(uuid) to service_role;
grant execute on function seed_property_settings(uuid) to service_role;
grant execute on function save_pricing_settings(uuid, timestamptz, jsonb, jsonb, uuid)
  to service_role;
grant execute on function save_day_pass_settings(uuid, timestamptz, jsonb, jsonb, jsonb, uuid)
  to service_role;
grant execute on function save_document_retention(uuid, timestamptz, jsonb, uuid) to service_role;
grant execute on function save_bank_accounts(uuid, timestamptz, jsonb, uuid) to service_role;

-- The internals are reached only from the four functions above, which run as
-- their caller. service_role needs execute on them for that to work; nothing
-- else does.
grant execute on function facility_slug(text) to service_role;
grant execute on function audit_changed_fields(jsonb, jsonb) to service_role;
grant execute on function audit_settings_change(uuid, uuid, text, text, uuid, jsonb, jsonb)
  to service_role;
grant execute on function settings_token(uuid, timestamptz) to service_role;
grant execute on function settings_touched(uuid, integer, timestamptz) to service_role;
grant execute on function day_pass_bands_are_contiguous(jsonb) to service_role;
grant execute on function save_day_pass_bands(uuid, jsonb, uuid) to service_role;
grant execute on function prune_day_pass_bands(uuid, jsonb, uuid) to service_role;
grant execute on function save_day_pass_bundles(uuid, jsonb, jsonb, uuid) to service_role;
grant execute on function save_facilities(uuid, jsonb, uuid) to service_role;
