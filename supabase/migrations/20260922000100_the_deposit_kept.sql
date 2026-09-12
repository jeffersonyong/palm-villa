-- The deposit kept (prd.md §9.5; capabilities B3 and B16), 22 September 2026.
--
-- ── What the client said, and what was not built ──────────────────────────
--
-- N5, answered 10 September 2026: "We keep the deposit, booking payment is
-- refunded if that is paid during booking." A guest who cancels or never
-- arrives forfeits the BND 100. Cancelling has moved no money since B3 was
-- built, and nothing could record a no-show at all, so every cancelled
-- booking with a deposit in the safe sat on the ledger as "held before
-- arrival" forever — a liability the property had already decided it did not
-- owe, and a release that could never be approved because nobody was ever
-- going to check out.
--
-- ── The decisions (Jeff, 22 September 2026) ───────────────────────────────
--
-- 1. **Cancelling asks.** Keep is the default, because it is the rule. Return
--    is offered for the cancellation the rule was never about — the booking
--    made in error, or cancelled by the property — and without it that
--    guest's BND 100 would become revenue with no way back. The clerk who may
--    cancel decides, with the reason they already have to give. [A]
-- 2. **A no-show always keeps it**, and releases the unit for the rest of the
--    booked nights, so tonight can be sold again. Not before the arrival day.
-- 3. **A kept deposit is revenue on the day it is kept**, in its booking's
--    stream — N32's standing assumption, built on and still open.
--
-- ── How ───────────────────────────────────────────────────────────────────
--
-- One function closes a booking without a stay and settles its deposit in the
-- same transaction: `close_booking()`. `transition_booking()` stops accepting
-- the two events, so there is no way to cancel around the deposit. A kept
-- deposit is three columns on the row — when, by whom, how much — because the
-- when is revenue's date and the who is the audit's answer; the stage stays
-- derived (prd.md §11). A deposit given back is an ordinary release, written
-- at the close with the release arithmetic the constraints already enforce.
--
-- A trigger then refuses money arriving on a closed booking, and any change to
-- what a kept deposit holds — its amount, its collection, a release, the
-- forfeiture itself — or to its charges. A transfer slip can still be attached
-- to one: that is the accounting record of money the business now keeps, and
-- freezing the evidence would help nobody. The four writers that could otherwise do it
-- are long functions, and teaching each a guard would mean re-creating all of
-- them; this is one rule in one place, raised as PV003 and turned into a
-- sentence by lib/db, which is the arrangement PV002 already has.
--
-- Lock order: booking, then deposit — the order the five writers named in
-- 20260921000100 all take. `approve_deposit_release()` and
-- `add_deposit_charge()` lock the deposit alone.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. What was kept, on the deposit.
-- ═══════════════════════════════════════════════════════════════════════════

alter table deposit
  add column forfeited_at timestamptz,
  add column forfeited_by uuid references auth.users (id),
  add column forfeited_amount_cents integer;

alter table deposit add constraint deposit_forfeiture_is_whole check (
  (forfeited_at is null) = (forfeited_amount_cents is null)
);

-- Nothing is kept that was never taken: a promise nobody verified lapses.
alter table deposit add constraint deposit_forfeiture_needs_collection check (
  forfeited_at is null or collected_at is not null
);

-- What was kept is what was held — all of it, which for a short deposit is
-- less than the quote. The trigger below stops the holding moving afterwards,
-- so this cannot be broken by a later top-up either.
alter table deposit add constraint deposit_forfeiture_is_what_was_held check (
  forfeited_at is null or forfeited_amount_cents = amount_cents
);

alter table deposit add constraint deposit_kept_or_returned check (
  forfeited_at is null or released_at is null
);

-- Revenue reads kept deposits by the day they were kept, over a window.
create index deposit_forfeited_idx on deposit (property_id, forfeited_at desc)
  where forfeited_at is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A closed booking takes no more money, and a kept deposit is final.
