-- The state of the building (capabilities B8, B9 and the new F6).
--
-- scope-of-capabilities.md B8: "See each unit's live status through its full
-- lifecycle." B9: "Mark units out of service, or as leased long-term, so
-- availability always reflects reality." F6: name the units as they are
-- labelled on the doors, and set how many of each type there are.
--
-- ── Cashing in the promise architecture.md §5.1 made ───────────────────────
--
-- 20260829000100 left `unit.status` out on purpose: "an unread status column
-- that availability silently ignores is worse than none; it lands with the
-- housekeeping and inspection slice, which needs the one part that is not
-- derivable (out_of_service)." That paragraph set the price of admission, and
-- this migration pays it: every stored unit fact added here is read by
-- available_units(), or it is not added.
--
-- So the lifecycle is still not a column. Four of its states — available,
-- held, booked, occupied — are derived from the occupancy rows that already
-- exist, by deriveUnitStatus() in lib/domain/unit-status.ts, for the same
-- reason architecture.md §5.3 keeps the booking transition table out of
-- plpgsql: branching rules live in exactly one place, and a `case` here plus a
-- union in TypeScript would be two copies of it.
--
-- ── What this deliberately does NOT do ────────────────────────────────────
--
-- * No `awaiting_inspection` or `cleaning`. prd.md §6.4 names them; the
--   inspection flow that would write and clear them is capability C2–C3 and
--   does not exist. A state nothing can set or leave is a dead end on screen.
-- * No `tenancy` or `rent_period` table. prd.md §16 and scope X5 make full
--   tenancy management phase three. A lease here is an occupancy row and a
--   name, which is all B9 asks for.
-- * No `unit.updated_at`. The registry write guards each row on the ref the
--   editor was opened on instead; see part 8.
--
-- Nine parts, in dependency order.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A unit can be out of service.
--
-- Open-ended by nature — a broken air-conditioner has no return date — so this
-- is a column pair on the unit rather than an occupancy row, whose
-- occupancy_covers_at_least_one_night check demands an end.
--
-- No boolean beside it: `out_of_service_since is not null` IS the flag, and a
-- second column carrying the same fact is a second column to keep in step.
-- Both-or-neither, the same construction booking_discount_is_whole uses.
--
-- No actor column either. Who took the unit out of service and when they did
-- it are an audit event (architecture.md §4: sensitive actions are append-only
-- events, not status flags). `since` is on the row only because the board's
-- "out of service since 4 Sep" needs it without a second query.
-- ═══════════════════════════════════════════════════════════════════════════

alter table unit
  add column out_of_service_since date,
  add column out_of_service_reason text;

