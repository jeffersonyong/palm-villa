-- Property, unit types and units.
--
-- architecture.md §5.1 conventions applied throughout this schema:
--   * primary keys are uuid; human-facing references are separate, unique,
--     indexed columns (`unit.ref`, `booking.reference`)
--   * every table carries `property_id` and every query is scoped by it
--   * money is integer cents (BND), never floats
--   * timestamps are timestamptz UTC; stay dates are `date`, interpreted in the
--     property timezone (Asia/Brunei, UTC+8, no DST)
--
-- Property-scoped tables additionally carry a `unique (property_id, id)` so
-- child tables can use a composite foreign key. That makes it structurally
-- impossible for a row to reference a parent in a different property, which is
-- the cheap half of the multi-property insurance in architecture.md §11 — the
-- discipline lives in the data layer, and no multi-property UI is built in v1.

create table property (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Stay dates are calendar dates in this zone. Stored per property rather than
  -- as a constant so a second property is configuration, not a code change.
  time_zone text not null default 'Asia/Brunei',
  currency text not null default 'BND',
  created_at timestamptz not null default now()
);

comment on table property is 'The building. v1 seeds exactly one (architecture.md 5.1).';

create table unit_type (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  -- URL-safe identifier, shared with lib/domain/config.ts and the public site's
  -- content module. `lib/db` exposes the slug as the app-level `unitTypeId`, so
  -- neither the screens nor the pricing engine need to know about uuids.
  slug text not null,
  name text not null,
  base_rate_cents integer not null check (base_rate_cents >= 0),
  -- prd.md §18 N2 is open: whether this is a hard cap or the threshold above
  -- which the extra-person charge applies is selected by `paxPolicy` in
  -- lib/domain/config.ts. The number is the same either way; only its meaning
  -- is unresolved, so it is stored without prejudice.
  max_pax integer not null check (max_pax > 0),
  car_parks integer not null check (car_parks >= 0),
  created_at timestamptz not null default now(),
  unique (property_id, slug),
  unique (property_id, id)
);

create table unit (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  unit_type_id uuid not null,
  -- TODO(client): the building's real unit numbering is unknown — nothing in
  -- prd.md records how units are labelled on the doors. The seed generates a
  -- provisional scheme so units are distinguishable on screen; see the new
  -- open question in prd.md §18. Renumbering is an update to this column.
  ref text not null,
  created_at timestamptz not null default now(),
  unique (property_id, ref),
  unique (property_id, id),
  foreign key (property_id, unit_type_id) references unit_type (property_id, id)
);

-- Deliberately absent: `unit.status` (the prd.md §6.4 lifecycle). Nothing built
-- sets or reads it, and most of that lifecycle is derivable from occupancy. An
-- unread status column that availability silently ignores is worse than none;
-- it lands with the housekeeping and inspection slice, which is what will
-- actually write to it (`out_of_service` is the part that is not derivable).

create index unit_property_type_idx on unit (property_id, unit_type_id);