-- ═══════════════════════════════════════════════════════════════════════════

create function deposit_refuses_money_after_close() returns trigger
language plpgsql
as $function$
declare
  v_status text;
begin
  -- A kept deposit is the business's money, counted in revenue on the day it
  -- was kept. Topping it up, collecting it again, releasing it or un-keeping it
  -- would each change a figure somebody may already have reported.
  if tg_op = 'UPDATE'
     and old.forfeited_at is not null
     and (
       new.amount_cents is distinct from old.amount_cents
       or new.collected_at is distinct from old.collected_at
       or new.released_at is distinct from old.released_at
       or new.forfeited_at is distinct from old.forfeited_at
       or new.forfeited_amount_cents is distinct from old.forfeited_amount_cents
     ) then
    raise exception 'deposit_kept' using errcode = 'PV003';
  end if;

  -- Money arriving: a new row, a promise verified, cash counted against it, or
  -- a top-up. None of it belongs on a booking that closed without a stay —
  -- the close already settled what was held, and a promise that lapsed with it
  -- is not waited on by anybody. Settling what was held at the close changes
  -- neither column, so close_booking() passes.
  if tg_op = 'INSERT'
     or new.collected_at is distinct from old.collected_at
     or new.amount_cents is distinct from old.amount_cents then
    select b.status into v_status
    from booking b
    where b.id = new.booking_id;

    if v_status in ('cancelled', 'no_show', 'expired') then
      raise exception 'booking_closed' using errcode = 'PV003';
    end if;
  end if;

  return new;
end;
$function$;

create trigger deposit_refuses_money_after_close
  before insert or update on deposit
  for each row
  execute function deposit_refuses_money_after_close();

-- Nothing is deducted from money the business has kept, and nothing waived
-- off it: the charges close when the deposit is kept, as they do when it is
-- released. Nor is anything charged on a booking that closed without a stay
-- and still holds a deposit — only a booking cancelled before this migration
-- can — because its release is refused (`canApproveRelease`: booking_closed),
-- so a charge raised there could never be settled. `canAddCharge()` hides the
-- buttons; this refuses the write.
create function deposit_charge_refuses_a_closed_booking() returns trigger
language plpgsql
as $function$
declare
  v_kept boolean;
  v_status text;
begin
  select d.forfeited_at is not null, b.status
  into v_kept, v_status
  from deposit d
  join booking b on b.id = d.booking_id
  where d.id = new.deposit_id;

  if v_kept then
    raise exception 'deposit_kept' using errcode = 'PV003';
  end if;

  if v_status in ('cancelled', 'no_show', 'expired') then
    raise exception 'booking_closed' using errcode = 'PV003';
  end if;

  return new;
end;
$function$;

create trigger deposit_charge_refuses_a_closed_booking
  before insert or update on deposit_charge
  for each row
  execute function deposit_charge_refuses_a_closed_booking();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A no-show releases its unit.
--
-- The exclusion constraint's `where`, and every reader that repeats it, gains
-- `no_show`. Until today a no-show was unreachable from any screen; making it
-- reachable without this would have left the unit unsellable for every night
-- the guest did not come — and, because a no-show is terminal, refused the
-- new booking a late-arriving guest would need. `lib/domain/availability-
-- calendar.ts` and `lib/db/calendar.ts` say the same thing in TypeScript.
--
-- Loosening a partial constraint cannot fail on existing rows: it covers
-- fewer of them than before. It does lock `occupancy` while the constraint is
-- rebuilt — an exclusion constraint has no NOT VALID path — so every booking
-- write waits for the few seconds it takes. Harmless at one property's scale;
-- apply it off-hours all the same.
-- ═══════════════════════════════════════════════════════════════════════════

alter table occupancy drop constraint no_overlapping_occupancy;

alter table occupancy add constraint no_overlapping_occupancy
  exclude using gist (
    unit_id with =,
    daterange(start_date, end_date, '[)') with &&
  )
  where (status not in ('expired', 'cancelled', 'no_show'));

