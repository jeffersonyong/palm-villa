-- ═══════════════════════════════════════════════════════════════════════════
-- The security deposit, promised at booking (capability B16; prd.md §9.1,
-- §9.5, §11; open-questions.md N29).
--
-- The client reversed two [C]s of his own on 10 September 2026: a booking is
-- secured by the BND 100 security deposit, the stay is settled on arrival, and
-- the unit is held until somebody verifies that the deposit landed. prd.md
-- §11's as-built block lists what that asks for, and this migration is three
-- of those three things.
--
-- **A deposit can exist before check-in.** Until now `check_in_booking()` was
-- the only writer, with a backstop refusing a second — the right guarantee in
-- exactly the wrong place, once money can arrive before the guest does.
-- `collected_at` becomes nullable and `promised_at` marks the window in
-- between: the customer has said they transferred, and nobody has looked yet.
--
-- **A promised deposit is verified the way a payment is** — reference and
-- amount, in the queue, with a written reason when the figure disagrees
-- (prd.md §10.4). `verify_deposit()` is `verify_payment()`'s shape, not its
-- code, and the difference is the point of the whole design below.
--
-- **A deposit is never a payment row, and this is what makes that true.**
-- prd.md §9.1 spends a paragraph on it: BND 100 against a BND 400 stay is
-- short by BND 300, so recording the deposit as a payment would demand an
-- override reason on the ordinary case — the failure §10.7 already fixed once.
-- Putting the pending state on `deposit` rather than adding a `purpose` column
-- to `payment` means `booking_summary.paid_cents`, `payment_summary
-- .due_amount_cents`, the revenue report, the cash-up and the accounting
-- pack's due-list are all untouched: they read `payment`, and a deposit is
-- still not one. The alternative would have needed every one of those readers
-- to remember to exclude it, and the first one to forget would have been
-- silent.
--
-- What that costs, stated rather than discovered: the verification queue now
-- reads two tables, and the deposits ledger has to exclude rows that are not
-- money yet. Both are one filter each.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The deposit learns the window between promised and seen.
--
-- `collected_at` had `not null default now()`, which encoded the old truth
-- that a deposit is created at the moment it is taken. Dropping the default
-- as well as the not-null matters: a default left behind would stamp a
-- collection time on a row nobody has collected, which is the failure this
-- column now exists to make visible.
--
-- The observed columns mirror `payment`'s exactly (20260831000100). A person
-- reading a bank app is asserting what they saw, and what they saw is the
-- record — the same fields, because it is the same act against a different
-- kind of money.
-- ═══════════════════════════════════════════════════════════════════════════

alter table deposit alter column collected_at drop not null;
alter table deposit alter column collected_at drop default;

alter table deposit
  add column promised_at timestamptz,
  add column observed_reference text,
  add column observed_sender text,
  add column observed_on date,
  add column amount_override_reason text;

comment on column deposit.promised_at is
  'When the customer said they had transferred the deposit (prd.md §9.1). Null for a deposit collected at the desk. Set together with a null collected_at — the row is a promise until somebody checks the bank.';

comment on column deposit.collected_at is
  'When the money was actually seen — counted at the desk, or matched in the bank app. Null while a promised transfer is unverified, which is the one state in which this row is not yet a liability.';

-- A row is one or the other and never neither. Without this a deposit could
-- exist having been neither promised nor collected, which is a liability the
-- ledger would report against nothing anybody did.
alter table deposit add constraint deposit_is_promised_or_collected check (
  collected_at is not null or promised_at is not null
);

-- Cash is counted in front of somebody, so it is collected the moment it
-- exists; only a transfer can be outstanding. This is what stops a clerk
-- recording "cash promised", which is not a thing.
alter table deposit add constraint deposit_pending_is_a_transfer check (
  collected_at is not null or method = 'bank_transfer'
);

-- Nothing is given back that was never taken. prd.md §11's pipeline runs from
-- collection to release, and a release approved over a promise would return
-- money the property never held.
alter table deposit add constraint deposit_release_needs_collection check (
  released_at is null or collected_at is not null
);

alter table deposit add constraint deposit_override_reason_length check (
  amount_override_reason is null or char_length(amount_override_reason) between 1 and 280
);

-- The ledger's "what is held right now" index (20260906000100) is only ever
-- asked about money the property actually has, so a promised row has no
-- business in it. Rebuilt rather than added to: a partial index is defined by
-- its predicate.
drop index deposit_held_idx;

