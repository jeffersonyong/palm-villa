-- ═══════════════════════════════════════════════════════════════════════════
-- The deposit secures the booking, and nothing else does (capability B16;
-- prd.md §9.1, §9.4, §11, §12).
--
-- Two slices built the deposit-secured booking one half at a time, and each
-- left a door open that the other did not know about. 20260913000200 taught
-- check-in to recognise a deposit already held — and, as a judgement, to
-- collect one that was only promised. 20260914000100 gave the desk a way to
-- take the deposit against an existing booking. Between them, three things
-- were still true that the agreed rule says are not:
--
--   1. **The walk-in form never took the deposit.** It wrote a payment for
--      the stay and left the BND 100 to a receipt saying "record it later" —
--      so a booking taken at the counter reached `confirmed` on the stay
--      alone, and the deposit that is supposed to secure it was an errand.
--   2. **Money for the stay confirmed a booking whose deposit was unverified.**
--      A customer who chose "everything now" raised two rows; verifying the
--      stay's row first confirmed the booking and emailed the guest while the
--      deposit's row was still a promise nobody had checked. A customer who
--      sent the stay and forgot the deposit was confirmed with the deposit
--      row left in the queue for good.
--   3. **Check-in was still a place a deposit got collected.** Which is the
--      spreadsheet's habit, and the one the reversal of 10 September 2026 was
--      meant to end: a guest does not have a booking until the deposit is in.
--
-- The rule, stated once: **a booking quoting a deposit is confirmed by that
-- deposit — counted in cash, or verified in the queue — and by nothing else.
-- A booking quoting none is confirmed by paying for it.** The stay's money is
-- recorded whenever it arrives and settles the balance, but it moves no
-- booking to `confirmed` while the deposit is owed. The one place the deposit
-- is taken "at arrival" is a walk-in, and there the booking is being made at
-- the same moment, so it is still the booking that takes it.
--
-- ── What changes ──────────────────────────────────────────────────────────
--
-- `create_walk_in_booking()` takes the deposit as the booking is made — cash
-- collected, transfer promised — and takes the stay only when asked to
-- (`p_pay_stay_now`), which is the same choice the customer makes on their
-- own page: the deposit alone, or everything. A booking quoting no deposit
-- has nothing else to secure it, so the stay is always taken there.
--
-- `verify_payment()` and `record_cash_payment()` refuse to move a booking to
-- `confirmed` while it quotes a deposit that is not collected. The caller in
-- lib/db already passes no status pair in that case, so the payment is
-- recorded and the booking left waiting; this is the guard for a caller that
-- forgets, in the place `payment_mismatch_needs_reason` guards the amount.
--
-- `check_in_booking()` collects nothing. It refuses, with a sentence, when
-- the quoted deposit is not in the safe — whether nothing was ever taken or a
-- transfer was promised and never seen — because a guest checked in with no
-- deposit recorded is precisely the gap this product exists to close, and
-- the Money card is one click away with the two honest ways to fix it. The
-- `p_method` parameter goes with it: there is no longer a deposit to say how
-- it was taken.
--
-- The `at_check_in` and `at_check_in_after_promise` values of `via` stay in
-- the trail for every deposit written before this; nothing writes them again.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Whether a booking's deposit is in hand ─────────────────────────────
--
-- One question three functions ask, so it is asked one way. True when the
-- booking quotes nothing (a waiver, or a stream with no deposit) or when a
-- deposit row exists with `collected_at` set — counted at the desk or
-- verified in the queue. A promise is not in hand.

create function booking_deposit_is_secured(
  p_property_id uuid,
  p_booking_id uuid,
  p_quoted_cents integer
)
returns boolean
language sql
stable
as $function$
  select coalesce(p_quoted_cents, 0) <= 0
    or exists (
      select 1
      from deposit d
      where d.booking_id = p_booking_id
        and d.property_id = p_property_id
        and d.collected_at is not null
    );
$function$;

comment on function booking_deposit_is_secured(uuid, uuid, integer) is
  'True when the booking quotes no security deposit, or one has been collected against it. A promised transfer does not count (prd.md §9.1).';