alter table unit add constraint unit_out_of_service_is_whole check (
  (out_of_service_since is null) = (out_of_service_reason is null)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. An occupancy can belong to a lease instead of a booking.
--
-- prd.md §6.1 is normative and this is where it pays: "A short stay and a long
-- tenancy are the same object: unit X is occupied from date A to date B ...
-- Modelling them as one Occupancy concept means one availability query."
--
-- Putting a lease here rather than in a table of its own means the exclusion
-- constraint, available_units(), the amend flow and the units board all become
-- lease-aware without a line of new logic. A separate lease table would need an
-- overlap constraint spanning two tables, which Postgres cannot express — and
-- the application-logic check that would stand in for it is exactly what G1
-- exists to refuse.
--
-- Three things make this cheap, all of them already true:
--
--   * The composite foreign key is MATCH SIMPLE (the default), so a row with a
--     null booking_id satisfies it without the FK being touched.
--   * sync_occupancy_status() updates `where booking_id = new.id`, and
--     `null = uuid` is null, so a lease row is never reached by the trigger
--     that mirrors booking statuses.
--   * booking_summary is driven `from booking b left join occupancy o`, so a
--     booking-less occupancy can never appear in it.
--
-- 20260829000200 anticipated the first of these in a comment: "the tenancy
-- slice widens this to one of booking_id or tenancy_id". This is the narrower
-- version of that widening — one of booking_id or a lease.
-- ═══════════════════════════════════════════════════════════════════════════

alter table occupancy alter column booking_id drop not null;

-- A booking takes its occupant's name from its guest row. A lease has no guest
-- until phase three's Tenancy record lands, and B9's whole point is that the
-- board can say who is in the unit.
alter table occupancy add column occupant_name text;

-- The status vocabulary gains one value. 20260829000200 chose a check
-- constraint over an enum precisely so that widening it is a one-line
-- migration; this is that line.
--
-- `leased` is deliberately not a booking status and is absent from
-- lib/domain/booking-state.ts. It is the status of an occupancy that has no
-- booking, and the trigger that mirrors booking statuses cannot produce it.
alter table occupancy drop constraint occupancy_status_check;

alter table occupancy add constraint occupancy_status_check check (
  status in (
    'draft', 'held', 'awaiting_payment_verification', 'confirmed',
    'checked_in', 'completed', 'expired', 'cancelled', 'no_show',
    'leased'
  )
);

-- Every row is one shape or the other, and neither can wear the other's
-- fields. `cancelled` is legal for a lease because it is already the release
-- value in the exclusion constraint below and already means "this occupancy
-- never happened" — which is what unwinding a lease recorded in error is.
alter table occupancy add constraint occupancy_is_a_booking_or_a_lease check (
  (
    booking_id is not null
    and status <> 'leased'
    and occupant_name is null
  )
  or
  (
    booking_id is null
    and occupancy_type = 'tenancy'
    and status in ('leased', 'cancelled')
    and occupant_name is not null
  )
);

-- The exclusion constraint needs no change, and that is the point of modelling
-- a lease here: `leased` is not in ('expired', 'cancelled'), so a lease
-- participates and blocks bookings by construction.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. available_units() learns about both new facts — and loses a bug.
--
-- Two changes, and the second is not cosmetic.
--
-- (a) An out-of-service unit is not available. This single line is the whole
--     condition architecture.md §5.1 set for a stored unit fact existing at
--     all, and without it part 1 would be the unread column that section
--     refuses.
--
-- (b) The exclusion predicate was `o.booking_id is distinct from
--     p_exclude_booking_id`. That was correct while every occupancy had a
--     booking. It stops being correct the moment part 2 lands: on an ordinary
--     call p_exclude_booking_id is null, a lease's booking_id is null, and
--     `null is distinct from null` is FALSE — so the lease row would be
--     skipped by the `not exists` and the unit reported free. Every lease
--     would be invisible to availability, and G1 would be defeated by a null
--     comparison rather than by a race.
--
--     The exclusion only ever meant "skip this ONE booking's own row", so it
--     is now guarded on there being a booking to exclude. The amend path is
--     unchanged: p_exclude_booking_id is a real uuid there, the predicate
--     reduces to the old one for booking rows, and a lease row is still
--     `distinct from` that uuid — so a guest can never be amended into a
--     leased unit.
--
-- `create or replace` rather than drop-and-recreate: the signature is
-- unchanged, so count_available_units_by_type() keeps working and the grants
-- survive. It inherits both changes untouched.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function available_units(
  p_property_id uuid,
  p_start date,
  p_end date,
  p_unit_type_slug text default null,
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
    and u.out_of_service_since is null
    and (p_unit_type_slug is null or ut.slug = p_unit_type_slug)
    and not exists (
      select 1
      from occupancy o
      where o.unit_id = u.id
        and o.status not in ('expired', 'cancelled')
        and (
          p_exclude_booking_id is null
          or o.booking_id is distinct from p_exclude_booking_id
        )
        and daterange(o.start_date, o.end_date, '[)')
            && daterange(p_start, p_end, '[)')
    )
  order by u.ref;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Nothing may be placed in a unit that is out of service.
--
-- available_units() feeds every unit picker in the product, so no screen can
-- offer one. This is the backstop for everything else — the same posture as
-- the exclusion constraint: the rule lives where it cannot be gone around.
--
-- Scoped to rows that are arriving at a unit or changing the days they cover.
-- A status mirrored down from a booking is deliberately not re-checked: the
-- unit's serviceability was settled when the row was written, and checking
-- again here would refuse the ordinary act of completing a stay that had
-- already finished when the unit went out of service.
--
-- Known rough edge, stated rather than papered over: create_walk_in_booking()
-- and amend_booking() catch exclusion_violation and foreign_key_violation
-- only, so PV002 propagates as an error rather than an {ok:false} refusal.
-- That is acceptable because no screen can reach it — set_unit_out_of_service()
-- in part 6 refuses to create the situation in the first place — and mapping
-- it is a two-line addition the next time either of those large functions is
-- recreated. Recreating them for this alone would be a worse trade.
-- ═══════════════════════════════════════════════════════════════════════════

create function occupancy_refuses_out_of_service_units() returns trigger
language plpgsql
as $function$
begin
  -- A released occupancy occupies nothing.
  if new.status in ('expired', 'cancelled') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.unit_id is not distinct from old.unit_id
     and new.start_date is not distinct from old.start_date
     and new.end_date is not distinct from old.end_date then
    return new;
  end if;

  if exists (
    select 1
    from unit u
    where u.id = new.unit_id
      and u.out_of_service_since is not null
  ) then
    raise exception 'unit_out_of_service' using errcode = 'PV002';
  end if;

  return new;
end;
$function$;

create trigger occupancy_respects_out_of_service
  before insert or update on occupancy
  for each row
  execute function occupancy_refuses_out_of_service_units();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. The reads the units board sits on.
--
-- unit_state() returns FACTS, not a label: the stored flags, and whichever
-- occupancy covers the day being asked about. Turning those into one of the
-- six statuses is deriveUnitStatus() in lib/domain/unit-status.ts, tested, in
-- one copy — see the header note.
--
-- A function rather than a view because the board asks about today but the
-- calendar slice will ask about a date, and a view that hardcodes now() cannot
-- answer the second question without a second object. available_units(p_start,
-- p_end, ...) is the precedent: inventory, as of a date, is a function here.
--
-- `covering` is at most one row BY CONSTRUCTION — no_overlapping_occupancy
-- forbids two unreleased occupancies over the same unit and day — so the
-- lateral needs no tie-break and the `limit 1` is defensive only.
--
-- p_as_of defaults to today in the property's own zone, read from the property
-- row. architecture.md §5.1: the zone is configuration, never a constant.
-- ═══════════════════════════════════════════════════════════════════════════

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
      -- A booking's occupant is its guest; a lease carries its own name.
      coalesce(g.name, o.occupant_name) as occupant_name
    from occupancy o
    left join booking b on b.id = o.booking_id
    left join guest g on g.id = b.guest_id
    where o.unit_id = u.id
      -- The same release set the exclusion constraint uses, so the board and
      -- availability cannot disagree about whether a unit is spoken for.
      and o.status not in ('expired', 'cancelled')
      and o.start_date <= as_of.day
      and o.end_date > as_of.day
    limit 1
  ) live on true
  -- What is coming, so a free unit can say "next stay 14 Sep" without that
  -- stay being mistaken for its current state.
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

-- The registry editor's read. `has_history` is the whole question it needs
-- answered: a unit that has hosted a stay cannot be deleted (the occupancy
-- foreign key is NO ACTION) and should not be — those stays are in
-- booking_summary and in the audit trail, and un-inventing the unit would
-- orphan them. It is taken out of service instead.
create function unit_registry(p_property_id uuid)
returns table (
  unit_id uuid,
  ref text,
  unit_type_slug text,
  out_of_service_since date,
  has_history boolean
)
language sql
stable
as $function$
  select
    u.id,
    u.ref,
    ut.slug,
    u.out_of_service_since,
    exists (select 1 from occupancy o where o.unit_id = u.id)
  from unit u
  join unit_type ut on ut.id = u.unit_type_id
  where u.property_id = p_property_id
  order by ut.slug, u.ref;
$function$;

revoke execute on function unit_state(uuid, date) from public, anon, authenticated;
revoke execute on function unit_registry(uuid) from public, anon, authenticated;

grant execute on function unit_state(uuid, date) to service_role;
grant execute on function unit_registry(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. The four status writes (capability B9).
--
-- Each is one RPC rather than a table write followed by an insert, for the
-- reason lib/db/notes.ts states: a change and the audit event that explains it
-- belong in one transaction, and only a function gives that here.
--
-- All four return the {ok:...} jsonb shape the query layer already speaks, so
-- a refusal arrives at the screen as a sentence rather than a stack trace.
-- ═══════════════════════════════════════════════════════════════════════════

-- Refusing to take a sold unit out of service is the load-bearing rule here,
-- and it is a refusal rather than a warning on purpose. Out of service means
-- the unit cannot host anyone; marking it so while a confirmed booking sits in
-- it produces a unit that is simultaneously sold and unusable, and the guest
-- finds out at the door. Warn-and-allow puts that decision in a toast nobody
-- reads. The refusal names the count and the first booking instead, and the
-- clerk moves or cancels those bookings on a screen they already have.
--
-- Checked inside the transaction after `for update` on the unit, because a
-- check in the server action races the booking being created.
create function set_unit_out_of_service(
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
    and o.end_date > v_day;

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

-- No dialog on the screen for this one, and so no reason collected: returning
-- a unit to service states nothing surprising and affects no booking.
create function return_unit_to_service(
  p_property_id uuid,
  p_unit_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_unit unit%rowtype;
begin
  select * into v_unit
  from unit
  where id = p_unit_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_unit.out_of_service_since is null then
    return jsonb_build_object('ok', false, 'error', 'not_out_of_service');
  end if;

  update unit
  set out_of_service_since = null,
      out_of_service_reason = null
  where id = p_unit_id and property_id = p_property_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'unit.returned_to_service', 'unit', p_unit_id,
    jsonb_build_object(
      'since', v_unit.out_of_service_since,
      'reason', v_unit.out_of_service_reason
    ),
    jsonb_build_object('ref', v_unit.ref)
  );

  return jsonb_build_object('ok', true);
end;
$function$;

-- A lease is an occupancy row (part 2). The exclusion constraint decides
-- whether it may exist, exactly as it decides a booking's — so the refusal
-- here is a caught exclusion_violation, the same value-not-fault handling
-- amend_booking() uses.
create function mark_unit_leased(
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

  if p_end <= p_start then
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

-- Two honest outcomes, and no dead end. occupancy_covers_at_least_one_night
-- means a lease that started today cannot be given an end date of today — so
-- an end on or before the start is not an end at all, it is the lease being
-- unwound, and `cancelled` is already the value that means "this occupancy
-- never happened". The dialog says which will happen before the click.
create function end_unit_lease(
  p_property_id uuid,
  p_occupancy_id uuid,
  p_end date,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_occupancy occupancy%rowtype;
  v_ref text;
  v_outcome text;
begin
  select * into v_occupancy
  from occupancy
  where id = p_occupancy_id
    and property_id = p_property_id
    and booking_id is null
    and status = 'leased'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select ref into v_ref from unit where id = v_occupancy.unit_id;

  if p_end > v_occupancy.start_date then
    update occupancy set end_date = p_end where id = p_occupancy_id;
    v_outcome := 'ended';
  else
    update occupancy set status = 'cancelled' where id = p_occupancy_id;
    v_outcome := 'cancelled';
  end if;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id,
    case when v_outcome = 'ended' then 'unit.lease_ended' else 'unit.lease_cancelled' end,
    'unit', v_occupancy.unit_id,
    jsonb_build_object(
      'ref', v_ref, 'occupant', v_occupancy.occupant_name,
      'start', v_occupancy.start_date, 'end', v_occupancy.end_date
    ),
    case
      when v_outcome = 'ended' then jsonb_build_object('end', p_end)
      else jsonb_build_object('status', 'cancelled')
    end
  );

  return jsonb_build_object('ok', true, 'outcome', v_outcome);

exception
  when sqlstate 'PV002' then
    return jsonb_build_object('ok', false, 'error', 'unit_out_of_service');
end;
$function$;

revoke execute on function set_unit_out_of_service(uuid, uuid, text, date, uuid)
  from public, anon, authenticated;
revoke execute on function return_unit_to_service(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function mark_unit_leased(uuid, uuid, text, date, date, uuid)
  from public, anon, authenticated;
revoke execute on function end_unit_lease(uuid, uuid, date, uuid)
  from public, anon, authenticated;

grant execute on function set_unit_out_of_service(uuid, uuid, text, date, uuid) to service_role;
grant execute on function return_unit_to_service(uuid, uuid, uuid) to service_role;
grant execute on function mark_unit_leased(uuid, uuid, text, date, date, uuid) to service_role;
grant execute on function end_unit_lease(uuid, uuid, date, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Unit references become uniquely-constrained-when-finished.
--
-- Renaming the building crosses its own uniqueness. Renumbering 3B-01..3B-36
-- to A-001..A-036 walks through refs the old scheme still holds, and swapping
-- two doors is the same problem in miniature.
--
-- A single `update ... from (values ...)` does not save it. Postgres checks a
-- non-deferrable unique index as each ROW's index tuple is inserted, not at
-- the end of the statement — which is why `update t set n = n + 1` raises
-- 23505 or succeeds depending purely on the order the rows happened to be
-- scanned in. A rename set is therefore correct or not by accident, and that
-- is not a thing to ship.
--
-- Deferring makes the constraint mean what it was always for: references are
-- unique when the work is finished. `initially immediate` leaves every
-- ordinary write behaving exactly as it does today; only apply_unit_registry()
-- defers, and only for the length of its own transaction.
--
-- Safe to swap out: this constraint is not a foreign key target — occupancy's
-- composite key points at unit_property_id_id_key — and is not an ON CONFLICT
-- arbiter anywhere. A deferrable unique constraint can be neither, so both
-- were checked before this line was written.
-- ═══════════════════════════════════════════════════════════════════════════

alter table unit drop constraint unit_property_id_ref_key;

alter table unit add constraint unit_ref_unique
  unique (property_id, ref) deferrable initially immediate;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. apply_unit_registry() — renaming and resizing the building (F6).
--
-- prd.md §7.1 records that the seeded references are provisional and that the
-- 2-bedroom count is unknown (open questions N10 and N1). This is what turns
-- both from a migration into a settings change: the client answers them by
-- typing, not by asking for a deployment.
--
-- The whole plan arrives as one call because it is one change: a scheme that
-- renames thirty-six units and adds four is not forty separate decisions, and
-- half of it applied is a building nobody can recognise. planRegistry() in
-- lib/domain/unit-ref.ts computes the plan and is where the rules are tested;
-- this function is the transaction it lands in.
--
-- Three things here are load-bearing and easy to get wrong:
--
--   * SET CONSTRAINTS is returned to immediate BEFORE the function ends. A
--     deferred violation otherwise raises at COMMIT — after this function has
--     returned — where the exception block below can never see it, and the
--     caller gets a 500 instead of a sentence.
--   * Every refusal inside the loops RAISES rather than returns. A `return`
--     after a write commits the writes already made; only an exception unwinds
--     the subtransaction the exception clause creates. That is the difference
--     between "the save was refused" and "half the building got renamed".
--   * Each rename is guarded on the reference the editor was opened on. `unit`
--     has no updated_at to use as an optimistic token, so the old ref is the
--     token — the same posture as amend_booking(), and it catches the second
--     administrator renumbering at the same time.
--
-- Order is removals, then renames, then additions: a reference going away is a
-- reference a rename may want.
-- ═══════════════════════════════════════════════════════════════════════════

create function apply_unit_registry(
  p_property_id uuid,
  p_renames jsonb default '[]'::jsonb,
  p_additions jsonb default '[]'::jsonb,
  p_removals jsonb default '[]'::jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  entry jsonb;
  v_unit_type_id uuid;
  v_new_id uuid;
  v_rows integer;
  v_renamed integer := 0;
  v_added integer := 0;
  v_removed integer := 0;
begin
  set constraints unit_ref_unique deferred;

  for entry in select * from jsonb_array_elements(p_removals) loop
    if exists (
      select 1 from occupancy o where o.unit_id = (entry ->> 'unitId')::uuid
    ) then
      raise exception 'unit_has_history:%', entry ->> 'ref' using errcode = 'PV001';
    end if;

    delete from unit
    where id = (entry ->> 'unitId')::uuid
      and property_id = p_property_id
      and ref = entry ->> 'ref';

    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      raise exception 'changed:%', entry ->> 'ref' using errcode = 'PV001';
    end if;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'unit.removed', 'unit', (entry ->> 'unitId')::uuid,
      jsonb_build_object('ref', entry ->> 'ref'), null
    );

    v_removed := v_removed + 1;
  end loop;

  for entry in select * from jsonb_array_elements(p_renames) loop
    update unit
    set ref = entry ->> 'toRef'
    where id = (entry ->> 'unitId')::uuid
      and property_id = p_property_id
      and ref = entry ->> 'fromRef';

    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      raise exception 'changed:%', entry ->> 'fromRef' using errcode = 'PV001';
    end if;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'unit.renamed', 'unit', (entry ->> 'unitId')::uuid,
      jsonb_build_object('ref', entry ->> 'fromRef'),
      jsonb_build_object('ref', entry ->> 'toRef')
    );

    v_renamed := v_renamed + 1;
  end loop;

  for entry in select * from jsonb_array_elements(p_additions) loop
    select ut.id into v_unit_type_id
    from unit_type ut
    where ut.property_id = p_property_id
      and ut.slug = entry ->> 'unitTypeId';

    if not found then
      raise exception 'unit_type_not_found:%', entry ->> 'unitTypeId'
        using errcode = 'PV001';
    end if;

    insert into unit (property_id, unit_type_id, ref)
    values (p_property_id, v_unit_type_id, entry ->> 'ref')
    returning id into v_new_id;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'unit.added', 'unit', v_new_id, null,
      jsonb_build_object('ref', entry ->> 'ref', 'unitType', entry ->> 'unitTypeId')
    );

    v_added := v_added + 1;
  end loop;

  set constraints unit_ref_unique immediate;

  -- The summary answers "who renumbered the building, and when". The per-unit
  -- events above answer "what was this door called before".
  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'unit_registry.updated', 'property', p_property_id,
    null,
    jsonb_build_object('renamed', v_renamed, 'added', v_added, 'removed', v_removed)
  );

  return jsonb_build_object(
    'ok', true, 'renamed', v_renamed, 'added', v_added, 'removed', v_removed
  );

exception
  when sqlstate 'PV001' then
    return jsonb_build_object(
      'ok', false,
      'error', split_part(sqlerrm, ':', 1),
      'ref', nullif(split_part(sqlerrm, ':', 2), '')
    );
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate_ref');
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_has_history');
end;
$function$;

revoke execute on function apply_unit_registry(uuid, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated;

grant execute on function apply_unit_registry(uuid, jsonb, jsonb, jsonb, uuid)
  to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Front Office may declare a unit leased.
--
-- `tenancy.manage` has existed in the permission vocabulary since
-- 20260829000400 and has never been held by anyone but Admin, because nothing
-- read it. Marking a unit leased long-term is the first thing that does.
--
-- It is deliberately not `unit.manage`. prd.md §4 gives Housekeeping
-- `unit.manage` "(status only)", and declaring a unit let to a tenant for six
-- months is a commercial statement, not an operational one — it should not sit
-- with the person who reports that the shower door sticks.
--
-- Granted here as well as in seed.sql for the reason 20260902000100 records: a
-- seed runs only on `db reset` of the local stack, production schema moves by
-- `db push`, and without this the permission would exist and nobody would hold
-- it.
-- ═══════════════════════════════════════════════════════════════════════════

insert into role_permission (property_id, role_id, permission)
select r.property_id, r.id, 'tenancy.manage'
from staff_role r
where r.slug in ('admin', 'front-office')
on conflict do nothing;