create index deposit_held_idx on deposit (property_id, collected_at desc)
  where released_at is null and collected_at is not null;

-- And the question the queue asks, which nothing has ever asked before.
create index deposit_pending_idx on deposit (property_id, promised_at)
  where collected_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. submit_public_payment — the customer says they have transferred.
--
-- prd.md §10.3's flow, with the countdown struck out by N7 and the two halves
-- separated by what the customer actually does. Creating the booking holds the
-- unit; *this* is the moment the clock in the verification queue starts, which
-- is what `payment.created_at`'s own comment predicted a slice ago: "when the
-- public flow lands, the wait begins when the customer says they have
-- transferred, not when they started filling in the form".
--
-- Which rows it raises depends on what the customer chose to send, and both
-- answers are the client's own words. Asked on 10 September 2026 what a guest
-- transfers when booking, he named two cases — *the deposit only, or the full
-- amount with the deposit* — and N29 recorded both.
--
-- A short stay quoting a deposit therefore raises **the deposit, and the stay
-- as well when `p_pay_stay_now`**. Anything else is simply paid for: a day
-- pass has no unit to secure, and neither does a stay quoting no deposit,
-- which is what an owner setting the figure to zero would produce.
--
-- **Two rows for one transfer, and they stay two.** The customer sends BND 700
-- in one go and the queue shows BND 100 against the deposit and BND 600
-- against the stay, because they are different kinds of money with different
-- lives: prd.md §11 makes the deposit a liability the property owes back and
-- the stay revenue it has earned. Merging them into one row would be the one
-- place in the product those two could be confused, which is the failure §9.1
-- spends a paragraph refusing.
--
-- Paying up front is **not** [N16](open-questions.md). The stated policy is
-- that a stay is paid in full; this is that happening earlier, where a part
-- payment would be the stay paid in halves.
--
-- The status move is the state machine's, decided in TypeScript by
-- `transition()` and passed in (architecture.md §5.3). The update is guarded
-- on the status the caller read, so a customer double-clicking the button, or
-- a staff member cancelling the booking in the same second, loses the race
-- rather than raising a second row against the same money.
-- ═══════════════════════════════════════════════════════════════════════════

create function submit_public_payment(
  p_property_id uuid,
  p_access_token text,
  p_from_status text,
  p_to_status text,
  -- The customer chose to settle the stay now as well as securing it.
  -- Ignored where there is no deposit, since the stay is the only thing there
  -- is to pay for and it is already being raised.
  p_pay_stay_now boolean default false
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_deposit_id uuid;
  v_payment_id uuid;
  v_updated integer;
  v_raised text;
  v_amount integer := 0;
  v_secured_by_deposit boolean := false;
begin
  select * into v_booking
  from booking
  where property_id = p_property_id and access_token = p_access_token
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_booking.status <> p_from_status then
    return jsonb_build_object('ok', false, 'error', 'status_changed', 'status', v_booking.status);
  end if;

  update booking
  set status = p_to_status
  where id = v_booking.id
    and property_id = p_property_id
    and status = p_from_status;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Unreachable: the row is locked above. Raised rather than returned
    -- precisely because reaching it would mean the lock did not hold — the
    -- position verify_payment() takes on the same statement.
    raise exception 'submit_public_payment lost the booking it had locked (%)', v_booking.id;
  end if;

  if v_booking.stream = 'short_stay' and v_booking.security_deposit_cents > 0 then
    v_secured_by_deposit := true;
    -- A promise, not a liability. `collected_at` stays null until somebody
    -- reads the bank, which is what keeps this out of the ledger's "held".
    insert into deposit (
      property_id, booking_id, amount_cents, method, promised_at, collected_at, collected_by
    )
    values (
      p_property_id, v_booking.id, v_booking.security_deposit_cents,
      'bank_transfer', now(), null, null
    )
    returning id into v_deposit_id;

    v_raised := 'deposit';
    v_amount := v_booking.security_deposit_cents;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, null, 'deposit.promised', 'deposit', v_deposit_id,
      null,
      jsonb_build_object(
        'booking_id', v_booking.id,
        'booking_reference', v_booking.reference,
        'amount_cents', v_booking.security_deposit_cents,
        'method', 'bank_transfer'
      )
    );
  end if;

  -- The stay itself, where there is no deposit securing it or where the
  -- customer chose to settle it now. No amount on either:
  -- `payment_verified_is_observed` keeps `amount_cents` null until a person
  -- has seen the money, which is the rule record_transfer_payment() runs on.
  if not v_secured_by_deposit or p_pay_stay_now then
    insert into payment (
      property_id, booking_id, method, status,
      expected_amount_cents, amount_cents, match_kind, created_by
    )
    values (
      p_property_id, v_booking.id, 'bank_transfer', 'pending_verification',
      v_booking.total_cents, null, null, null
    )
    returning id into v_payment_id;

    v_raised := case when v_secured_by_deposit then 'deposit_and_payment' else 'payment' end;
    v_amount := v_amount + v_booking.total_cents;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, null, 'payment.recorded', 'payment', v_payment_id,
      null,
      jsonb_build_object(
        'booking_id', v_booking.id,
        'reference', v_booking.reference,
        'method', 'bank_transfer',
        'expected_amount_cents', v_booking.total_cents,
        'amount_cents', null
      )
    );
  end if;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, null, 'booking.submit_payment', 'booking', v_booking.id,
    jsonb_build_object('status', p_from_status),
    jsonb_build_object('status', p_to_status, 'raised', v_raised, 'amount_cents', v_amount)
  );

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking.id,
    'reference', v_booking.reference,
    'raised', v_raised,
    'amount_cents', v_amount
  );

