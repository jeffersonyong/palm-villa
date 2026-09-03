-- Seed: the property, its unit types, its units, and the predefined roles.
--
-- architecture.md §10 defines the local environment as "Supabase CLI local
-- stack; seed script creates the property, unit types, units, facilities,
-- roles." Applied by `npm run db:reset`, which drops the database, replays
-- every migration and runs this.
--
-- ── What is NOT in here, and why ───────────────────────────────────────────
--
-- No bookings, in THIS file. The demo bookings that populated the portal's list
-- screens lived in lib/db/demo-seed.ts and were deleted with the fixture layer;
-- a seed that invented guests would put fictional people in a real database.
-- That still holds for anything the property itself is made of, which is what
-- this file seeds.
--
-- Local development gets its bookings from ./seeds/demo.sql, loaded after this
-- one and only ever by `supabase db reset` against the CLI stack. Its header
-- explains what keeps the distinction honest: scenario-named DEMO guests
-- rather than invented people, and every row written through
-- create_walk_in_booking() rather than inserted, so it is data the application
-- could have produced. Drop it from config.toml's `sql_paths` to work against
-- the empty states instead.
--
-- No facilities. architecture.md §10 lists them, but prd.md §7.2 has three of
-- the seven pending a Ladyboss decision (C1) and every capacity unknown (C2),
-- and nothing built reads them. They land with the day-pass flow in phase two,
-- which is the first thing that needs facility headroom to mean something.
--
-- Nothing invented. Every number below is a [C] value from prd.md, except the
-- unit references, which are flagged where they appear.

insert into property (name)
values ('Palm Villa');

-- Unit types (prd.md §7.1, all rates [C]).
--
-- These figures are duplicated in lib/domain/config.ts, which is still the
-- pricing engine's source of truth: that module also holds the values with no
-- database home yet — the TODO(client) fields covering prd.md §18 N2, N3, N4,
-- N6, N7, N8. Moving PropertyConfig wholesale into the database is a later
-- slice. Until then lib/db/inventory.test.ts asserts these rows and
-- palmVillaConfig agree, so the two copies cannot drift silently.
--
-- max_pax is stored without prejudice to prd.md §18 N2: the number is the same
-- whether it turns out to be a hard cap or the threshold above which the BND 7
-- extra-person charge applies. Only its meaning is open, and that lives in
-- `paxPolicy`.
insert into unit_type (property_id, slug, name, base_rate_cents, max_pax, car_parks)
select
  p.id,
  spec.slug,
  spec.name,
  spec.base_rate_cents,
  spec.max_pax,
  spec.car_parks
from property p
cross join (
  values
    -- prd.md §7.1 states "4 adults + 2 children" for the 2-bedroom alone.
    ('two-bedroom', '2-bedroom', 18000, 6, 2),
    ('three-bedroom', '3-bedroom', 20000, 8, 2),
    ('four-bedroom', '4-bedroom', 25000, 10, 2),
    ('semi-detached', 'Semi-detached', 32000, 20, 4)
) as spec (slug, name, base_rate_cents, max_pax, car_parks);

-- Units — 48 of them, and only the 48 that prd.md §7.1 confirms.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- TODO(client): prd.md §18 N1 — how many 2-bedroom units are there, and does
-- the 48-unit total still hold?
--
-- The 2-bedroom type is seeded with ZERO units. Its rate is confirmed so the
-- type exists and prices correctly, but its unit count is [O] and the fixture
-- layer's invented 4 does not reach a real database. Answering N1 is one
-- INSERT; inventing a number now would put a figure nobody agreed into the
-- system of record and quietly make it true.
--
-- TODO(client): the unit reference scheme below is PROVISIONAL. Nothing in
-- prd.md records how units are labelled on the doors, so `3B-01` is a
-- placeholder that makes units distinguishable on screen, not the building's
-- numbering. Added to prd.md §18 as an open question.
-- ═══════════════════════════════════════════════════════════════════════════
insert into unit (property_id, unit_type_id, ref)
select
  ut.property_id,
  ut.id,
  spec.ref_prefix || '-' || lpad(n::text, 2, '0')
from (
  values
    ('three-bedroom', '3B', 36),
    ('four-bedroom', '4B', 6),
    ('semi-detached', 'SD', 6)
) as spec (slug, ref_prefix, unit_count)
join unit_type ut on ut.slug = spec.slug
cross join lateral generate_series(1, spec.unit_count) as n;