revoke execute on function booking_deposit_is_secured(uuid, uuid, integer)
  from public, anon, authenticated;

grant execute on function booking_deposit_is_secured(uuid, uuid, integer) to service_role;

-- ── 2. check_in_booking() takes nothing ───────────────────────────────────

drop function check_in_booking(uuid, uuid, text, text, text, uuid);

create function check_in_booking(
  p_property_id uuid,
  p_booking_id uuid,
  p_from_status text,
  p_to_status text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_deposit deposit%rowtype;
  v_updated integer;
begin
  -- Booking then deposit, the order every function touching both takes.
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

  select * into v_deposit
  from deposit
  where booking_id = p_booking_id and property_id = p_property_id
  for update;

  -- The refusal this migration exists for. `promised` tells the screen which
  -- of the two sentences to say: confirm the transfer in the queue or take it
  -- in cash, versus record it from the booking.
  if v_booking.security_deposit_cents > 0
     and (v_deposit.id is null or v_deposit.collected_at is null) then
    return jsonb_build_object(
      'ok', false,
      'error', 'deposit_not_secured',
      'promised', v_deposit.id is not null,
      'amount_cents', v_booking.security_deposit_cents
    );
  end if;

  update booking
  set status = p_to_status
  where id = p_booking_id
    and property_id = p_property_id
    and status = p_from_status;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'status_changed', 'status', v_booking.status);
  end if;

  -- The deposit is named on the check-in event so the trail links the two,
  -- as it always was; `already_held` is now the only shape, because it is
  -- the only way a guest reaches the door.
  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'booking.check_in', 'booking', p_booking_id,
    jsonb_build_object('status', p_from_status),
    case
      when v_deposit.id is null then jsonb_build_object('status', p_to_status)
      else jsonb_build_object(
        'status', p_to_status, 'deposit_id', v_deposit.id, 'deposit', 'already_held'
      )
    end
  );

  return jsonb_build_object(
    'ok', true,
    'status', p_to_status,
    'deposit_id', v_deposit.id,
    -- What is actually in the safe, which can differ from the quote after a
    -- verification accepted a discrepancy with a reason.
    'amount_cents', coalesce(v_deposit.amount_cents, 0)
  );
end;
$function$;

comment on function check_in_booking(uuid, uuid, text, text, uuid) is
  'Moves a confirmed booking to checked_in. Collects nothing: a booking quoting a security deposit that is not collected is refused (prd.md §11, §12). The caller passes the status pair the state machine derived.';