-- 20260904000100, with the predicate widened.
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
        and o.status not in ('expired', 'cancelled', 'no_show')
        and (
          p_exclude_booking_id is null
          or o.booking_id is distinct from p_exclude_booking_id
        )
        and daterange(o.start_date, o.end_date, '[)')
            && daterange(p_start, p_end, '[)')
    )
  order by u.ref;
$function$;

-- 20260904000100, with the predicate widened.
create or replace function occupancy_refuses_out_of_service_units() returns trigger
language plpgsql
as $function$
begin
  -- A released occupancy occupies nothing.
  if new.status in ('expired', 'cancelled', 'no_show') then
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

-- 20260905000100, with the predicate widened in both laterals.
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
      and o.status not in ('expired', 'cancelled', 'no_show')
      and o.start_date <= as_of.day
      -- Null means "no last day yet", which covers today and every day after.
      and (o.end_date is null or o.end_date > as_of.day)
    limit 1
  ) live on true
  left join lateral (
    select min(o.start_date) as start_date
    from occupancy o
    where o.unit_id = u.id
      and o.status not in ('expired', 'cancelled', 'no_show')
      and o.start_date > as_of.day
  ) upcoming on true
  where u.property_id = p_property_id
  order by u.ref;
$function$;

-- 20260905000100, with the predicate widened.
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
    and o.status not in ('expired', 'cancelled', 'no_show')
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