exception
  -- One deposit per booking, one pending transfer per booking. Both are the
  -- same customer pressing the same button twice, and both mean the work is
  -- already done.
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_submitted');
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. verify_deposit — somebody reads the bank (capability B4, for a deposit).
--
-- `verify_payment()`'s shape, deliberately not its code. The two are not one
-- function with a flag, because what they check differs at the only point
-- that matters: a payment is matched against what the booking still OWES —
-- total less everything already verified (§10.7) — and a deposit is matched
-- against what the booking QUOTED, a figure no other payment moves. Threading
-- both rules through one body would put a branch inside the arithmetic that
-- prd.md §10.4 exists to protect.
--
-- **Lock order is booking, then deposit**, which is the order
-- `check_in_booking()` takes them in and says so in as many words. The deposit
-- is read once unlocked to find its booking; nothing is decided on that read.
--
-- The mismatch rule is §10.4's, applied to the deposit: a figure that
-- disagrees with the quote can only be accepted with a written reason, and an
-- overpayment is refused as firmly as a short payment because a refund is
-- still N5.
-- ═══════════════════════════════════════════════════════════════════════════

create function verify_deposit(
  p_property_id uuid,
  p_deposit_id uuid,
  p_from_status text,
  p_to_status text,
  p_observed_amount_cents integer,
  p_observed_reference text default null,
  p_observed_sender text default null,
  p_observed_on date default null,
  p_amount_override_reason text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking_id uuid;
  v_booking booking%rowtype;
  v_deposit deposit%rowtype;
  v_due integer;
  v_updated integer;
  v_override_reason text := nullif(btrim(coalesce(p_amount_override_reason, '')), '');
begin
  if p_observed_amount_cents is null or p_observed_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  select booking_id into v_booking_id
  from deposit
  where id = p_deposit_id and property_id = p_property_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_booking
  from booking
  where id = v_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  select * into v_deposit
  from deposit
  where id = p_deposit_id and property_id = p_property_id
  for update;

  if v_deposit.collected_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_collected');
  end if;

  if p_to_status is not null and v_booking.status <> p_from_status then
    return jsonb_build_object('ok', false, 'error', 'status_changed', 'status', v_booking.status);
  end if;

  -- What the booking quotes, read under the lock rather than trusted from when
  -- the promise was raised — verify_payment()'s reasoning exactly: an
  -- amendment can reprice a booking between the two moments, and matching
  -- against a stale figure is the amount rule defeated by the amend path.
  v_due := v_booking.security_deposit_cents;

  if p_observed_amount_cents <> v_due and v_override_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'due_cents', v_due);
  end if;

  update deposit
  set
    amount_cents = p_observed_amount_cents,
    collected_at = now(),
    collected_by = p_actor_id,
    observed_reference = p_observed_reference,
    observed_sender = p_observed_sender,
    observed_on = p_observed_on,
    amount_override_reason = v_override_reason
  where id = p_deposit_id and property_id = p_property_id;

  if p_to_status is not null then
    update booking
    set status = p_to_status
    where id = v_booking.id
      and property_id = p_property_id
      and status = p_from_status;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      raise exception 'verify_deposit lost the booking it had locked (%)', v_booking.id;
    end if;
  end if;

  -- The same verb check-in writes, because it is the same fact: this deposit
  -- is now held. `via` says where it came from, which is what tells a reader
  -- why there was nothing to collect at the door.
  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'deposit.collected', 'deposit', p_deposit_id,
    jsonb_build_object('promised_at', v_deposit.promised_at, 'amount_cents', v_deposit.amount_cents),
    jsonb_build_object(
      'booking_id', v_booking.id,
      'booking_reference', v_booking.reference,
      'amount_cents', p_observed_amount_cents,
      'method', v_deposit.method,
      'via', 'transfer_at_booking'
    )
  );

  -- A separate verb for an accepted mismatch, beside the collection rather
  -- than inside it — the shape verify_payment() uses, so "every deposit taken
  -- at something other than the quoted figure" stays a lookup on `action`.
  if p_observed_amount_cents <> v_due then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'deposit.amount_overridden', 'deposit', p_deposit_id,
      jsonb_build_object('quoted_cents', v_due),
      jsonb_build_object(
        'booking_reference', v_booking.reference,
        'amount_cents', p_observed_amount_cents,
        'reason', v_override_reason
      )
    );
  end if;

  if p_to_status is not null then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'booking.verify_payment', 'booking', v_booking.id,
      jsonb_build_object('status', p_from_status),
      jsonb_build_object('status', p_to_status, 'secured_by', 'security_deposit')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'deposit_id', p_deposit_id,
    'booking_id', v_booking.id,
    'amount_cents', p_observed_amount_cents
  );
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. check_in_booking recognises a deposit that is already there.
--
-- prd.md §11: "Check-in recognises a deposit already held and takes nothing.
-- It is not a new state: the check-in screen already says so for a booking
-- quoting no deposit (B15's waiver), and this is the same sentence with a
-- different reason behind it."
--
-- Three cases now, and the middle one is the judgement worth recording.
--
--   collected  — take nothing, say so. The money is in the safe.
--   promised   — COLLECT IT NOW, on the existing row.
--   none       — take it, exactly as before.
--
-- The middle case could have been a refusal, and refusing is wrong: the guest
-- is at the door, and a promised transfer that never arrived is precisely the
-- case where the desk needs to take BND 100 in cash. Refusing would send a
-- paying guest away to fix a row. Nor is it a second deposit row — one per
-- booking is the constraint that makes "what do we hold" answerable — so the
-- promise is *fulfilled* rather than replaced, keeping `promised_at` as the
-- record that the customer said they had sent it. The amount is re-read from
-- the booking under the lock, because an amendment can reprice a quote
-- between the promise and the arrival.
--
-- Everything else about this function is unchanged from 20260906000100.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function check_in_booking(
  p_property_id uuid,
  p_booking_id uuid,
  p_from_status text,
  p_to_status text,
  p_method text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_deposit deposit%rowtype;
  v_deposit_id uuid;
  v_already_held boolean := false;
  v_updated integer;
begin
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

  if p_method is null or p_method not in ('bank_transfer', 'cash') then
    return jsonb_build_object('ok', false, 'error', 'invalid_method');
  end if;

  select * into v_deposit
  from deposit
  where booking_id = p_booking_id and property_id = p_property_id
  for update;

  update booking
  set status = p_to_status
  where id = p_booking_id
    and property_id = p_property_id
    and status = p_from_status;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'status_changed', 'status', v_booking.status);
  end if;

  if v_deposit.id is not null and v_deposit.collected_at is not null then
    -- Already in the safe, taken when the transfer was verified. Nothing to
    -- collect and nothing to record beyond the check-in itself.
    v_deposit_id := v_deposit.id;
    v_already_held := true;

  elsif v_deposit.id is not null then
    -- Promised online and never seen. The guest is here, so it is taken now,
    -- on the row that already exists.
    update deposit
    set
      amount_cents = v_booking.security_deposit_cents,
      method = p_method,
      collected_at = now(),
      collected_by = p_actor_id
    where id = v_deposit.id and property_id = p_property_id;

    v_deposit_id := v_deposit.id;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'deposit.collected', 'deposit', v_deposit.id,
      jsonb_build_object('promised_at', v_deposit.promised_at, 'amount_cents', v_deposit.amount_cents),
      jsonb_build_object(
        'booking_id', p_booking_id,
        'booking_reference', v_booking.reference,
        'amount_cents', v_booking.security_deposit_cents,
        'method', p_method,
        'via', 'at_check_in_after_promise'
      )
    );

  elsif v_booking.security_deposit_cents > 0 then
    insert into deposit (
      property_id, booking_id, amount_cents, method, collected_by, collected_at
    )
    values (
      p_property_id, p_booking_id, v_booking.security_deposit_cents, p_method, p_actor_id, now()
    )
    returning id into v_deposit_id;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'deposit.collected', 'deposit', v_deposit_id,
      null,
      jsonb_build_object(
        'booking_id', p_booking_id,
        'booking_reference', v_booking.reference,
        'amount_cents', v_booking.security_deposit_cents,
        'method', p_method,
        'via', 'at_check_in'
      )
    );
  end if;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'booking.check_in', 'booking', p_booking_id,
    jsonb_build_object('status', p_from_status),
    case
      when v_deposit_id is null then jsonb_build_object('status', p_to_status)
      when v_already_held then jsonb_build_object(
        'status', p_to_status, 'deposit_id', v_deposit_id, 'deposit', 'already_held'
      )
      else jsonb_build_object('status', p_to_status, 'deposit_id', v_deposit_id)
    end
  );

  return jsonb_build_object(
    'ok', true,
    'status', p_to_status,
    'deposit_id', v_deposit_id,
    'already_held', v_already_held,
    'amount_cents', case
      when v_deposit_id is null then 0
      else v_booking.security_deposit_cents
    end
  );
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4a. A charge cannot be raised against money nobody has.
--
-- `canAddCharge()` in lib/domain/deposit.ts already refuses one, so no screen
-- offers the control — but prd.md §11's whole posture is that the screen
-- refuses first with a sentence and the database refuses last, from any
-- caller. The release path has `deposit_release_needs_collection` doing that
-- job; charges had nothing, and an integration test walked straight past the
-- domain rule to prove it.
--
-- A charge against a promised deposit is not a near-miss, either: the booking
-- is still awaiting verification, so the guest has not arrived, and there is
-- nothing in the property for them to have damaged.
--
-- Everything else about this function is unchanged from 20260906000100.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function add_deposit_charge(
  p_property_id uuid,
  p_deposit_id uuid,
  p_amount_cents integer,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_deposit deposit%rowtype;
  v_booking booking%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_charge_id uuid;
begin
  select * into v_deposit
  from deposit
  where id = p_deposit_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_deposit.released_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_released');
  end if;

  -- The new one.
  if v_deposit.collected_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_collected');
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if v_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  insert into deposit_charge (property_id, deposit_id, amount_cents, reason, created_by)
  values (p_property_id, p_deposit_id, p_amount_cents, v_reason, p_actor_id)
  returning id into v_charge_id;

  select * into v_booking
  from booking
  where id = v_deposit.booking_id and property_id = p_property_id;

  -- `reason` under that key deliberately: EventHistory quotes after.reason, so
  -- the trail carries what the charge was for without a per-verb reader.
  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'charge.created', 'deposit_charge', v_charge_id,
    null,
    jsonb_build_object(
      'deposit_id', p_deposit_id,
      'booking_id', v_deposit.booking_id,
      'booking_reference', v_booking.reference,
      'amount_cents', p_amount_cents,
      'reason', v_reason
    )
  );

  return jsonb_build_object('ok', true, 'charge_id', v_charge_id);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. deposit_summary carries the promise.
--
-- Appended, for the reason every other view change here is.
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
  d.amount_override_reason
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Grants.
-- ═══════════════════════════════════════════════════════════════════════════

grant update on deposit to service_role;

revoke execute on function submit_public_payment(uuid, text, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function verify_deposit(
  uuid, uuid, text, text, integer, text, text, date, text, uuid
) from public, anon, authenticated;

grant execute on function submit_public_payment(uuid, text, text, text, boolean) to service_role;
grant execute on function verify_deposit(
  uuid, uuid, text, text, integer, text, text, date, text, uuid
) to service_role;
