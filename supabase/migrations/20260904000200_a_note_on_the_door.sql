-- A note that belongs to the unit, not to whoever is in it.
--
-- ── This answers an open question rather than assuming past it ────────────
--
-- open-questions.md N18 asked two things and this is the second: "where should
-- 'the shower door sticks' live, given it's true long after the guest has
-- gone?" The register's own note said a unit note was **deliberately not
-- built**, because it outlives every booking and hanging it off one would lose
-- it when the guest leaves — and parked it with the inspections slice.
--
-- The owner has now asked for it directly, so the question is answered rather
-- than deferred: the note hangs off the unit. That is the answer N18 was
-- reaching for; what it lacked was a screen to put it on, and the units board
-- is that screen.
--
-- ── One editable block, not an append-only thread ─────────────────────────
--
-- `booking_note` is a thread because a booking accumulates events — who rang,
-- what they asked for — and each one is true at the moment it was written. A
-- unit note is the opposite shape: "the shower door sticks" is a standing fact
-- about the door that stops being true when somebody fixes it, and a thread
-- would make the current state of a unit something a reader has to reconstruct
-- from the bottom of a list.
--
-- Nothing is lost by making it editable. Every edit writes an audit event
-- carrying the text before and after, so the trail on the unit's own screen is
-- the history the thread would have been — and unlike a thread, the card at the
-- top always says what is true now.
--
-- Two parts.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The column, and the write.
--
-- Blank is null, normalised in the function rather than left to callers: an
-- empty string and a null would render identically and compare differently,
-- and "the note was cleared" is a real edit worth recording as one.
-- ═══════════════════════════════════════════════════════════════════════════

alter table unit add column notes text;

comment on column unit.notes is
  'A standing fact about the unit itself (open-questions.md N18). Edited in place; every change is an audit event.';

create function set_unit_notes(
  p_property_id uuid,
  p_unit_id uuid,
  p_notes text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_unit unit%rowtype;
  v_next text;
begin
  select * into v_unit
  from unit
  where id = p_unit_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_next := nullif(btrim(coalesce(p_notes, '')), '');

  -- A save that changes nothing writes nothing. Otherwise opening the field and
  -- closing it again would leave an audit event saying something happened.
  if v_next is not distinct from v_unit.notes then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update unit set notes = v_next where id = p_unit_id and property_id = p_property_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id,
    case
      when v_next is null then 'unit.note_cleared'
      when v_unit.notes is null then 'unit.note_added'
      else 'unit.note_changed'
    end,
    'unit', p_unit_id,
    jsonb_build_object('ref', v_unit.ref, 'notes', v_unit.notes),
    jsonb_build_object('notes', v_next)
  );

  return jsonb_build_object('ok', true, 'changed', true);
end;
$function$;

revoke execute on function set_unit_notes(uuid, uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function set_unit_notes(uuid, uuid, text, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. unit_state() carries the note.
--
-- Dropped and recreated rather than replaced: `create or replace function`
-- cannot widen a `returns table`, which is the same constraint 20260830000100
-- hit when available_units() gained a parameter. Nothing depends on this
-- function but lib/db, so there is no view to rebuild after it.
-- ═══════════════════════════════════════════════════════════════════════════

drop function unit_state(uuid, date);

create function unit_state(
  p_property_id uuid,
  p_as_of date default null
)
returns table (
  unit_id uuid,
  ref text,
  unit_type_slug text,
  unit_type_name text,
  out_of_service_since date,
  out_of_service_reason text,
  notes text,
  occupancy_id uuid,
  occupancy_status text,
  occupancy_type text,
  start_date date,
  end_date date,
  occupant_name text,
  booking_id uuid,
  booking_reference text,
  next_start_date date
)
language sql
stable
as $function$
  with as_of as (
    select coalesce(p_as_of, (now() at time zone p.time_zone)::date) as day
    from property p
    where p.id = p_property_id
  )
  select
    u.id,
    u.ref,
    ut.slug,
    ut.name,
    u.out_of_service_since,
    u.out_of_service_reason,
    u.notes,
    live.id,
    live.status,
    live.occupancy_type,
    live.start_date,
    live.end_date,
    live.occupant_name,
    live.booking_id,
    live.reference,
    upcoming.start_date
  from unit u
  join unit_type ut on ut.id = u.unit_type_id
  cross join as_of
  left join lateral (
    select
      o.id,
      o.status,
      o.occupancy_type,
      o.start_date,
      o.end_date,
      o.booking_id,
      b.reference,
      coalesce(g.name, o.occupant_name) as occupant_name
    from occupancy o
    left join booking b on b.id = o.booking_id
    left join guest g on g.id = b.guest_id
    where o.unit_id = u.id
      and o.status not in ('expired', 'cancelled')
      and o.start_date <= as_of.day
      and o.end_date > as_of.day
    limit 1
  ) live on true
  left join lateral (
    select min(o.start_date) as start_date
    from occupancy o
    where o.unit_id = u.id
      and o.status not in ('expired', 'cancelled')
      and o.start_date > as_of.day
  ) upcoming on true
  where u.property_id = p_property_id
  order by u.ref;
$function$;

revoke execute on function unit_state(uuid, date) from public, anon, authenticated;
grant execute on function unit_state(uuid, date) to service_role;
