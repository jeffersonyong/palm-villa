-- Amending and cancelling a booking (capability B3).
--
-- scope-of-capabilities.md B3: "Amend and cancel bookings, with every change
-- recorded (who, what, when)." Cancellation already worked — transition_booking()
-- has carried the `cancel` event since 20260829000900 — so what this migration
-- adds is the *why* on a cancellation, and the amendment path, which did not
-- exist in any form.
--
-- Four changes, in dependency order.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. available_units() learns to ignore one booking's own occupancy.
--
-- An amend form asks "which units are free for these dates". Without this, the
-- answer excludes the unit the guest is already in — its own occupancy row
-- overlaps the range it is being asked about — so the form would offer every
-- unit except the one the booking is actually using, and re-saving without
-- moving the guest would be impossible.
--
-- Dropped and recreated rather than replaced: `create or replace function`
-- cannot add a parameter (it defines an overload instead), and an overload
-- reachable by the same argument names is exactly the ambiguity PostgREST
-- resolves badly. count_available_units_by_type() calls it, so that goes first
-- and comes back after.
-- ═══════════════════════════════════════════════════════════════════════════

drop function count_available_units_by_type(uuid, date, date);
drop function available_units(uuid, date, date, text);

create function available_units(
  p_property_id uuid,
  p_start date,
  p_end date,
  p_unit_type_slug text default null,
  -- The booking being amended. Its own occupancy does not count against it.
  p_exclude_booking_id uuid default null
)
returns table (
  id uuid,
  ref text,
  unit_type_slug text,
  unit_type_name text
)
language sql
stable
as $function$
  select u.id, u.ref, ut.slug, ut.name
  from unit u
  join unit_type ut on ut.id = u.unit_type_id
  where u.property_id = p_property_id
    and (p_unit_type_slug is null or ut.slug = p_unit_type_slug)
    and not exists (
      select 1
      from occupancy o
      where o.unit_id = u.id
        and o.status not in ('expired', 'cancelled')
        and o.booking_id is distinct from p_exclude_booking_id
        and daterange(o.start_date, o.end_date, '[)')
            && daterange(p_start, p_end, '[)')
    )
  order by u.ref;
$function$;

create function count_available_units_by_type(
  p_property_id uuid,
  p_start date,
  p_end date
)
returns table (
  unit_type_slug text,
  available bigint
)
language sql
stable
as $function$
  select ut.slug, count(a.id)
  from unit_type ut
  left join available_units(p_property_id, p_start, p_end) a
    on a.unit_type_slug = ut.slug
  where ut.property_id = p_property_id
  group by ut.slug;
$function$;

revoke execute on function available_units(uuid, date, date, text, uuid)
  from public, anon, authenticated;
revoke execute on function count_available_units_by_type(uuid, date, date)
  from public, anon, authenticated;

grant execute on function available_units(uuid, date, date, text, uuid) to service_role;
grant execute on function count_available_units_by_type(uuid, date, date) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. booking_summary carries updated_at.
--
-- The optimistic-concurrency token for an amendment. transition_booking() can
-- guard on `where status = <the status the caller read>` because a transition
-- is defined by its status; an amendment is not — a date change leaves the
-- status alone — so it needs something that moves on every write. The
-- booking_touch_updated_at trigger already maintains exactly that.
--
-- Appended last, which is the only column position `create or replace view`
-- accepts.
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
  b.vehicle_registration,
  b.chargeable_guests,
  b.exempt_guests,
  b.total_cents,
  b.security_deposit_cents,
  b.hold_expires_at,
  b.created_at,
  o.unit_id,
  u.ref as unit_ref,
  ut.slug as unit_type_slug,
  o.start_date as check_in,
  o.end_date as check_out,
  coalesce(l.lines, '[]'::jsonb) as lines,
  b.updated_at
from booking b
join guest g on g.id = b.guest_id
join occupancy o on o.booking_id = b.id
join unit u on u.id = o.unit_id
join unit_type ut on ut.id = u.unit_type_id
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
) l on true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. transition_booking() records why.
--
-- "Every change recorded (who, what, when)" is B3's promise, and who/what/when
-- were already there. A cancellation is the one transition where the missing
-- *why* is load-bearing: prd.md §9.5 forfeits a payment on cancellation, and
-- the first question in any dispute about that is what the booking was
-- cancelled for.
--
-- It goes in the audit event's `after` jsonb rather than a new column. That is
-- what 20260829000300 says the jsonb is for — "the audit trail must survive
-- schema change without rewriting history" — and a reason is a fact about this
-- event, not a field of the booking.
--
-- Dropped and recreated for the same overload reason as available_units above.
-- ═══════════════════════════════════════════════════════════════════════════

drop function transition_booking(uuid, uuid, text, text, text, uuid);

