-- Staff discounts, and free-text notes on a booking.
--
-- Two additions the PRD does not yet describe, agreed with Jeff on 2026-09-01
-- and written into prd.md §8.4 and §9.7 in the same change. They are in one
-- migration because they are one slice of front-office work — the thing the
-- desk needs that the spreadsheet still does better — and neither is large
-- enough to carry its own file.
--
-- ── What this deliberately does NOT do ────────────────────────────────────
--
-- Part payments. A part-paid booking is a balance, and 20260831000100 opens by
-- recording that the payment slice "is NOT a ledger" — nothing there computes
-- one. It is also close enough to prd.md §9.4's [C] exclusion of booked-ahead,
-- pay-on-arrival that it needs the client's answer before it is built. Tracked
-- as N16 in docs/open-questions.md and reached by its own slice.
--
-- Six parts, in dependency order.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. booking_line learns a negative line.
--
-- prd.md §8: "Pricing is a line-item calculation, never a single stored
-- price." A discount is therefore a line rather than a subtraction applied to
-- a total, which is what keeps the receipt able to explain itself — the guest
-- sees what was charged, what was taken off, and a total that is still the sum
-- of what is printed.
--
-- The existing `amount_cents = quantity * unit_price_cents` check holds
-- unchanged: a discount is quantity 1 at a negative unit price. `quantity > 0`
-- holds too, and is worth keeping — it is what stops "minus two nights" being
-- expressible, which is a refund by another name.
-- ═══════════════════════════════════════════════════════════════════════════

alter table booking_line drop constraint booking_line_line_type_check;

