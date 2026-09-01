-- The bookings list becomes one stream-aware register, and a booking carries
-- every vehicle arriving on it rather than one.
--
-- Two changes that happen to land together because both reshape the same read
-- model, and `booking_summary` can only be rebuilt once per migration without
-- the second rebuild dropping the first.
--
-- ── 1. A booking has vehicles, plural ──────────────────────────────────────
--
-- prd.md §2 records what is collected at booking time — "name, phone number,
-- number of people, vehicle registration number" — and §13 [C] makes name and
-- vehicle registration *required* "for records and security". The column being
-- nullable was the gap: the requirement was written down and never enforced.
--
-- Plural because a booking is frequently a family arriving in two or three
-- cars, and Security checks a plate at the gate (prd.md §12.5: "vehicle
-- registration lookup is a first-class path, not a fallback"). One column held
-- one plate, so the second car was either absent from the system or crammed in
-- beside the first as free text nobody could search.
--
-- A child table rather than `text[]`: the gate lookup is `where registration =
-- ?`, which wants a row and an index on it, and D2's search screen will join
-- against it. An array would push that into `= any(...)` over an unindexed
-- expression on every arrival.
--
-- ── 2. booking_summary stops joining day passes out ────────────────────────
--
-- The screen already promises "every booking across all streams — the single
-- source of truth", and the view's inner join to occupancy made that untrue by
-- construction: a day pass occupies no unit (prd.md §6.1) and therefore has no
-- occupancy row, so it could never appear. `payment_summary` set this
-- precedent in 20260831000100 for the same reason — a payment that vanishes
-- from the queue because its booking has no room is a payment nobody verifies.
--
-- Nothing writes a day-pass booking yet; the day-pass flow is phase two. What
-- this does is make the read model able to carry one, so that slice adds a
-- writer rather than reworking every list screen.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. booking_vehicle
-- ═══════════════════════════════════════════════════════════════════════════

create table booking_vehicle (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  booking_id uuid not null,
  -- Stored as the staff member typed it after normalisation (upper case,
  -- single-spaced) — see normaliseVehicleRegistration in lib/domain/vehicle.ts.
  -- No format check: Brunei plates are not one shape, and a constraint that
  -- refuses a legitimate plate at the front desk is worse than a loose one.
  registration text not null check (length(trim(registration)) > 0),
  -- Display order, so the plate the guest gave first stays first.
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (property_id, booking_id, sort_order),
  -- The same car cannot be listed twice on one booking. This is what makes the
  -- gate lookup unambiguous.
  unique (property_id, booking_id, registration),
  foreign key (property_id, booking_id) references booking (property_id, id) on delete cascade
);

-- The gate's lookup: a guard has a plate and needs the booking (prd.md §12.5).
create index booking_vehicle_property_registration_idx
  on booking_vehicle (property_id, registration);

alter table booking_vehicle enable row level security;

-- Every plate already recorded moves across, first in order.
insert into booking_vehicle (property_id, booking_id, registration, sort_order)
select b.property_id, b.id, b.vehicle_registration, 0
from booking b
where b.vehicle_registration is not null
  and length(trim(b.vehicle_registration)) > 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. booking.no_vehicle — the deliberate exception
--
-- A vehicle is now required, so the rare guest who arrives without one needs a
-- way to say so that is distinguishable from a field left blank. That is what
-- this flag is: an assertion someone made, not an absence.
--
-- Deliberately NOT backfilled to true for the bookings that carried no plate.
-- Those were taken while the field was optional, so nobody asserted anything
-- about them; they have no vehicles and no exception, which the product reads
-- as "not recorded" and the amend form asks staff to resolve. Backfilling would
-- have put words in the mouth of whoever took the booking.
--
-- The rule "at least one vehicle, or the exception" is enforced in
-- create_walk_in_booking() and amend_booking() below — the only two writers —
-- rather than as a constraint, because it spans two tables and a check
-- constraint cannot see across one. It is not in the same class as the G1
-- exclusion constraint: a booking missing a plate is a record-keeping gap, not
-- a unit sold twice.
-- ═══════════════════════════════════════════════════════════════════════════

alter table booking add column no_vehicle boolean not null default false;

comment on column booking.no_vehicle is
  'The guest asserted they are arriving without a vehicle (prd.md §13 [C] requires a registration otherwise). False plus no booking_vehicle rows means not recorded, which is the legacy case, not an assertion.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. booking_summary — every stream, and every plate.
--
-- Dropped and recreated rather than replaced: `create or replace view` can only
-- append columns, and `vehicle_registration` is going away.
-- ═══════════════════════════════════════════════════════════════════════════

drop view booking_summary;

alter table booking drop column vehicle_registration;

create view booking_summary
with (security_invoker = true)
as
select
  b.id,
  b.property_id,
  b.reference,
  b.status,
  b.stream,
  g.name as guest_name,
  g.phone as guest_phone,
  b.chargeable_guests,
  b.exempt_guests,
  b.total_cents,
  b.security_deposit_cents,
  b.hold_expires_at,
  b.created_at,
  b.updated_at,
  b.no_vehicle,
  -- LEFT from here down. A day pass consumes facility capacity on a date and
  -- occupies no unit (prd.md §6.1), so every column below is null for one —
  -- which is what makes this row appear at all.
  o.unit_id,
  u.ref as unit_ref,
  ut.slug as unit_type_slug,
  o.start_date as check_in,
  o.end_date as check_out,
  coalesce(l.lines, '[]'::jsonb) as lines,
  coalesce(v.vehicles, '[]'::jsonb) as vehicles
from booking b
join guest g on g.id = b.guest_id
left join occupancy o on o.booking_id = b.id
left join unit u on u.id = o.unit_id
left join unit_type ut on ut.id = u.unit_type_id
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'type', bl.line_type,
      'description', bl.description,
      'quantity', bl.quantity,
      'unitPrice', bl.unit_price_cents,
      'amount', bl.amount_cents
    )
    order by bl.sort_order
  ) as lines
  from booking_line bl
  where bl.booking_id = b.id
) l on true
left join lateral (
  select jsonb_agg(bv.registration order by bv.sort_order) as vehicles
  from booking_vehicle bv
  where bv.booking_id = b.id
) v on true;

