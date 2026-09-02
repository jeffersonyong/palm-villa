-- A long lease need not have an end date.
--
-- prd.md §6.4 recorded **[A]** "a lease records a name and two dates". The
-- second date turns out to be a fact the building often does not have: a
-- month-to-month tenancy has no agreed last day, and the form asking for one
-- was making staff invent a date so the software would accept the truth. Jeff
-- settled it on 3 September 2026 (open-questions.md N19) — the end date is
-- optional, and a lease with none runs until somebody ends it.
--
-- ── Why this is four lines of schema and not a new concept ────────────────
--
-- Because prd.md §6.1 modelled occupancy as a range rather than a pair of
-- dates, and Postgres already has the vocabulary for "from here, indefinitely":
-- `daterange(start, null, '[)')` is `[start,)`, unbounded above. So the
-- exclusion constraint that gives capability G1 its guarantee needs **no
-- change at all** — an open-ended lease overlaps every future range by
-- construction, and no booking can be made over it. Neither does
-- available_units(), whose overlap test is the same `&&`.
--
-- What does need changing is every place that compared `end_date` to a day
-- with a plain `>`, because `null > date` is null, not true — the unit would
-- read as empty while the tenant was living in it. There are exactly two, and
-- both are below.
--
-- ── What stays required ───────────────────────────────────────────────────
--
-- A booking's end date. A stay is sold for nights and priced by them; a stay
-- with no checkout is not a thing the product can express, and nothing in the
-- booking flow can produce one. The new check makes that structural rather
-- than incidental.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The column, and what still has to be true of it.
-- ═══════════════════════════════════════════════════════════════════════════

alter table occupancy alter column end_date drop not null;

-- "At least one night" still holds for every occupancy that has an end. An
-- open-ended one covers every night from its start, which is more than one.
alter table occupancy drop constraint occupancy_covers_at_least_one_night;

alter table occupancy add constraint occupancy_covers_at_least_one_night check (
  end_date is null or end_date > start_date
);

-- Only a lease may be open-ended. A booking without a checkout has no price
-- and no unit to hand back, and the booking flow cannot produce one — this
-- makes that a rule rather than a coincidence.
alter table occupancy add constraint occupancy_only_a_lease_is_open_ended check (
  end_date is not null or booking_id is null
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. unit_state() — the board and the unit screen.
--
-- `o.end_date > as_of.day` was the whole bug in miniature: for an open-ended
-- lease it evaluates to null, the lateral finds nothing, and the board says
-- the unit is available while somebody is living in it. Availability itself
-- would still have refused the booking — the exclusion constraint does not
-- care what the board thinks — so the failure mode is a screen that lies and
-- a clerk who cannot understand why the save is being refused.
--
-- `create or replace`, signature unchanged, so the grants survive.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function unit_state(
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
      -- Null means "no last day yet", which covers today and every day after.
      and (o.end_date is null or o.end_date > as_of.day)
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. set_unit_out_of_service() — the same comparison, and the same danger.
--
-- The blocking count asks "is anything still to come in this unit". An
-- open-ended lease is the strongest possible yes, and under the old `>` it
-- counted as a no — so a tenanted unit could have been taken out of service
-- underneath its tenant, which is precisely the "sold and unusable" state
-- part 6 of 20260904000100 exists to refuse.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function set_unit_out_of_service(
  p_property_id uuid,
  p_unit_id uuid,
  p_reason text,
  p_as_of date default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_unit unit%rowtype;
  v_day date;
  v_blocking integer;
  v_reference text;
begin
  select * into v_unit
  from unit
  where id = p_unit_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_unit.out_of_service_since is not null then
    return jsonb_build_object('ok', false, 'error', 'already_out_of_service');
  end if;

  select coalesce(p_as_of, (now() at time zone p.time_zone)::date)
  into v_day
  from property p
  where p.id = p_property_id;

  select count(*), min(coalesce(b.reference, o.occupant_name))
  into v_blocking, v_reference
  from occupancy o
  left join booking b on b.id = o.booking_id
  where o.unit_id = p_unit_id
    and o.status not in ('expired', 'cancelled')
    and (o.end_date is null or o.end_date > v_day);

  if v_blocking > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'unit_has_bookings',
      'bookings', v_blocking,
      'reference', v_reference
    );
  end if;

  update unit
  set out_of_service_since = v_day,
      out_of_service_reason = p_reason
  where id = p_unit_id and property_id = p_property_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'unit.marked_out_of_service', 'unit', p_unit_id,
    null,
    jsonb_build_object('ref', v_unit.ref, 'since', v_day, 'reason', p_reason)
  );

  return jsonb_build_object('ok', true, 'since', v_day);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. mark_unit_leased() accepts no end date.
--
-- `p_end` keeps its position and its type, so the signature — and therefore
-- every grant — is untouched; null is now a legal value for it rather than a
-- constraint violation. The "must end after it starts" refusal survives for
-- the leases that do have an end.
--
-- The audit event records `end: null`, deliberately, rather than omitting the
-- key: "let indefinitely" is a different fact from "we did not write the end
-- down", and the trail should be able to tell them apart.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function mark_unit_leased(
  p_property_id uuid,
  p_unit_id uuid,
  p_occupant_name text,
  p_start date,
  p_end date,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_ref text;
  v_occupancy_id uuid;
begin
  select ref into v_ref
  from unit
  where id = p_unit_id and property_id = p_property_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_end is not null and p_end <= p_start then
    return jsonb_build_object('ok', false, 'error', 'invalid_dates');
  end if;

  insert into occupancy (
    property_id, unit_id, booking_id, occupancy_type, status,
    start_date, end_date, occupant_name
  )
  values (
    p_property_id, p_unit_id, null, 'tenancy', 'leased',
    p_start, p_end, p_occupant_name
  )
  returning id into v_occupancy_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'unit.leased', 'unit', p_unit_id,
    null,
    jsonb_build_object(
      'ref', v_ref, 'occupant', p_occupant_name,
      'start', p_start, 'end', p_end
    )
  );

  return jsonb_build_object('ok', true, 'occupancyId', v_occupancy_id);

exception
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_unavailable');
  when sqlstate 'PV002' then
    return jsonb_build_object('ok', false, 'error', 'unit_out_of_service');
end;
$function$;

-- end_unit_lease() needs no change and gains a second job. It already writes
-- an end date onto a lease that has one; giving a last day to a lease that
-- never had one is the same statement. Its unwind branch — an end on or before
-- the start means the lease was recorded in error — is unaffected, because a
-- null end date was never on either side of that comparison.