alter table booking_line add constraint booking_line_line_type_check check (
  line_type in (
    'accommodation', 'extra_person', 'sofa_bed', 'early_check_in',
    'late_check_out', 'day_pass', 'day_pass_bundle', 'discount'
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. booking carries the discount INSTRUCTION; the line carries its effect.
--
-- Not a duplicate of the line. The line holds the resolved cents; these hold
-- what a staff member actually said, and the two are different facts the
-- moment an amendment reprices the stay: "ten percent off" against a two-night
-- booking extended to four must re-derive against the new subtotal, and a
-- stored BND 44 could not. Exactly the relationship `chargeable_guests` has to
-- the `extra_person` line it produces.
--
-- The reason is required by the constraint below, not merely by the form.
-- architecture.md §4 counts discretionary money movement as an approval
-- semantic, and a discount with no recorded why is the one thing an owner asks
-- about later that nobody can answer.
-- ═══════════════════════════════════════════════════════════════════════════

alter table booking
  add column discount_kind text check (discount_kind in ('amount', 'percent')),
  -- Cents when `amount`, whole percent when `percent`. One column rather than
  -- two nullable ones, because exactly one of the two readings is ever live
  -- and `discount_kind` says which.
  add column discount_value integer check (discount_value > 0),
  add column discount_reason text;

-- All three, or none. A discount half-recorded is worse than none recorded:
-- the total would already have moved.
alter table booking add constraint booking_discount_is_whole check (
  (discount_kind is null and discount_value is null and discount_reason is null)
  or (
    discount_kind is not null
    and discount_value is not null
    and btrim(coalesce(discount_reason, '')) <> ''
  )
);

alter table booking add constraint booking_discount_percent_in_range check (
  discount_kind is distinct from 'percent' or discount_value between 1 and 100
);

comment on column booking.discount_value is
  'Cents when discount_kind is amount; whole percent (1-100) when percent. The resolved figure lives on the discount booking_line, derived by resolveDiscount() in lib/domain/discount.ts.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. booking.discount — a permission of its own.
--
-- Not folded into `booking.create`. Every other permission in the set gates an
-- operational act; this one gates giving money away, and the point of a
-- separate string is that a manager can withhold it from a role that otherwise
-- takes bookings all day. The Roles matrix (capability F1) renders whatever
-- this list contains, so granting it is an admin action, not a deployment.
--
-- Seeded to Admin and Front Office: Front Office is who is standing at the
-- desk when a discount is asked for, and a permission nobody holds is a
-- feature nobody has. Revoking it from Front Office is one click in the matrix.
-- ═══════════════════════════════════════════════════════════════════════════

alter table role_permission drop constraint role_permission_permission_check;

alter table role_permission add constraint role_permission_permission_check check (
  permission in (
    'booking.view', 'booking.create', 'booking.amend', 'booking.cancel',
    'booking.override_hold', 'booking.discount', 'payment.verify',
    'payment.record_cash', 'inspection.record', 'charge.create', 'charge.waive',
    'deposit.approve_release', 'unit.manage', 'tenancy.manage',
    'config.manage', 'report.view', 'document.view_identity'
  )
);

-- Granted here as well as in seed.sql, because a seed runs only on `db reset`
-- of the local stack. Production schema moves by `db push`, which never runs
-- one — so without this the permission would exist and nobody would hold it.
insert into role_permission (property_id, role_id, permission)
select r.property_id, r.id, 'booking.discount'
from staff_role r
where r.slug in ('admin', 'front-office')
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. booking_note — the internal scratchpad, and what the cleaner is told.
--
-- One table with an audience tag rather than two note systems. "Notes for the
-- team" and "notes for the cleaner" are the same act — a staff member writing
-- down something about this stay that no field carries — differing only in who
-- reads it. Two tables would be two of everything, and would need reconciling
-- the first time somebody wrote the same sentence in both.
--
-- Notes are append-only in the product: there is no update or delete path in
-- lib/db, and a correction is a further note. Deliberately NOT enforced by a
-- rejection trigger the way audit_event is, and the difference is the point —
-- the audit trail is a control promised to the client, whereas this is staff
-- shorthand. Letting an author remove a note they mistyped should be a screen
-- one day, not a migration.
--
-- A note about the UNIT rather than the stay — "the shower door sticks" — has
-- no home here on purpose. It outlives every booking, so hanging it off one
-- would lose it the moment the guest leaves; it belongs to the inspections
-- slice (prd.md §11).
-- ═══════════════════════════════════════════════════════════════════════════

create table booking_note (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  booking_id uuid not null,
  -- Mirrored by NOTE_AUDIENCES in lib/domain/note.ts. A check rather than an
  -- enum, for the reason migration 000200 sets out at length.
  audience text not null check (audience in ('internal', 'housekeeping')),
  body text not null check (btrim(body) <> ''),
  -- Nullable like every other actor column in this schema: a write can
  -- originate from a path with no signed-in person behind it. In practice the
  -- server action's requirePermission() always supplies one.
  author_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (property_id, booking_id) references booking (property_id, id) on delete cascade
);

-- The detail screen's thread: one booking, newest first.
create index booking_note_booking_idx
  on booking_note (property_id, booking_id, created_at desc);

-- What the housekeeping field screen will ask for. Partial, because the
-- internal notes are the ones that accumulate and that screen never reads them.
create index booking_note_housekeeping_idx
  on booking_note (property_id, booking_id, created_at desc)
  where audience = 'housekeeping';

-- Migration 000800 enumerates the tables it enables RLS on, so a new table is
-- not covered by it. Enabled with no policies: deny-all for anon and
-- authenticated, bypassed by the service-role client, authorisation in
-- requirePermission() (architecture.md §4).
alter table booking_note enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. booking_summary carries the discount instruction.
--
-- `create or replace` rather than drop and recreate: nothing is being removed
-- or reordered, and appending is the one thing replace can do. The amendment
-- form reads these to prefill — without them a repriced stay would silently
-- lose the discount it was given.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view booking_summary
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
  o.unit_id,
  u.ref as unit_ref,
  ut.slug as unit_type_slug,
  o.start_date as check_in,
  o.end_date as check_out,
  coalesce(l.lines, '[]'::jsonb) as lines,
  coalesce(v.vehicles, '[]'::jsonb) as vehicles,
  b.discount_kind,
  b.discount_value,
  b.discount_reason
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. The two write paths learn the discount instruction.
--
-- Dropped and recreated rather than replaced, for the reason 20260830000100
-- set out: `create or replace function` cannot add a parameter, it defines an
-- overload, and an overload reachable by the same argument names is the
-- ambiguity PostgREST resolves badly.
--
-- Neither function computes the discount. The negative line arrives already
-- priced in `p_lines`, because resolveDiscount() in lib/domain is the only
-- place the arithmetic is allowed to happen — architecture.md §2 makes the
-- pricing engine one of the two modules where tests are mandatory, and a
-- second copy of the rule in plpgsql is exactly what would drift. What these
-- store is the instruction that produced it.
-- ═══════════════════════════════════════════════════════════════════════════

drop function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text[], boolean,
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
  -- The instruction, not its effect. Null together when nothing was discounted.
  p_discount_kind text default null,
  p_discount_value integer default null,
  p_discount_reason text default null,
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
  v_discount_reason text := nullif(btrim(coalesce(p_discount_reason, '')), '');
begin
  -- prd.md §13 [C]: a vehicle registration is required for records and
  -- security. Raised rather than returned as a refusal, unlike the two below:
  -- those are races a staff member can lose through no fault of their own, and
  -- this is a caller that skipped its own validation.
  if cardinality(v_vehicles) = 0 and not p_no_vehicle then
    raise exception 'a booking needs at least one vehicle registration, or the no-vehicle exception';
  end if;

  -- Same class of refusal, and the same reason for raising rather than
  -- returning. The table constraint would catch it too; this names the caller.
  if p_discount_kind is not null and (p_discount_value is null or v_discount_reason is null) then
    raise exception 'a discount needs a value and a reason';
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
    total_cents, security_deposit_cents,
    discount_kind, discount_value, discount_reason, created_by
  )
  values (
    p_property_id, v_reference, 'short_stay', p_status, v_guest_id,
    p_chargeable_guests, p_exempt_guests, p_no_vehicle,
    p_total_cents, p_security_deposit_cents,
    p_discount_kind, p_discount_value, v_discount_reason, p_actor_id
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
  --
  -- A discounted booking pays the discounted total, which is what
  -- p_total_cents already is: the discount is a line, and the total is the sum
  -- of the lines. Nothing here subtracts anything.
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
      'vehicles', to_jsonb(v_vehicles),
      'no_vehicle', p_no_vehicle
    )
  );

  -- A second verb for the discount, alongside the creation event rather than a
  -- field inside it — the same shape verify_payment() uses for an amount
  -- override, and for the same reason: "show me every discount given this
  -- month" is then a lookup on `action` over audit_event_entity_idx instead of
  -- a scan through jsonb.
  if p_discount_kind is not null then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'booking.discounted', 'booking', v_booking_id,
      null,
      jsonb_build_object(
        'reference', v_reference,
        'kind', p_discount_kind,
        'value', p_discount_value,
        'total_cents', p_total_cents,
        'reason', v_discount_reason
      )
    );
  end if;

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
  integer, integer, integer, integer, jsonb, text, text, integer, text, uuid
) from public, anon, authenticated;