revoke execute on function check_in_booking(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;

grant execute on function check_in_booking(uuid, uuid, text, text, uuid) to service_role;

-- ── 3. verify_payment() refuses to confirm past an unsecured deposit ──────
--
-- Body only; the signature is 20260903000200's. The one addition is the guard
-- after the status check, and it sits before any write for the reason every
-- guard here does: a plpgsql `return` does not roll back.

create or replace function verify_payment(
  p_property_id uuid,
  p_payment_id uuid,
  p_from_status text,
  p_to_status text,
  p_observed_amount_cents integer,
  p_match_kind text,
  p_observed_reference text default null,
  p_observed_sender text default null,
  p_observed_on date default null,
  p_amount_override_reason text default null,
  p_match_reason text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_payment payment%rowtype;
  v_booking booking%rowtype;
  v_due integer;
  v_updated integer;
  v_override_reason text := nullif(btrim(coalesce(p_amount_override_reason, '')), '');
  v_match_reason text := nullif(btrim(coalesce(p_match_reason, '')), '');
begin
  -- Lock order is payment then booking, and nothing else in this schema takes
  -- them in the opposite order.
  select * into v_payment
  from payment
  where id = p_payment_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_payment.status <> 'pending_verification' then
    return jsonb_build_object('ok', false, 'error', 'already_verified');
  end if;

  select * into v_booking
  from booking
  where id = v_payment.booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  -- Only checked when the caller intends a move. A top-up against a confirmed
  -- booking passes nulls and the booking is left exactly where it is.
  if p_to_status is not null and v_booking.status <> p_from_status then
    return jsonb_build_object('ok', false, 'error', 'status_changed');
  end if;

  -- Money for the stay does not confirm a booking whose deposit is owed. The
  -- caller passes no pair in that case and the payment is simply recorded;
  -- this refuses a caller that did not check.
  if p_to_status = 'confirmed'
     and not booking_deposit_is_secured(p_property_id, v_booking.id, v_booking.security_deposit_cents) then
    return jsonb_build_object('ok', false, 'error', 'deposit_not_secured');
  end if;

  -- What is outstanding NOW, under the lock: the total less everything else
  -- already verified against this booking. `id <> p_payment_id` is belt and
  -- braces — this payment is pending, so it contributes nothing to the sum —
  -- and says out loud that a payment is never matched against itself.
  select v_booking.total_cents - coalesce(sum(p.amount_cents), 0)
  into v_due
  from payment p
  where p.booking_id = v_booking.id
    and p.property_id = p_property_id
    and p.status = 'verified'
    and p.id <> p_payment_id;

  -- Belt and braces in front of the table checks, so a missing reason reaches
  -- the clerk as a sentence rather than as a constraint violation.
  if p_observed_amount_cents <> v_due and v_override_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'due_cents', v_due);
  end if;

  if p_match_kind = 'manual' and v_match_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'due_cents', v_due);
  end if;

  update payment
  set
    status = 'verified',
    amount_cents = p_observed_amount_cents,
    expected_amount_cents = v_due,
    match_kind = p_match_kind,
    observed_reference = p_observed_reference,
    observed_sender = p_observed_sender,
    observed_on = p_observed_on,
    amount_override_reason = v_override_reason,
    match_reason = v_match_reason,
    verified_by = p_actor_id,
    verified_at = now()
  where id = p_payment_id and property_id = p_property_id;

  if p_to_status is not null then
    update booking
    set status = p_to_status
    where id = v_booking.id
      and property_id = p_property_id
      and status = p_from_status;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      -- Unreachable: the booking row is locked above. Raised rather than
      -- returned precisely because it would mean the lock did not hold.
      raise exception 'verify_payment lost the booking it had locked (%)', v_booking.id;
    end if;
  end if;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'payment.verified', 'payment', p_payment_id,
    jsonb_build_object(
      'status', 'pending_verification',
      'expected_amount_cents', v_payment.expected_amount_cents
    ),
    jsonb_build_object(
      'status', 'verified',
      'amount_cents', p_observed_amount_cents,
      'expected_amount_cents', v_due,
      'match_kind', p_match_kind
    )
  );

  if p_observed_amount_cents <> v_due then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'payment.amount_overridden', 'payment', p_payment_id,
      jsonb_build_object('expected_amount_cents', v_due),
      jsonb_build_object(
        'amount_cents', p_observed_amount_cents,
        'variance_cents', p_observed_amount_cents - v_due,
        'reason', v_override_reason
      )
    );
  end if;

  if p_match_kind = 'manual' then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'payment.matched_manually', 'payment', p_payment_id,
      jsonb_build_object('booking_reference', v_booking.reference),
      jsonb_build_object(
        'observed_reference', p_observed_reference,
        'observed_sender', p_observed_sender,
        'observed_on', p_observed_on,
        'amount_cents', p_observed_amount_cents,
        'reason', v_match_reason
      )
    );
  end if;

  -- Only when the booking actually moved. A top-up leaves it confirmed, and a
  -- history line claiming otherwise would be the trail describing an event
  -- that did not happen.
  if p_to_status is not null then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'booking.verify_payment', 'booking', v_booking.id,
      jsonb_build_object('status', p_from_status),
      jsonb_build_object('status', p_to_status)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', coalesce(p_to_status, v_booking.status),
    'amount_cents', p_observed_amount_cents,
    'due_cents', v_due
  );

exception
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
end;
$function$;

-- ── 4. record_cash_payment() gets the same guard ──────────────────────────