comment on view booking_summary is
  'Every booking, whichever stream it belongs to. Occupancy is joined LEFT: a day pass has no unit and no dates here (prd.md 6.1), and gets those from the day-pass read model when that slice lands.';

revoke all on booking_summary from public, anon, authenticated;
grant select on booking_summary to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. create_walk_in_booking() takes a list of plates.
--
-- Dropped and recreated for the reason 20260830000100 set out: `create or
-- replace function` cannot change a parameter list, it defines an overload, and
-- an overload reachable by the same argument names is the ambiguity PostgREST
-- resolves badly.
-- ═══════════════════════════════════════════════════════════════════════════

drop function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text,
  integer, integer, integer, integer, jsonb, text, uuid
);

create function create_walk_in_booking(
  p_property_id uuid,
  p_unit_id uuid,
  p_status text,
  p_check_in date,
  p_check_out date,
  p_guest_name text,
  p_guest_phone text,
  -- Normalised and de-duplicated by the caller. Empty only when p_no_vehicle.
  p_vehicles text[],
  p_no_vehicle boolean,
  p_chargeable_guests integer,
  p_exempt_guests integer,
  p_total_cents integer,
  p_security_deposit_cents integer,
  p_lines jsonb,
  p_payment_method text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_guest_id uuid;
  v_booking_id uuid;
  v_payment_id uuid;
  v_reference text;
  v_is_cash boolean := p_payment_method = 'cash';
  v_vehicles text[] := coalesce(p_vehicles, '{}'::text[]);
begin
  -- prd.md §13 [C]: a vehicle registration is required for records and
  -- security. Raised rather than returned as a refusal, unlike the two below:
  -- those are races a staff member can lose through no fault of their own, and
  -- this is a caller that skipped its own validation.
  if cardinality(v_vehicles) = 0 and not p_no_vehicle then
    raise exception 'a booking needs at least one vehicle registration, or the no-vehicle exception';
  end if;

  -- No guest de-duplication. Matching an arriving walk-in to a previous guest
  -- on name or phone is a product decision nobody has made — prd.md says
  -- nothing about it — and silently merging two people who share a number
  -- would be worse than a duplicate row. The guest slice can consolidate.
  insert into guest (property_id, name, phone)
  values (p_property_id, p_guest_name, p_guest_phone)
  returning id into v_guest_id;

  v_reference := next_booking_reference();

  insert into booking (
    property_id, reference, stream, status, guest_id,
    chargeable_guests, exempt_guests, no_vehicle,
    total_cents, security_deposit_cents, created_by
  )
  values (
    p_property_id, v_reference, 'short_stay', p_status, v_guest_id,
    p_chargeable_guests, p_exempt_guests, p_no_vehicle,
    p_total_cents, p_security_deposit_cents, p_actor_id
  )
  returning id into v_booking_id;

  insert into booking_vehicle (property_id, booking_id, registration, sort_order)
  select p_property_id, v_booking_id, plate, (ordinality - 1)::integer
  from unnest(v_vehicles) with ordinality as plates (plate, ordinality);

  -- The line that either wins or loses the race.
  insert into occupancy (
    property_id, unit_id, booking_id, occupancy_type, status, start_date, end_date
  )
  values (
    p_property_id, p_unit_id, v_booking_id, 'short_stay', p_status, p_check_in, p_check_out
  );

  insert into booking_line (
    property_id, booking_id, line_type, description,
    quantity, unit_price_cents, amount_cents, sort_order
  )
  select
    p_property_id,
    v_booking_id,
    entry ->> 'type',
    entry ->> 'description',
    (entry ->> 'quantity')::integer,
    (entry ->> 'unitPrice')::integer,
    (entry ->> 'amount')::integer,
    (ordinality - 1)::integer
  from jsonb_array_elements(p_lines) with ordinality as elements (entry, ordinality);

  -- The payment's own status is derived here, and that asymmetry with p_status
  -- is deliberate. booking.status is a state machine architecture.md §5.3
  -- keeps in exactly one place; a payment's initial status is not a machine at
  -- all, it is a property of the method — cash has no bank to check.
  insert into payment (
    property_id, booking_id, method, status,
    expected_amount_cents, amount_cents, match_kind,
    collected_by, collected_at, verified_by, verified_at, created_by
  )
  values (
    p_property_id,
    v_booking_id,
    p_payment_method,
    case when v_is_cash then 'verified' else 'pending_verification' end,
    p_total_cents,
    case when v_is_cash then p_total_cents else null end,
    null,
    case when v_is_cash then p_actor_id else null end,
    case when v_is_cash then now() else null end,
    case when v_is_cash then p_actor_id else null end,
    case when v_is_cash then now() else null end,
    p_actor_id
  )
  returning id into v_payment_id;

  -- architecture.md §5.3: every transition writes an audit event, in the same
  -- transaction as the transition itself.
  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id,
    p_actor_id,
    'booking.created_walk_in',
    'booking',
    v_booking_id,
    null,
    jsonb_build_object(
      'reference', v_reference,
      'status', p_status,
      'unit_id', p_unit_id,
      'check_in', p_check_in,
      'check_out', p_check_out,
      'total_cents', p_total_cents,
      'security_deposit_cents', p_security_deposit_cents,
      'payment_method', p_payment_method,
      -- New: the plates are part of what was recorded at the desk, and prd.md
      -- §13 [C] makes them a record-keeping requirement — so a later dispute
      -- about which car was declared has an answer in the trail.
      'vehicles', to_jsonb(v_vehicles),
      'no_vehicle', p_no_vehicle
    )
  );

  -- And a second event against the payment itself, so the money has its own
  -- entry in the trail rather than being a field on the booking's.
  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id,
    p_actor_id,
    case when v_is_cash then 'payment.cash_recorded' else 'payment.recorded' end,
    'payment',
    v_payment_id,
    null,
    jsonb_build_object(
      'booking_id', v_booking_id,
      'reference', v_reference,
      'method', p_payment_method,
      'expected_amount_cents', p_total_cents,
      'amount_cents', case when v_is_cash then p_total_cents else null end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'reference', v_reference,
    'payment_id', v_payment_id
  );

