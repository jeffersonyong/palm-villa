-- Walk-in booking creation, in one transaction.
--
-- prd.md §9.4 [C]: the guest is present and pays immediately, so the booking is
-- created and paid in a single action and never passes through `held`. No unit
-- is ever held against an unpaid promise.
--
-- Why this is a database function rather than a sequence of calls from
-- TypeScript: a booking is a guest, a booking row, an occupancy row, its
-- priced lines and an audit event, and a booking that exists without its
-- occupancy row is a unit that has been sold and is still showing as free.
-- PostgREST has no multi-statement transaction, so the transaction boundary has
-- to live here. That boundary is also what makes the G1 constraint meaningful:
-- the occupancy insert either wins the race or takes everything else back with
-- it.
--
-- What this function deliberately does NOT do is decide the status. It is
-- passed the status that `transition()` in lib/domain/booking-state.ts already
-- derived, because architecture.md §5.3 puts the state machine in exactly one
-- place and a second copy in plpgsql would be a second place to get it wrong.

create function create_walk_in_booking(
  p_property_id uuid,
  p_unit_id uuid,
  -- Derived by transition('draft', 'pay_in_full') in lib/domain. Never chosen
  -- here; the check constraint on `booking.status` is the only opinion this
  -- schema holds about it.
  p_status text,
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
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_guest_id uuid;
  v_booking_id uuid;
  v_reference text;
begin
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
    chargeable_guests, exempt_guests, vehicle_registration,
    total_cents, security_deposit_cents, created_by
  )
  values (
    p_property_id, v_reference, 'short_stay', p_status, v_guest_id,
    p_chargeable_guests, p_exempt_guests, p_vehicle_registration,
    p_total_cents, p_security_deposit_cents, p_actor_id
  )
  returning id into v_booking_id;

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
      'security_deposit_cents', p_security_deposit_cents
    )
  );

  return jsonb_build_object('ok', true, 'booking_id', v_booking_id, 'reference', v_reference);

exception
  -- The G1 constraint refusing a second booking over the same unit and dates.
  -- Everything above is rolled back with it, so a losing race leaves no guest,
  -- no booking and no orphaned lines behind. The reference number it consumed
  -- is not returned to the sequence; see 20260829000500 for why that is fine.
  --
  -- Returned as a value rather than raised, because this is not an error in the
  -- system: it is two people wanting the same unit, and the caller turns it
  -- into a sentence on screen.
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_unavailable');
  -- A unit id that does not exist, or belongs to another property — the
  -- composite foreign key on occupancy catches both.
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_not_found');
end;
$function$;

revoke execute on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text, integer, integer, integer, integer, jsonb, uuid
) from public, anon, authenticated;

grant execute on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text, integer, integer, integer, integer, jsonb, uuid
) to service_role;
