-- ═══════════════════════════════════════════════════════════════════════════
-- The deposit, waived (capability B15; prd.md §11, §9.6).
--
-- A guest who extends by a night after checking in cannot have their booking
-- amended (prd.md §9.6 [O], N12), so the desk takes a second booking for the
-- extra night — and check_in_booking() would then take a second BND 100 off a
-- guest who already has one in the safe. This migration lets the desk say, at
-- creation, that no deposit is to be taken on a booking, and have that
-- written down.
--
-- It adds no state. A booking quoting no deposit already checks in without a
-- deposit row (check_in_booking(), 20260906000100), and every screen already
-- says so. What arrives here is the RECORD: a reason on the booking, a
-- permission for who may give one, and an audit event carrying what would
-- otherwise have been held — because the one-transaction check-in exists so
-- that "no deposit recorded" and "nobody wrote it down" never look the same,
-- and a waiver with no reason would put them back together.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. booking.deposit_waiver_reason — the waiver IS the reason.
--
-- One nullable text column rather than a boolean beside a reason: the pair
-- could disagree (waived with no reason, or a reason on a booking that was
-- not waived), and the `booking_discount_is_whole` construction already
-- established that a decision and its justification are one fact here.
--
-- A waived booking quotes nothing. Enforced rather than assumed, because
-- check_in_booking() reads `security_deposit_cents` alone to decide whether
-- to take money — a waived booking still quoting 100 would collect it and
-- make the waiver a lie.
-- ═══════════════════════════════════════════════════════════════════════════

alter table booking add column deposit_waiver_reason text;

alter table booking add constraint booking_deposit_waiver_quotes_nothing check (
  deposit_waiver_reason is null or security_deposit_cents = 0
);

alter table booking add constraint booking_deposit_waiver_reason_length check (
  deposit_waiver_reason is null or char_length(deposit_waiver_reason) between 1 and 280
);

comment on column booking.deposit_waiver_reason is
  'Why no security deposit is taken on this booking. Null means the deposit is quoted as normal. Non-null forces security_deposit_cents to 0 (booking_deposit_waiver_quotes_nothing), so check_in_booking() takes nothing. Written once, at creation, under deposit.waive.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. `deposit.waive` — who may decide that money is not taken.
--
-- Its own string, for the reason `booking.discount` is (20260902000100): every
-- other permission gates an operation, this one gates discretion, and a manager
-- should be able to withhold it from a role that otherwise takes bookings all
-- day. Seeded to Admin and Front Office — the desk is where the guest asking
-- to stay another night is standing — and granted here as well as in seed.sql
-- because production schema moves by `db push`, which runs no seed.
-- ═══════════════════════════════════════════════════════════════════════════

alter table role_permission drop constraint role_permission_permission_check;

alter table role_permission add constraint role_permission_permission_check check (
  permission in (
    'booking.view', 'booking.create', 'booking.amend', 'booking.cancel',
    'booking.override_hold', 'booking.discount', 'payment.verify',
    'payment.record_cash', 'inspection.record', 'charge.create', 'charge.waive',
    'deposit.approve_release', 'deposit.waive', 'unit.manage', 'tenancy.manage',
    'config.manage', 'report.view', 'document.view_identity'
  )
);

insert into role_permission (property_id, role_id, permission)
select r.property_id, r.id, 'deposit.waive'
from staff_role r
where r.slug in ('admin', 'front-office')
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. booking_summary carries the reason.
--
-- Appended, because `create or replace view` allows a new column only at the
-- end. Otherwise the view is the one 20260903000200 defined.
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
  b.discount_reason,
  coalesce(pay.paid_cents, 0)::integer as paid_cents,
  b.deposit_waiver_reason
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
) v on true
left join lateral (
  select sum(p.amount_cents) as paid_cents
  from payment p
  where p.booking_id = b.id and p.status = 'verified'
) pay on true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. create_walk_in_booking() learns the waiver.
--
-- Dropped and recreated rather than replaced, for the reason 20260830000100
-- set out: `create or replace function` cannot add a parameter, it defines an
-- overload, and an overload reachable by the same argument names is the
-- ambiguity PostgREST resolves badly.
--
-- The caller still passes the deposit the pricing engine QUOTED, and this
-- function zeroes it when a waiver is present. That ordering is deliberate:
-- the quoted figure is what the audit event records as waived — "BND 100 not
-- taken" is the sentence somebody asks about later — and a caller that had to
-- pass 0 would have thrown that figure away before it got here.
--
-- amend_booking() is NOT changed. An amendment carries the waiver through in
-- the server action (the same rule a discount follows), and the constraint in
-- §1 makes any caller that forgets fail loudly rather than quietly put a
-- deposit back on a booking that waived one.
-- ═══════════════════════════════════════════════════════════════════════════

drop function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, text, integer, text, uuid
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
  -- What the engine quoted. Zeroed below when the deposit is waived.
  p_security_deposit_cents integer,
  p_lines jsonb,
  p_payment_method text,
  -- The instruction, not its effect. Null together when nothing was discounted.
  p_discount_kind text default null,
  p_discount_value integer default null,
  p_discount_reason text default null,
  -- Non-null waives the deposit. Blank is read as no waiver, never as a
  -- waiver with nothing to say.
  p_deposit_waiver_reason text default null,
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
  v_waiver_reason text := nullif(btrim(coalesce(p_deposit_waiver_reason, '')), '');
  v_deposit_cents integer :=
    case when v_waiver_reason is null then p_security_deposit_cents else 0 end;
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
    total_cents, security_deposit_cents, deposit_waiver_reason,
    discount_kind, discount_value, discount_reason, created_by
  )
  values (
    p_property_id, v_reference, 'short_stay', p_status, v_guest_id,
    p_chargeable_guests, p_exempt_guests, p_no_vehicle,
    p_total_cents, v_deposit_cents, v_waiver_reason,
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
  -- transaction as the transition itself. The deposit recorded here is what
  -- the booking QUOTES — zero when waived; the waiver's own event below says
  -- what that zero stands in for.
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
      'security_deposit_cents', v_deposit_cents,
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

  -- And a verb for the waiver, on the same reasoning. Against the BOOKING, not
  -- a deposit: there is no deposit row, and the booking's trail is where a
  -- reader asks "why was nothing taken at check-in". `amount_cents` is what
  -- would have been held — the figure the question is actually about. The
  -- reason sits under `reason`, which is the key the history panel quotes.
  if v_waiver_reason is not null then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'deposit.waived', 'booking', v_booking_id,
      null,
      jsonb_build_object(
        'reference', v_reference,
        'amount_cents', p_security_deposit_cents,
        'reason', v_waiver_reason
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
  integer, integer, integer, integer, jsonb, text, text, integer, text, text, uuid
) from public, anon, authenticated;

grant execute on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, text, integer, text, text, uuid
) to service_role;
