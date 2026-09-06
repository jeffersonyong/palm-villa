-- Seed: demo bookings and payments, for local development only.
--
-- Loaded after ./seed.sql on `npm run db:reset` (config.toml [db.seed]). To
-- work against empty screens instead, drop this path from `sql_paths` — the
-- file is additive and nothing else references it.
--
-- ── Why this exists, and why it is a separate file ─────────────────────────
--
-- ./seed.sql records the decision NOT to seed bookings: "a seed that invented
-- guests would put fictional people in a real database". That reasoning is
-- about the system of record, and it still stands — which is why none of this
-- lives in that file. `supabase db reset` rebuilds the local CLI stack and
-- nothing else; production schema moves by `db push`, which never runs a seed.
--
-- Two rules keep the distinction honest:
--
--   1. Every guest here is named for the SCENARIO it sets up, prefixed DEMO.
--      No invented person appears in the database — `DEMO — Awaiting transfer`
--      cannot be mistaken for someone who stayed at Palm Villa.
--   2. Nothing is inserted directly. Every booking goes through
--      create_walk_in_booking() and every status move through
--      transition_booking(), so this data is reachable by the application and
--      subject to the G1 exclusion constraint. A demo row that the product
--      could not itself produce would be a fixture layer by another name —
--      exactly what ./seed.sql's note was written to prevent.
--
-- ── The one thing this file cannot write ────────────────────────────────────
--
-- An accounting pack (capability G5). It is a rendered PDF uploaded to
-- Storage, and SQL can do neither, so it is assembled straight afterwards by
-- scripts/assemble-demo-packs.mjs through the nightly job's own route —
-- `npm run db:seed-demo` runs both halves. Rule 2 is kept rather than bent:
-- the pack is written by the code that writes every other pack.
--
-- Leaving it out told a lie on screen. The booking screen infers "a pack is
-- being assembled" from a verification too recent for one to have landed —
-- true after a clerk verifies a payment, because that path schedules the
-- assembly, and false after a seed, because nothing did. So every settled
-- demo booking claimed to be mid-assembly for two minutes, and no demo
-- booking ever had the pack G5 exists to show.
--
-- The deposits ledger (E1) needs a deposit to be about, so the two stays that
-- have begun go through check_in_booking() and the one that ended last week is
-- inspected, charged and released — the shape that exercises an amount owed and
-- the statement. Same rule as everything else here: real functions only.
--
-- Nothing is priced by hand: the nightly figure is read from the unit type's
-- base_rate_cents, seeded from prd.md §7.1, and the BND 100 security deposit
-- is the [C] figure from prd.md §11. Dates are relative to today in
-- Asia/Brunei, so "arriving today" stays true on every reset.

do $demo$
declare
  v_property_id uuid;
  v_today date := (now() at time zone 'Asia/Brunei')::date;
  v_unit_id uuid;
  v_rate_cents integer;
  v_total_cents integer;
  v_status text;
  v_result jsonb;
  v_booking_id uuid;
  v_deposit_id uuid;
  v_check_in date;
  spec record;