grant execute on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, text, integer, text, uuid
) to service_role;

-- ── amend_booking() ────────────────────────────────────────────────────────
--
-- An amendment reprices through the same engine as creation, so it must carry
-- the discount instruction through with it. Without this a booking given ten
-- percent off, then extended by a night, would quietly come back at full
-- price — the lines are replaced wholesale, and a discount line nobody
-- resubmitted simply would not be among them.
--
-- The instruction is replaced wholesale too, and null clears it: removing a
-- discount is a thing a manager does, and it is recorded like giving one.

drop function amend_booking(
  uuid, uuid, timestamptz, uuid, date, date, text, text, text[], boolean,
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
  p_discount_kind text default null,
  p_discount_value integer default null,
  p_discount_reason text default null,
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
  v_discount_reason text := nullif(btrim(coalesce(p_discount_reason, '')), '');
  v_discount_changed boolean;
begin
  if cardinality(v_vehicles) = 0 and not p_no_vehicle then
    raise exception 'a booking needs at least one vehicle registration, or the no-vehicle exception';
  end if;

  if p_discount_kind is not null and (p_discount_value is null or v_discount_reason is null) then
    raise exception 'a discount needs a value and a reason';
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

  v_discount_changed :=
    v_booking.discount_kind is distinct from p_discount_kind
    or v_booking.discount_value is distinct from p_discount_value
    or v_booking.discount_reason is distinct from v_discount_reason;

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
    'security_deposit_cents', v_booking.security_deposit_cents,
    'discount_kind', v_booking.discount_kind,
    'discount_value', v_booking.discount_value,
    'discount_reason', v_booking.discount_reason
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
      security_deposit_cents = p_security_deposit_cents,
      discount_kind = p_discount_kind,
      discount_value = p_discount_value,
      discount_reason = v_discount_reason
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
  -- reprice is the new set, not the old set patched. The discount line is
  -- among them, already priced against the new subtotal by the engine.
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
    'security_deposit_cents', p_security_deposit_cents,
    'discount_kind', p_discount_kind,
    'discount_value', p_discount_value,
    'discount_reason', v_discount_reason
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

  -- Its own verb when the discount moved, so the amendment trail and the
  -- "every discount given" lookup stay separate questions with separate
  -- answers. Fires on removal too: taking a discount away is as discretionary
  -- as giving one.
  if v_discount_changed then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'booking.discounted', 'booking', p_booking_id,
      jsonb_build_object(
        'kind', v_booking.discount_kind,
        'value', v_booking.discount_value,
        'reason', v_booking.discount_reason,
        'total_cents', v_booking.total_cents
      ),
      jsonb_build_object(
        'kind', p_discount_kind,
        'value', p_discount_value,
        'reason', v_discount_reason,
        'total_cents', p_total_cents
      )
    );
  end if;

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
  integer, integer, integer, integer, jsonb, text, integer, text, text, uuid
) from public, anon, authenticated;

grant execute on function amend_booking(
  uuid, uuid, timestamptz, uuid, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, integer, text, text, uuid
) to service_role;