-- 20260913000100, with the predicate widened. A day pass nobody used gives
-- back its headroom the way a no-show stay gives back its unit.
create or replace function day_pass_headroom(
  p_property_id uuid,
  p_from date,
  p_to date
)
returns table (pass_date date, capacity integer, taken integer)
language sql
stable
as $function$
  select
    days.day::date as pass_date,
    (
      select min(f.day_pass_capacity)::integer
      from facility f
      where f.property_id = p_property_id
        and f.included_in_day_pass
        and f.day_pass_capacity is not null
    ) as capacity,
    coalesce((
      select sum(dp.headcount)
      from day_pass dp
      join booking b
        on b.id = dp.booking_id
       and b.property_id = dp.property_id
      where dp.property_id = p_property_id
        and dp.pass_date = days.day::date
        and b.status not in ('expired', 'cancelled', 'no_show')
    ), 0)::integer as taken
  from generate_series(p_from, p_to, interval '1 day') as days (day)
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. transition_booking() no longer cancels or marks a no-show.
--
-- 20260830000100's body, with one guard at the top. Both events settle a
-- deposit as they close the booking, which this function cannot do, so the
-- only way either happens is `close_booking()` below. lib/db narrows the
-- TypeScript signature to match, so the guard is the database refusing last.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function transition_booking(
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
  if p_event in ('cancel', 'mark_no_show') then
    return jsonb_build_object('ok', false, 'error', 'closes_through_close_booking');
  end if;

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. close_booking() — cancel or no-show, and the deposit, in one transaction.
--
-- The status pair is derived by `transition()` in TypeScript and passed in,
-- because architecture.md §5.3 keeps the machine in one module; this re-checks
-- the status under the row lock, as every writer does.
--
-- What happens to the deposit depends only on the row, read under its lock:
--
--   collected, still held      cancel + keep, or no-show  →  kept
--                              cancel + return            →  released at the close
--   promised, never verified                              →  nothing; it lapses
--   none, waived, or quoting nothing                      →  nothing
--
-- `p_deposit_outcome` is required for a cancellation, whether or not a deposit
-- turns out to be held, so a caller can never cancel without having chosen —
-- the dialog that showed no choice sends the default. A no-show takes none.
-- ═══════════════════════════════════════════════════════════════════════════

create function close_booking(
  p_property_id uuid,
  p_booking_id uuid,
  p_from_status text,
  p_to_status text,
  p_event text,
  p_deposit_outcome text default null,
  p_actor_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_deposit deposit%rowtype;
  v_has_deposit boolean;
  v_today date;
  v_arrival date;
  v_charges integer;
  v_outcome text := 'none';
begin
  if p_event not in ('cancel', 'mark_no_show') then
    return jsonb_build_object('ok', false, 'error', 'invalid_event');
  end if;

  if p_event = 'cancel' and (p_deposit_outcome is null or p_deposit_outcome not in ('keep', 'return')) then
    return jsonb_build_object('ok', false, 'error', 'deposit_outcome_required');
  end if;

  -- prd.md §9.5 has no exception for a guest who never came.
  if p_event = 'mark_no_show' and p_deposit_outcome is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid_deposit_outcome');
  end if;

  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_booking.status <> p_from_status then
    return jsonb_build_object('ok', false, 'error', 'status_changed', 'status', v_booking.status);
  end if;

  -- [A] Not before the arrival day, read in the property's own timezone: a
  -- stay date is a calendar date there (architecture.md §5.1). canMarkNoShow()
  -- in lib/domain/booking-state.ts says the same before the button renders.
  if p_event = 'mark_no_show' then
    select (now() at time zone p.time_zone)::date into v_today
    from property p
    where p.id = p_property_id;

    select coalesce(
      (select o.start_date from occupancy o
        where o.booking_id = p_booking_id and o.property_id = p_property_id),
      (select dp.pass_date from day_pass dp
        where dp.booking_id = p_booking_id and dp.property_id = p_property_id)
    ) into v_arrival;

    if v_arrival is null or v_arrival > v_today then
      return jsonb_build_object('ok', false, 'error', 'before_arrival_day', 'arrival', v_arrival);
    end if;
  end if;

  select * into v_deposit
  from deposit
  where booking_id = p_booking_id and property_id = p_property_id
  for update;

  v_has_deposit := found;

  -- The occupancy follows through `booking_status_syncs_occupancy`, and the
  -- widened constraint above is what frees a no-show's unit.
  update booking
  set status = p_to_status
  where id = p_booking_id and property_id = p_property_id;

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
    case
      when p_reason is null then jsonb_build_object('status', p_to_status)
      else jsonb_build_object('status', p_to_status, 'reason', p_reason)
    end
  );

  if v_has_deposit
     and v_deposit.collected_at is not null
     and v_deposit.released_at is null
     and v_deposit.forfeited_at is null then

    if p_event = 'mark_no_show' or p_deposit_outcome = 'keep' then
      update deposit
      set forfeited_at = now(),
          forfeited_by = p_actor_id,
          forfeited_amount_cents = v_deposit.amount_cents
      where id = v_deposit.id;

      insert into audit_event (
        property_id, actor_id, action, entity_type, entity_id, before, after
      )
      values (
        p_property_id,
        p_actor_id,
        'deposit.forfeited',
        'deposit',
        v_deposit.id,
        jsonb_build_object('amount_cents', v_deposit.amount_cents),
        jsonb_strip_nulls(jsonb_build_object(
          'amount_cents', v_deposit.amount_cents,
          'quoted_cents', v_booking.security_deposit_cents,
          'booking_event', p_event,
          'reason', p_reason
        ))
      );

      v_outcome := 'kept';
    else
      -- Given back: the release arithmetic `deposit_release_arithmetic`
      -- enforces, against whatever charges stand. On a booking that never
      -- began there are none in practice, and if somebody raised one it is
      -- honoured rather than silently dropped.
      select coalesce(sum(dc.amount_cents), 0)::integer into v_charges
      from deposit_charge dc
      where dc.deposit_id = v_deposit.id and dc.waived_at is null;

      update deposit
      set released_at = now(),
          released_by = p_actor_id,
          release_note = p_reason,
          charges_total_cents = v_charges,
          released_amount_cents = greatest(v_deposit.amount_cents - v_charges, 0),
          owed_cents = greatest(v_charges - v_deposit.amount_cents, 0)
      where id = v_deposit.id;

      insert into audit_event (
        property_id, actor_id, action, entity_type, entity_id, before, after
      )
      values (
        p_property_id,
        p_actor_id,
        'deposit.returned',
        'deposit',
        v_deposit.id,
        jsonb_build_object('amount_cents', v_deposit.amount_cents),
        jsonb_strip_nulls(jsonb_build_object(
          'amount_cents', v_deposit.amount_cents,
          'released_amount_cents', greatest(v_deposit.amount_cents - v_charges, 0),
          'charges_total_cents', v_charges,
          'owed_cents', greatest(v_charges - v_deposit.amount_cents, 0),
          'reason', p_reason
        ))
      );

      v_outcome := 'returned';
    end if;
  elsif v_has_deposit and v_deposit.collected_at is null then
    v_outcome := 'promise_lapsed';
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', p_to_status,
    'deposit', v_outcome,
    'amount_cents', case when v_outcome in ('kept', 'returned') then v_deposit.amount_cents else 0 end
  );