create function transition_booking(
  p_property_id uuid,
  p_booking_id uuid,
  p_from_status text,
  p_to_status text,
  p_event text,
  p_actor_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_updated integer;
begin
  update booking
  set status = p_to_status
  where id = p_booking_id
    and property_id = p_property_id
    and status = p_from_status;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'status_changed');
  end if;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id,
    p_actor_id,
    'booking.' || p_event,
    'booking',
    p_booking_id,
    jsonb_build_object('status', p_from_status),
    -- The reason key is omitted rather than null when there is none, so a
    -- transition that never asked for one does not read as one left blank.
    case
      when p_reason is null then jsonb_build_object('status', p_to_status)
      else jsonb_build_object('status', p_to_status, 'reason', p_reason)
    end
  );

  return jsonb_build_object('ok', true, 'status', p_to_status);
end;
$function$;

revoke execute on function transition_booking(uuid, uuid, text, text, text, uuid, text)
  from public, anon, authenticated;

grant execute on function transition_booking(uuid, uuid, text, text, text, uuid, text)
  to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. amend_booking() — the amendment, in one transaction.
--
-- Amendment is deliberately NOT a state transition and gets no event in
-- lib/domain/booking-state.ts: a booking's status does not move when its dates
-- do. What it shares with create_walk_in_booking() is the reason that function
-- exists at all — a booking is a guest, a booking row, an occupancy row, its
-- priced lines and an audit event, PostgREST has no multi-statement
-- transaction, and a booking whose occupancy moved but whose lines did not is
-- a guest being charged for a stay they are not having.
--
-- The occupancy update is the line that either wins or loses the race against
-- the G1 exclusion constraint, exactly as the insert is in the walk-in path.
-- A row does not conflict with itself, so extending a stay in the same unit is
-- legal by construction; only a *neighbouring* booking can refuse it.
--
-- Status legality is not decided here. canAmend() in lib/domain/booking-state.ts
-- holds that opinion, for the same reason architecture.md §5.3 gives for
-- transitions: a second copy in plpgsql would be a second place to get it wrong.
-- ═══════════════════════════════════════════════════════════════════════════

create function amend_booking(
  p_property_id uuid,
  p_booking_id uuid,
  -- What the caller read before it opened the form. See the note on
  -- booking_summary.updated_at above.
  p_expected_updated_at timestamptz,
  p_unit_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest_name text,
  p_guest_phone text,
  p_vehicle_registration text,
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
begin
  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Two staff members with the same booking open is the ordinary case, not the
  -- exotic one. Without this the second save silently overwrites the first,
  -- and the audit trail records both as if each had seen the other's work.
  if v_booking.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'error', 'changed');
  end if;

  select * into v_occupancy
  from occupancy
  where booking_id = p_booking_id and property_id = p_property_id
  for update;

  -- Day passes occupy no unit (prd.md §6.1) and have no row here. They are
  -- joined out of booking_summary by construction, so this is unreachable from
  -- the portal today; it is guarded rather than assumed because the day-pass
  -- slice will make it reachable.
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_guest from guest where id = v_booking.guest_id for update;

  v_before := jsonb_build_object(
    'unit_id', v_occupancy.unit_id,
    'check_in', v_occupancy.start_date,
    'check_out', v_occupancy.end_date,
    'guest_name', v_guest.name,
    'guest_phone', v_guest.phone,
    'vehicle_registration', v_booking.vehicle_registration,
    'chargeable_guests', v_booking.chargeable_guests,
    'exempt_guests', v_booking.exempt_guests,
    'total_cents', v_booking.total_cents,
    'security_deposit_cents', v_booking.security_deposit_cents
  );

  -- Editing the guest row in place is correct ONLY while every booking owns a
  -- guest row of its own, which create_walk_in_booking() guarantees today: it
  -- inserts a fresh guest per booking and deliberately does not de-duplicate.
  -- When a guest slice consolidates them, correcting a name here would rewrite
  -- it across that person's whole history, and this has to become a
  -- booking-level override instead.
  update guest
  set name = p_guest_name, phone = p_guest_phone
  where id = v_booking.guest_id and property_id = p_property_id;

  update booking
  set chargeable_guests = p_chargeable_guests,
      exempt_guests = p_exempt_guests,
      vehicle_registration = p_vehicle_registration,
      total_cents = p_total_cents,
      security_deposit_cents = p_security_deposit_cents
  where id = p_booking_id and property_id = p_property_id;

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
    'vehicle_registration', p_vehicle_registration,
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
  -- A neighbouring booking already holds the unit for those dates. Returned as
  -- a value, not raised: this is not a fault in the system, it is two stays
  -- wanting the same nights, and the caller turns it into a sentence.
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_unavailable');
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_not_found');
end;
$function$;

revoke execute on function amend_booking(
  uuid, uuid, timestamptz, uuid, date, date, text, text, text,
  integer, integer, integer, integer, jsonb, text, uuid
) from public, anon, authenticated;

grant execute on function amend_booking(
  uuid, uuid, timestamptz, uuid, date, date, text, text, text,
  integer, integer, integer, integer, jsonb, text, uuid
) to service_role;