create or replace function record_cash_payment(
  p_property_id uuid,
  p_booking_id uuid,
  p_amount_cents integer,
  p_from_status text default null,
  p_to_status text default null,
  p_event text default null,
  p_amount_override_reason text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_payment_id uuid;
  v_due integer;
  v_updated integer;
  v_override_reason text := nullif(btrim(coalesce(p_amount_override_reason, '')), '');
begin
  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if p_to_status is not null and v_booking.status <> p_from_status then
    return jsonb_build_object('ok', false, 'error', 'status_changed');
  end if;

  -- Cash for the stay is counted and recorded whatever the deposit is doing;
  -- what it may not do is confirm a booking whose deposit is owed.
  if p_to_status = 'confirmed'
     and not booking_deposit_is_secured(p_property_id, p_booking_id, v_booking.security_deposit_cents) then
    return jsonb_build_object('ok', false, 'error', 'deposit_not_secured');
  end if;

  select v_booking.total_cents - coalesce(sum(p.amount_cents), 0)
  into v_due
  from payment p
  where p.booking_id = p_booking_id
    and p.property_id = p_property_id
    and p.status = 'verified';

  if p_amount_cents <> v_due and v_override_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'due_cents', v_due);
  end if;

  insert into payment (
    property_id, booking_id, method, status,
    expected_amount_cents, amount_cents,
    amount_override_reason,
    collected_by, collected_at, verified_by, verified_at, created_by
  )
  values (
    p_property_id, p_booking_id, 'cash', 'verified',
    v_due, p_amount_cents,
    v_override_reason,
    p_actor_id, now(), p_actor_id, now(), p_actor_id
  )
  returning id into v_payment_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'payment.cash_recorded', 'payment', v_payment_id,
    null,
    jsonb_build_object(
      'booking_id', p_booking_id,
      'reference', v_booking.reference,
      'method', 'cash',
      'amount_cents', p_amount_cents,
      'expected_amount_cents', v_due,
      'collected_by', p_actor_id,
      'reason', v_override_reason
    )
  );

  if p_to_status is not null then
    update booking
    set status = p_to_status
    where id = p_booking_id
      and property_id = p_property_id
      and status = p_from_status;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      raise exception 'record_cash_payment lost the booking it had locked (%)', p_booking_id;
    end if;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'booking.' || p_event, 'booking', p_booking_id,
      jsonb_build_object('status', p_from_status),
      jsonb_build_object('status', p_to_status)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'status', coalesce(p_to_status, v_booking.status)
  );
end;
$function$;

-- ── 5. create_walk_in_booking() takes the deposit as the booking is made ──
--
-- Dropped and recreated rather than replaced, for the reason 20260830000100
-- set out: `create or replace function` cannot add a parameter.
--
-- `p_pay_stay_now` sits beside `p_payment_method` because the two are one
-- answer — what is being paid now, and how. A booking quoting no deposit has
-- nothing else to secure it, so the stay is always taken there, whatever the
-- caller passed; that is `submit_public_payment()`'s rule, and the walk-in
-- path now mirrors the customer's page rather than assuming the whole price
-- crosses the counter.

drop function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, text, integer, text, text, uuid
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
  -- How whatever is paid now was paid: cash counted, or a transfer promised.
  p_payment_method text,
  -- Whether the stay is paid now as well as the deposit. Forced true where no
  -- deposit is quoted, since the stay is then the only thing to pay for.
  p_pay_stay_now boolean,
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
  v_deposit_id uuid;
  v_reference text;
  v_is_cash boolean := p_payment_method = 'cash';
  v_vehicles text[] := coalesce(p_vehicles, '{}'::text[]);
  v_discount_reason text := nullif(btrim(coalesce(p_discount_reason, '')), '');
  v_waiver_reason text := nullif(btrim(coalesce(p_deposit_waiver_reason, '')), '');
  v_deposit_cents integer :=
    case when v_waiver_reason is null then p_security_deposit_cents else 0 end;
  v_takes_deposit boolean;
  v_pays_stay boolean;