end;
$function$;

revoke execute on function close_booking(uuid, uuid, text, text, text, text, uuid, text)
  from public, anon, authenticated;

grant execute on function close_booking(uuid, uuid, text, text, text, text, uuid, text)
  to service_role;

comment on function close_booking(uuid, uuid, text, text, text, text, uuid, text) is
  'Cancels a booking or marks it a no-show, and settles its security deposit in the same transaction: kept, or — on a cancellation the desk chose to refund — released (prd.md §9.5).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. deposit_summary carries the forfeiture and the booking's stream.
--
-- 20260918000100's view with four columns appended — `create or replace view`
-- may add columns at the end and may not move one. The stream is for revenue,
-- which counts a kept deposit in the stream its booking belonged to.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view deposit_summary
with (security_invoker = true)
as
select
  d.id,
  d.property_id,
  d.booking_id,
  b.reference as booking_reference,
  b.status as booking_status,
  g.name as guest_name,
  g.phone as guest_phone,
  o.id as occupancy_id,
  o.unit_id,
  u.ref as unit_ref,
  o.start_date as check_in,
  o.end_date as check_out,

  d.amount_cents,
  d.method,
  d.collected_by,
  d.collected_at,

  i.id as inspection_id,
  i.outcome as inspection_outcome,
  i.notes as inspection_notes,
  i.inspected_by,
  i.inspected_at,

  coalesce(c.charges_total_cents, 0)::integer as charges_total_cents,
  coalesce(c.charge_count, 0)::integer as charge_count,

  d.released_at,
  d.released_by,
  d.release_note,
  d.released_amount_cents,
  d.charges_total_cents as approved_charges_total_cents,
  d.owed_cents,

  d.owed_settled_at,
  d.owed_settled_by,
  d.owed_settled_method,

  d.promised_at,
  d.observed_reference,
  d.observed_sender,
  d.observed_on,
  d.amount_override_reason,

  -- What the booking quotes, beside what is held. The pair is the shortfall.
  b.security_deposit_cents as quoted_cents,

  -- Appended rather than slotted in beside `collected_at` where it belongs:
  -- `create or replace view` may add a column at the end and may not rename
  -- one, so inserting it mid-list renames every column after it and Postgres
  -- refuses. The same reason `quoted_cents` above sits here.
  d.slip_document_id,

  -- The deposit kept (20260922000100), appended for the same reason.
  d.forfeited_at,
  d.forfeited_by,
  d.forfeited_amount_cents,
  b.stream as booking_stream
from deposit d
join booking b on b.id = d.booking_id
join guest g on g.id = b.guest_id
left join occupancy o on o.booking_id = b.id
left join unit u on u.id = o.unit_id
left join inspection i on i.occupancy_id = o.id
left join lateral (
  select
    sum(dc.amount_cents) as charges_total_cents,
    count(*) as charge_count
  from deposit_charge dc
  where dc.deposit_id = d.id and dc.waived_at is null
) c on true;