begin
  select id into strict v_property_id from property where name = 'Palm Villa';

  -- Re-runnable. `npm run db:seed-demo` replays this file after the integration
  -- suite has cleared the bookings (lib/db/test/setup.ts empties `booking` and
  -- `guest` between tests, so a `npm test` run takes the demo data with it).
  -- Without this guard a second run would raise on the G1 exclusion constraint,
  -- the units being already occupied by the first.
  if exists (select 1 from guest where property_id = v_property_id and name like 'DEMO %') then
    raise notice 'Demo data already present; nothing to do.';
    return;
  end if;

  for spec in
    -- The 2-bedroom type is deliberately absent: ./seed.sql seeds it with zero
    -- units pending prd.md §18 N1, and a demo booking is not the place to
    -- answer that.
    --
    -- `settles_at` is the status the booking should come to rest in.
    -- create_walk_in_booking() can only produce the two a walk-in reaches, so
    -- anything further is walked there by transition_booking() below — the
    -- same path the portal's own actions take.
    --
    -- `vehicles` is an array now (prd.md §13 [C] requires a registration, and a
    -- family often arrives in more than one car). The one booking with no
    -- plates carries the deliberate exception instead, so the demo data shows
    -- both halves of how the field is answered.
    select * from (values
      ('DEMO — Arriving today (cash)',        '+673 000 0001', '3B-01',  0, 2, 2, array['BAA 1234'],             false, 'cash',          'confirmed'),
      ('DEMO — Awaiting transfer',            '+673 000 0002', '3B-02',  3, 3, 4, array[]::text[],              true,  'bank_transfer', 'awaiting_payment_verification'),
      ('DEMO — Awaiting transfer (4-bed)',    '+673 000 0003', '4B-01',  7, 3, 6, array['BAB 5678', 'BAD 3456'], false, 'bank_transfer', 'awaiting_payment_verification'),
      ('DEMO — In residence',                 '+673 000 0004', 'SD-01', -1, 3, 8, array['BAC 9012'],            false, 'cash',          'checked_in'),
      ('DEMO — Departed last week',           '+673 000 0005', '3B-03', -5, 3, 2, array['BAE 7788'],            false, 'cash',          'completed'),
      ('DEMO — Left today, not inspected',    '+673 000 0006', '3B-04', -2, 2, 3, array['BAF 2244'],            false, 'cash',          'completed')
    ) as t (
      guest_name, phone, unit_ref, start_offset, nights,
      chargeable_guests, vehicles, no_vehicle, payment_method, settles_at
    )
  loop
    select u.id, ut.base_rate_cents
    into strict v_unit_id, v_rate_cents
    from unit u
    join unit_type ut on ut.id = u.unit_type_id
    where u.property_id = v_property_id and u.ref = spec.unit_ref;

    v_total_cents := v_rate_cents * spec.nights;
    v_check_in := v_today + spec.start_offset;

    -- Derived from the method, not chosen: draft --pay_in_full--> confirmed,
    -- or draft --submit_payment--> awaiting_payment_verification. Both are
    -- transitions lib/domain/booking-state.ts already owns; this mirrors them
    -- rather than inventing a third answer.
    v_status := case
      when spec.payment_method = 'cash' then 'confirmed'
      else 'awaiting_payment_verification'
    end;

    select create_walk_in_booking(
      v_property_id,
      v_unit_id,
      v_status,
      v_check_in,
      v_check_in + spec.nights,
      spec.guest_name,
      spec.phone,
      spec.vehicles,
      spec.no_vehicle,
      spec.chargeable_guests,
      0,
      v_total_cents,
      -- prd.md §11: the refundable BND 100, held apart from the total.
      10000,
      jsonb_build_array(jsonb_build_object(
        'type', 'accommodation',
        'description', spec.nights || ' nights',
        'quantity', spec.nights,
        'unitPrice', v_rate_cents,
        'amount', v_total_cents
      )),
      spec.payment_method,
      -- Named from here on. The discount parameters sit between the payment
      -- method and the actor, and a positional `null` would have quietly
      -- become a discount kind the day one of them stopped being optional.
      p_actor_id => null
      -- No actor. These bookings were taken by nobody, and naming the
      -- bootstrap admin would put a real account's name against work it did
      -- not do. Every actor column in this schema is nullable for this case.
    ) into v_result;

    if v_result ->> 'ok' <> 'true' then
      raise exception 'Demo seed could not create "%" in %: %',
        spec.guest_name, spec.unit_ref, v_result ->> 'error';
    end if;

    v_booking_id := (v_result ->> 'booking_id')::uuid;

    -- Walk the rest of the machine. Each step is a real transition with its
    -- own audit event, so the trail reads as it would for a booking that
    -- actually checked in.
    --
    -- Checking in goes through check_in_booking() rather than
    -- transition_booking(), because that is the path the portal takes and it
    -- is what collects the BND 100 deposit in the same transaction. A demo
    -- guest in residence with no deposit against them would show the deposits
    -- ledger as empty on a fresh stack, which is the one screen prd.md §20
    -- names.
    if spec.settles_at in ('checked_in', 'completed') then
      perform check_in_booking(
        v_property_id, v_booking_id, 'confirmed', 'checked_in', 'cash', null
      );
    end if;

    if spec.settles_at = 'completed' then
      perform transition_booking(
        v_property_id, v_booking_id, 'checked_in', 'completed', 'check_out', null
      );
    end if;

    -- One booking carries notes, so the thread on the detail screen is not
    -- empty on a fresh stack — and so both audiences are visible at once. The
    -- in-house guest is the natural one: it is the case where housekeeping
    -- would actually be told something.
    if spec.settles_at = 'checked_in' then
      insert into booking_note (property_id, booking_id, audience, body, author_id)
      values
        (
          v_property_id, v_booking_id, 'internal',
          'DEMO — Guest asked about a late check-out. Quoted BND 15 an hour, not booked yet.',
          null
        ),
        (
          v_property_id, v_booking_id, 'housekeeping',
          'DEMO — Extra towels on arrival, four guests rather than two.',
          null
        );
    end if;

    -- The deposit walk-through, so a fresh stack shows every stage of the
    -- ledger rather than one. The stay that left last week goes all the way:
    -- inspected with something found, charged past the BND 100 held, and
    -- released — which is the only shape that exercises an amount owed and a
    -- statement. The one that left today stops at the inspection, so the
    -- "awaiting inspection" tile is not always zero.
    --
    -- Through the real functions, like everything else here: a demo deposit
    -- inserted directly would be a fixture layer by another name.
    if spec.settles_at = 'completed' and spec.start_offset = -5 then
      perform record_inspection(
        v_property_id, v_booking_id, 'issues_found',
        'DEMO — Shower screen cracked, bottom left. Two towels missing.',
        null
      );

      select id into v_deposit_id
      from deposit
      where booking_id = v_booking_id and property_id = v_property_id;

      perform add_deposit_charge(
        v_property_id, v_deposit_id, 13000,
        'DEMO — Shower screen replacement, quoted', null
      );

      perform approve_deposit_release(
        v_property_id, v_deposit_id,
        'DEMO — Charged for the screen only; the marks by the door were pre-existing.',
        null
      );
    end if;
  end loop;
end;
$demo$;