exception
  -- The G1 constraint refusing a second booking over the same unit and dates.
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_unavailable');
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_not_found');
end;
$function$;

revoke execute on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, uuid
) from public, anon, authenticated;

grant execute on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, uuid
) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. amend_booking() replaces the whole set of plates.
--
-- Wholesale, the way the priced lines are replaced: the honest representation
-- of "the family turned up in two cars, not three" is the new set, not the old
-- set patched. The before/after audit snapshot carries both.
-- ═══════════════════════════════════════════════════════════════════════════

drop function amend_booking(
  uuid, uuid, timestamptz, uuid, date, date, text, text, text,
  integer, integer, integer, integer, jsonb, text, uuid
);

create function amend_booking(
  p_property_id uuid,
  p_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_unit_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest_name text,
  p_guest_phone text,
  p_vehicles text[],
  p_no_vehicle boolean,
  p_chargeable_guests integer,
  p_exempt_guests integer,
  p_total_cents integer,
  p_security_deposit_cents integer,
  p_lines jsonb,
  p_reason text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_occupancy occupancy%rowtype;
  v_guest guest%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_previous_vehicles jsonb;
  v_vehicles text[] := coalesce(p_vehicles, '{}'::text[]);
begin
  if cardinality(v_vehicles) = 0 and not p_no_vehicle then
    raise exception 'a booking needs at least one vehicle registration, or the no-vehicle exception';
  end if;

  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Two staff members with the same booking open is the ordinary case, not the
  -- exotic one.
  if v_booking.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'error', 'changed');
  end if;

  select * into v_occupancy
  from occupancy
  where booking_id = p_booking_id and property_id = p_property_id
  for update;

  -- Day passes occupy no unit (prd.md §6.1) and have no row here. They now
  -- reach booking_summary, so this guard is the thing that stops the amend
  -- screen — which is a *stay* amendment — being pointed at one. The day-pass
  -- slice brings its own amendment path.
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_guest from guest where id = v_booking.guest_id for update;

  select coalesce(jsonb_agg(bv.registration order by bv.sort_order), '[]'::jsonb)
  into v_previous_vehicles
  from booking_vehicle bv
  where bv.booking_id = p_booking_id and bv.property_id = p_property_id;

  v_before := jsonb_build_object(
    'unit_id', v_occupancy.unit_id,
    'check_in', v_occupancy.start_date,
    'check_out', v_occupancy.end_date,
    'guest_name', v_guest.name,
    'guest_phone', v_guest.phone,
    'vehicles', v_previous_vehicles,
    'no_vehicle', v_booking.no_vehicle,
    'chargeable_guests', v_booking.chargeable_guests,
    'exempt_guests', v_booking.exempt_guests,
    'total_cents', v_booking.total_cents,
    'security_deposit_cents', v_booking.security_deposit_cents
  );

  -- Editing the guest row in place is correct ONLY while every booking owns a
  -- guest row of its own, which create_walk_in_booking() guarantees today.
  update guest
  set name = p_guest_name, phone = p_guest_phone
  where id = v_booking.guest_id and property_id = p_property_id;

  update booking
  set chargeable_guests = p_chargeable_guests,
      exempt_guests = p_exempt_guests,
      no_vehicle = p_no_vehicle,
      total_cents = p_total_cents,
      security_deposit_cents = p_security_deposit_cents
  where id = p_booking_id and property_id = p_property_id;

  delete from booking_vehicle
  where booking_id = p_booking_id and property_id = p_property_id;

  insert into booking_vehicle (property_id, booking_id, registration, sort_order)
  select p_property_id, p_booking_id, plate, (ordinality - 1)::integer
  from unnest(v_vehicles) with ordinality as plates (plate, ordinality);

  update occupancy
  set unit_id = p_unit_id,
      start_date = p_check_in,
      end_date = p_check_out
  where booking_id = p_booking_id and property_id = p_property_id;

  -- Replaced wholesale rather than reconciled. prd.md §8 makes the lines the
  -- price — the total is their sum — so the honest representation of a
  -- reprice is the new set, not the old set patched.
  delete from booking_line
  where booking_id = p_booking_id and property_id = p_property_id;

  insert into booking_line (
    property_id, booking_id, line_type, description,
    quantity, unit_price_cents, amount_cents, sort_order
  )
  select
    p_property_id,
    p_booking_id,
    entry ->> 'type',
    entry ->> 'description',
    (entry ->> 'quantity')::integer,
    (entry ->> 'unitPrice')::integer,
    (entry ->> 'amount')::integer,
    (ordinality - 1)::integer
  from jsonb_array_elements(p_lines) with ordinality as elements (entry, ordinality);

  v_after := jsonb_build_object(
    'unit_id', p_unit_id,
    'check_in', p_check_in,
    'check_out', p_check_out,
    'guest_name', p_guest_name,
    'guest_phone', p_guest_phone,
    'vehicles', to_jsonb(v_vehicles),
    'no_vehicle', p_no_vehicle,
    'chargeable_guests', p_chargeable_guests,
    'exempt_guests', p_exempt_guests,
    'total_cents', p_total_cents,
    'security_deposit_cents', p_security_deposit_cents
  );

  if p_reason is not null then
    v_after := v_after || jsonb_build_object('reason', p_reason);
  end if;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'booking.amended', 'booking', p_booking_id, v_before, v_after
  );

  return jsonb_build_object('ok', true);

exception
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_unavailable');
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_not_found');
end;
$function$;

revoke execute on function amend_booking(
  uuid, uuid, timestamptz, uuid, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, uuid
) from public, anon, authenticated;

grant execute on function amend_booking(
  uuid, uuid, timestamptz, uuid, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, uuid
) to service_role;
