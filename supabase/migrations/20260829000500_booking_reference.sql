-- Booking reference allocation.
--
-- architecture.md §6.1: `PV-` + a 4-digit number, unique per property,
-- generated at booking creation. prd.md §10.2 calls this "the highest-leverage
-- detail in the payment design" — it turns verification from name-matching into
-- a direct lookup, and it is the prerequisite for automated statement matching
-- later (§10.6).
--
-- A sequence rather than `max(reference) + 1`, because the fixture's counter
-- lost the race the moment two staff members created a booking at the same
-- instant. nextval() is atomic and never returns the same value twice.
--
-- Two consequences worth knowing:
--   * Sequences are non-transactional, so a rolled-back booking — a losing
--     race against the G1 constraint — burns its number. References are
--     therefore not gapless. Uniqueness is the requirement; contiguity is not.
--   * Past 9999 the reference grows to five digits. At the observed booking
--     volume that is years away, and the alternative (wrapping, or reusing
--     freed numbers) would break the one property staff rely on: a reference
--     identifies exactly one booking, forever.

-- Starts where the fixture layer's references left off, so the demo numbering
-- staff have already seen in review continues rather than restarting.
create sequence booking_reference_seq as bigint start with 4821 minvalue 1;

create function next_booking_reference() returns text
language sql
volatile
as $function$
  select 'PV-' || lpad(nextval('booking_reference_seq')::text, 4, '0');
$function$;

revoke execute on function next_booking_reference() from public, anon, authenticated;

-- Granted explicitly rather than left to inherited defaults: the revoke above
-- drops the PUBLIC grant these functions would otherwise be reached through,
-- and a silently unexecutable function surfaces as a permissions error from a
-- screen rather than as a failed migration.
grant execute on function next_booking_reference() to service_role;
