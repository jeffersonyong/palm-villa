-- Applying a booking state transition, in one transaction.
--
-- architecture.md §5.3: "Transitions are implemented as a single function in
-- lib/domain that validates legality; no code path sets status directly. Every
-- transition writes an audit event."
--
-- Legality is decided in TypeScript by `transition()`, which is the only place
-- the state machine exists. This function is the persistence half: it is told
-- the status the booking is moving FROM and the status it is moving TO, and its
-- job is to make that move and its audit event atomic.
--
-- The `where status = p_from_status` is not decoration. Two staff members
-- acting on the same booking at the same moment is the ordinary case this
-- system has to survive — one checking a guest in while the other cancels — and
-- without it the second write would silently overwrite the first. Zero rows
-- updated means the booking moved underneath the caller, which comes back as a
-- message rather than a lost transition.
--
-- The trigger on `booking.status` carries the new status through to the
-- occupancy row, so a cancellation releases the unit inside this transaction
-- too.

create function transition_booking(
  p_property_id uuid,
  p_booking_id uuid,
  p_from_status text,
  p_to_status text,
  p_event text,
  p_actor_id uuid default null
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
    jsonb_build_object('status', p_to_status)
  );

  return jsonb_build_object('ok', true, 'status', p_to_status);
end;
$function$;

revoke execute on function transition_booking(uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated;