-- Predefined roles (prd.md §4).
--
-- v1 ships a fixed set, each pre-assigned a permission set, and a user may hold
-- more than one — which is what makes the uncertain team structure a non-issue
-- rather than a blocker. Roles and their permissions are editable in the admin
-- UI later without a code change, so nothing below is load-bearing on the shape
-- of the team.
insert into staff_role (property_id, slug, name)
select p.id, spec.slug, spec.name
from property p
cross join (
  values
    ('admin', 'Admin'),
    ('front-office', 'Front Office'),
    ('housekeeping', 'Housekeeping'),
    ('security', 'Security'),
    ('finance', 'Finance')
) as spec (slug, name);

-- Admin holds everything, including config.manage and document.view_identity.
insert into role_permission (property_id, role_id, permission)
select r.property_id, r.id, permission
from staff_role r
cross join unnest(array[
  'booking.view', 'booking.create', 'booking.amend', 'booking.cancel',
  'booking.override_hold', 'booking.discount', 'payment.verify',
  'payment.record_cash', 'inspection.record', 'charge.create', 'charge.waive',
  'deposit.approve_release', 'unit.manage', 'tenancy.manage',
  'config.manage', 'report.view', 'document.view_identity'
]) as permission
where r.slug = 'admin';

-- Front Office holds `tenancy.manage` because declaring a unit leased
-- long-term (capability B9) is a commercial statement rather than an
-- operational one, and prd.md §4 gives Housekeeping `unit.manage` "(status
-- only)" — the desk marks a lease, the cleaner does not.
insert into role_permission (property_id, role_id, permission)
select r.property_id, r.id, permission
from staff_role r
cross join unnest(array[
  'booking.view', 'booking.create', 'booking.amend', 'booking.cancel',
  'booking.override_hold', 'booking.discount', 'payment.verify',
  'payment.record_cash', 'charge.create', 'unit.manage', 'tenancy.manage',
  'document.view_identity'
]) as permission
where r.slug = 'front-office';

-- Housekeeping records the inspection; a separate role approves the release
-- (prd.md §4 [C]). Its booking view is read-only, which `booking.view` is.
insert into role_permission (property_id, role_id, permission)
select r.property_id, r.id, permission
from staff_role r
cross join unnest(array[
  'booking.view', 'inspection.record', 'unit.manage'
]) as permission
where r.slug = 'housekeeping';

-- ── Security ───────────────────────────────────────────────────────────────
-- prd.md §4 describes this role as "today's arrivals view, check-in action,
-- read-only booking summary. No document or payment access."
--
-- FLAGGED: the canonical permission set in prd.md §4 has no string for the
-- check-in action. Security therefore holds `booking.view` alone, and the
-- check-in permission is NOT invented here — a gap in the PRD is a question for
-- the client, not a permission string minted in a seed file. Raised in the PR
-- alongside the other open items; adding it later is one row and one migration
-- widening the check constraint.
insert into role_permission (property_id, role_id, permission)
select r.property_id, r.id, 'booking.view'
from staff_role r
where r.slug = 'security';

insert into role_permission (property_id, role_id, permission)
select r.property_id, r.id, permission
from staff_role r
cross join unnest(array[
  'booking.view', 'payment.verify', 'deposit.approve_release',
  'charge.waive', 'report.view'
]) as permission
where r.slug = 'finance';

-- No user_role rows: there are no staff accounts yet. Supabase Auth users and
-- their role grants arrive with the auth slice.

-- ── Document retention (capability G4, architecture.md §8) ─────────────────
--
-- The defaults architecture.md §8 states, as rows rather than constants: §11
-- makes every policy figure per-property configuration, and G4 promises the
-- client a retention policy they can change. Capability F3 is the screen that
-- edits them; until it exists these are what the system ships with.
--
-- Seeded rather than defaulted in code on purpose. attach_document() REFUSES a
-- kind with no row here, so a missing period is a visible error at a desk
-- rather than a number nobody agreed applied to somebody's identity document.
--
--   identity          12 months after checkout
--   payment_slip      84 months (7 years, accounting records)
--   accounting_pack   84 months (7 years, same)
--   inspection_photo  24 months
insert into document_retention (property_id, kind, months)
select p.id, spec.kind, spec.months
from property p
cross join (
  values
    ('identity', 12),
    ('payment_slip', 84),
    ('inspection_photo', 24),
    ('accounting_pack', 84)
) as spec (kind, months);