begin
  if p_payment_method not in ('cash', 'bank_transfer') then
    raise exception 'unknown payment method: %', p_payment_method;
  end if;

  v_takes_deposit := coalesce(v_deposit_cents, 0) > 0;
  v_pays_stay := coalesce(p_pay_stay_now, false) or not v_takes_deposit;

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

  -- ── The deposit, as the booking is made ──────────────────────────────────
  --
  -- The same two shapes `record_booking_deposit()` writes, in the same
  -- transaction as the booking: cash is money now, so the row is collected
  -- and the booking is secured on the spot; a transfer is a promise, so the
  -- row is written the way the customer's own button writes it and joins the
  -- same queue. The amount is the quoted figure — there is no other.
  if v_takes_deposit then
    if v_is_cash then
      insert into deposit (
        property_id, booking_id, amount_cents, method, collected_by, collected_at
      )
      values (p_property_id, v_booking_id, v_deposit_cents, 'cash', p_actor_id, now())
      returning id into v_deposit_id;

      insert into audit_event (
        property_id, actor_id, action, entity_type, entity_id, before, after
      )
      values (
        p_property_id, p_actor_id, 'deposit.collected', 'deposit', v_deposit_id,
        null,
        jsonb_build_object(
          'booking_id', v_booking_id,
          'booking_reference', v_reference,
          'amount_cents', v_deposit_cents,
          'method', 'cash',
          'via', 'at_booking'
        )
      );
    else
      insert into deposit (
        property_id, booking_id, amount_cents, method, promised_at, collected_at, collected_by
      )
      values (p_property_id, v_booking_id, v_deposit_cents, 'bank_transfer', now(), null, null)
      returning id into v_deposit_id;

      insert into audit_event (
        property_id, actor_id, action, entity_type, entity_id, before, after
      )
      values (
        p_property_id, p_actor_id, 'deposit.promised', 'deposit', v_deposit_id,
        null,
        jsonb_build_object(
          'booking_id', v_booking_id,
          'booking_reference', v_reference,
          'amount_cents', v_deposit_cents,
          'method', 'bank_transfer',
          'via', 'at_booking'
        )
      );
    end if;
  end if;

  -- ── The stay, when it is paid now ────────────────────────────────────────
  --
  -- The payment's own status is derived here, and that asymmetry with
  -- p_status is deliberate. booking.status is a state machine architecture.md
  -- §5.3 keeps in exactly one place; a payment's initial status is not a
  -- machine at all, it is a property of the method — cash has no bank to
  -- check.
  --
  -- A discounted booking pays the discounted total, which is what
  -- p_total_cents already is: the discount is a line, and the total is the sum
  -- of the lines. Nothing here subtracts anything.
  if v_pays_stay then
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

    -- The money has its own entry in the trail rather than being a field on
    -- the booking's.
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
  end if;

  -- architecture.md §5.3: every transition writes an audit event, in the same
  -- transaction as the transition itself. The deposit recorded here is what
  -- the booking QUOTES — zero when waived; the waiver's own event below says
  -- what that zero stands in for. `paying` says which of the customer's two
  -- answers the desk gave on their behalf.
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
      'paying', case
        when v_takes_deposit and v_pays_stay then 'deposit_and_stay'
        when v_takes_deposit then 'deposit_only'
        else 'stay'
      end,
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
  -- reader asks "why was nothing taken". `amount_cents` is what would have
  -- been held — the figure the question is actually about.
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

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'reference', v_reference,
    'payment_id', v_payment_id,
    'deposit_id', v_deposit_id
  );

exception
  -- The G1 constraint refusing a second booking over the same unit and dates.
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_unavailable');
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_not_found');
end;
$function$;

comment on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, boolean, text, integer, text, text, uuid
) is
  'Creates a booking at the desk in one transaction: guest, booking, vehicles, occupancy, lines, the security deposit (collected in cash or promised by transfer) and, when asked, the payment for the stay. The status is the one the state machine derived.';

revoke execute on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, boolean, text, integer, text, text, uuid
) from public, anon, authenticated;

grant execute on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text[], boolean,
  integer, integer, integer, integer, jsonb, text, boolean, text, integer, text, text, uuid
) to service_role;
