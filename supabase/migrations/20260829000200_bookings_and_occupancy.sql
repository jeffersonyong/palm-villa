-- Guests, bookings, booking lines and occupancy — and the constraint that makes
-- double booking structurally impossible (capability G1).

create table guest (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  created_at timestamptz not null default now(),
  unique (property_id, id)
);

-- Staff look guests up by the number they were called on.
create index guest_property_phone_idx on guest (property_id, phone);

-- Booking statuses are the prd.md §9.2 machine, as a check constraint rather
-- than an enum: prd.md §9.4 records that a `confirmed_payment_due` state is an
-- additive change if booked-ahead ever enters scope, and widening a check is a
-- one-line migration where widening an enum is not.
--
-- The constraint lists the legal states. It does NOT encode the legal moves
-- between them: architecture.md §5.3 puts the transition table in exactly one
-- place, `transition()` in lib/domain/booking-state.ts, and no code path — this
-- schema included — assigns a status without going through it.
create table booking (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  -- architecture.md §6.1: `PV-` + 4 digits, unique per property, short enough
  -- to type into a bank transfer description. Allocated by
  -- next_booking_reference(); never used in a URL (§7 uses tokens).
  reference text not null,
  stream text not null check (stream in ('short_stay', 'day_pass', 'tenancy')),
  status text not null check (
    status in (
      'draft', 'held', 'awaiting_payment_verification', 'confirmed',
      'checked_in', 'completed', 'expired', 'cancelled', 'no_show'
    )
  ),
  guest_id uuid not null,
  chargeable_guests integer not null check (chargeable_guests >= 0),
  exempt_guests integer not null check (exempt_guests >= 0),
  -- Held on the booking rather than as an array on the guest, which is how
  -- prd.md §6.2 sketches it: Security checks the vehicle that arrived for THIS
  -- stay, and the same guest returning in a different car is a different fact.
  vehicle_registration text,
  total_cents integer not null check (total_cents >= 0),
  -- prd.md §9.5 N5 asks for the booking payment and the security deposit to be
  -- named distinctly in the product "before the ambiguity propagates into the
  -- schema". This column is therefore never a bare `deposit`. Which of the two
  -- is forfeited on cancellation remains open, and nothing here depends on the
  -- answer: no cancellation or forfeiture behaviour is implemented.
  security_deposit_cents integer not null default 0 check (security_deposit_cents >= 0),
  -- architecture.md §6.3. Null for walk-ins, which are paid on the spot and
  -- never pass through `held` (prd.md §9.4).
  hold_expires_at timestamptz,
  -- auth.users.id once the auth slice lands; nullable until then.
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, reference),
  unique (property_id, id),
  foreign key (property_id, guest_id) references guest (property_id, id)
);

create index booking_property_status_idx on booking (property_id, status);

-- prd.md §8: "Pricing is a line-item calculation, never a single stored price."
-- The booking total is the sum of these rows, and the check below stops a line
-- from disagreeing with its own parts — the same invariant `line()` enforces in
-- lib/domain/lines.ts.
create table booking_line (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  booking_id uuid not null,
  line_type text not null check (
    line_type in (
      'accommodation', 'extra_person', 'sofa_bed', 'early_check_in',
      'late_check_out', 'day_pass', 'day_pass_bundle'
    )
  ),
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null,
  amount_cents integer not null,
  -- Receipt order, so a re-read renders the lines as they were priced.
  sort_order integer not null,
  constraint booking_line_amount_matches_parts check (amount_cents = quantity * unit_price_cents),
  unique (property_id, booking_id, sort_order),
  foreign key (property_id, booking_id) references booking (property_id, id) on delete cascade
);

-- prd.md §6.1: a short stay and a long tenancy are the same object — unit X is
-- occupied from date A to date B. One concept means one availability query, and
-- makes phase-three tenancy additive rather than a second system.
create table occupancy (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  unit_id uuid not null,
  -- Not null for now. The tenancy slice widens this to "one of booking_id or
  -- tenancy_id", per the prd.md §6.2 entity sketch.
  booking_id uuid not null,
  occupancy_type text not null check (occupancy_type in ('short_stay', 'tenancy')),
  -- Mirrors booking.status, maintained by the trigger below and by nothing
  -- else. The exclusion constraint needs the status on this row, and two
  -- hand-maintained statuses would drift; the booking stays the single writer.
  status text not null check (
    status in (
      'draft', 'held', 'awaiting_payment_verification', 'confirmed',
      'checked_in', 'completed', 'expired', 'cancelled', 'no_show'
    )
  ),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint occupancy_covers_at_least_one_night check (end_date > start_date),
  unique (property_id, id),
  foreign key (property_id, unit_id) references unit (property_id, id),
  foreign key (property_id, booking_id) references booking (property_id, id) on delete cascade
);

create index occupancy_booking_idx on occupancy (booking_id);
create index occupancy_property_dates_idx on occupancy (property_id, start_date, end_date);

-- ═══════════════════════════════════════════════════════════════════════════
-- CAPABILITY G1 — double booking is structurally impossible.
--
-- scope-of-capabilities.md G1 promises the client in writing that this is
-- "enforced by the database itself, not by staff vigilance or an approval
-- step". prd.md §15 and architecture.md §5.2 both require it here and both
-- explicitly rule out application logic, which loses the race at exactly the
-- moment the guarantee matters: two staff members submitting at the same
-- instant. Every overlap check in TypeScript is a courtesy that turns a
-- constraint violation into a sentence on screen. THIS is the control.
--
-- Half-open ranges `[)` make back-to-back bookings legal by construction: a
-- guest checking out on the 14th and another checking in on the 14th do not
-- overlap. lib/domain/availability.ts uses the same semantics deliberately, so
-- the preview and the database agree at the boundary.
--
-- A `held` occupancy participates — a held unit is unavailable — and is
-- released by hold expiry (architecture.md §6.3). Only `expired` and
-- `cancelled` release the unit.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists btree_gist;

alter table occupancy add constraint no_overlapping_occupancy
  exclude using gist (
    unit_id with =,
    daterange(start_date, end_date, '[)') with &&
  )
  where (status not in ('expired', 'cancelled'));

-- Keeps the occupancy row's status in step with its booking, so a cancelled
-- booking releases its unit and a reinstated one does not silently stay free.
create function sync_occupancy_status() returns trigger
language plpgsql
as $function$
begin
  update occupancy set status = new.status where booking_id = new.id;

  return new;
end;
$function$;

create trigger booking_status_syncs_occupancy
  after update of status on booking
  for each row
  when (old.status is distinct from new.status)
  execute function sync_occupancy_status();

create function touch_updated_at() returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();

  return new;
end;
$function$;

create trigger booking_touch_updated_at
  before update on booking
  for each row
  execute function touch_updated_at();
