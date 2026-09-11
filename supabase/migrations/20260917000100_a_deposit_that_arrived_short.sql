-- ═══════════════════════════════════════════════════════════════════════════
-- A deposit that arrived short (capability B16; prd.md §9.1, §11, §12).
--
-- `verify_deposit()` (20260913000200) accepts a figure other than the quoted
-- one with a written reason, and **overwrites** `amount_cents` with it. That
-- was right for the case it was built for — a bank fee shaving BND 10 off a
-- transfer, settled in cash at the desk — and wrong for the one nobody had
-- looked at: a guest who sends BND 50 of the BND 100 now and the rest on
-- Friday.
--
-- Confirming that BND 50 recorded 50 as held, **confirmed the booking**, and
-- shut every door behind it. `verify_deposit()` refuses a second pass with
-- `already_collected`; `record_booking_deposit()` refuses with
-- `already_recorded`; `check_in_booking()` saw a collected deposit and took
-- nothing. The shortfall survived only as a `deposit.amount_overridden` event
-- nobody reads at the door. The guest checked in against half a deposit and
-- the release handed back the 50.
--
-- ── The rule this adds ────────────────────────────────────────────────────
--
-- **A deposit that is short of the quote secures nothing.** prd.md §11 already
-- says `booking.security_deposit_cents` is the quote and the deposit row is
-- what was taken, and that the two can differ. What was missing is that the
-- product never acted on the difference. It does now, in the one place the
-- question is asked: `booking_deposit_is_secured()` compares the two.
--
-- Because `verify_payment()`, `record_cash_payment()` and `check_in_booking()`
-- all already ask that function, the rule reaches every path without any of
-- them changing — the position §11 takes about the rule not being got round by
-- a screen. A booking whose deposit came up short stays where it was, no
-- confirmation is sent, and the unit stays held: N7 makes a hold indefinite,
-- so nothing expires while the desk chases the rest.
--
-- **The desk tops it up**, on the row that already exists. One deposit per
-- booking is the unique constraint that makes "what do we hold" answerable,
-- and a top-up adds to the figure rather than raising a second row. It is
-- money already seen — cash counted, or a transfer the clerk has just checked
-- in the bank app — so it never enters the verification queue: a queue row is
-- a promise, and this row stopped being a promise the moment it was collected.
--
-- **This is not part payments** ([N16](open-questions.md), scope X11). Nothing
-- here offers a guest the choice of paying half. It is the product coping with
-- money that arrived wrong, which is a different thing from a policy it
-- declines to offer — and the deposit, not the stay, is what it is about.
--
-- ── What it costs, stated rather than discovered ──────────────────────────
--
-- `verify_deposit()` is amended too, and it is the reason this migration is
-- not one line. It is the function that creates every short deposit and the
-- one that does not ask `booking_deposit_is_secured()` — it applies the status
-- pair it was handed. Tightening the rule without touching it would confirm a
-- booking on a short deposit, email the guest, and then refuse them at the
-- door: strictly worse than the gap being closed.
--
-- `check_in_booking()`'s `promised` flag is corrected in passing, for the same
-- family of reason. It read `v_deposit.id is not null`, which was true only
-- while a deposit row could not exist collected and still fail the gate. It
-- can now, and a short deposit told to "confirm the transfer in the queue"
-- would send a clerk looking for a promise nobody made.
--
-- An amendment that reprices a booking's deposit upward now makes a deposit
-- that was whole read as short, and check-in refuses it until the difference
-- is collected. That is the honest reading of `quoted − held` and it is the
-- one this takes: the alternative needs a second "collected against" column
-- and two meanings of short on screen, for a case where the money genuinely is
-- not all there.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The rule: in hand means all of it ──────────────────────────────────
--
-- The signature is 20260915000100's and the only change is the last line of
-- the predicate. `p_quoted_cents` was already passed by every caller and used
-- for nothing but the "quotes nothing" case; it now does the work its name
-- always implied.

create or replace function booking_deposit_is_secured(
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
        -- Short of the quote is not in hand. A deposit taken at BND 50 against
        -- a BND 100 booking holds half of what secures it, and half of what
        -- secures a booking secures no booking.
        and d.amount_cents >= p_quoted_cents
    );
$function$;

comment on function booking_deposit_is_secured(uuid, uuid, integer) is
  'True when the booking quotes no security deposit, or one has been collected against it for at least the quoted figure. A promised transfer does not count, and neither does a deposit that arrived short (prd.md §9.1, §11).';

-- ── 2. check_in_booking() names the short case ────────────────────────────
--
-- Body only; the signature is 20260915000100's. Two changes.
--
-- The gate now *calls* `booking_deposit_is_secured()` rather than restating
-- its predicate inline. That inline copy was correct when there was one way to
-- fail it; with a second it is a copy of the rule that can drift from the
-- rule, and this function is the one place the difference would be invisible
-- until a guest was standing at the desk.
--
-- The refusal payload gains `short` and `held_cents`, because the screen now
-- has three sentences to choose between rather than two. `promised` tightens
-- to "a row exists and nothing has been collected on it" — it read
-- `v_deposit.id is not null`, which was only ever right because the gate could
-- not fire on a collected row.

create or replace function check_in_booking(
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

  -- The refusal. `promised` and `short` tell the screen which of the three
  -- sentences to say: confirm the transfer in the queue or take it in cash;
  -- top up what came in short; or record a deposit nobody has taken.
  if not booking_deposit_is_secured(
       p_property_id, p_booking_id, v_booking.security_deposit_cents
     ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'deposit_not_secured',
      'promised', v_deposit.id is not null and v_deposit.collected_at is null,
      'short', v_deposit.id is not null and v_deposit.collected_at is not null,
      'amount_cents', v_booking.security_deposit_cents,
      'held_cents', coalesce(v_deposit.amount_cents, 0)
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
    'amount_cents', coalesce(v_deposit.amount_cents, 0)
  );
end;
$function$;

comment on function check_in_booking(uuid, uuid, text, text, uuid) is
  'Moves a confirmed booking to checked_in. Collects nothing: a booking quoting a security deposit that is not collected in full is refused, with `promised` and `short` saying which way it failed (prd.md §11, §12).';

-- ── 3. top_up_booking_deposit() — the rest of it, at the desk ─────────────
--
-- `record_booking_deposit()`'s shape, and the differences are the point.
--
-- **It takes an amount**, where recording a deposit never does. A deposit is
-- the booking's quoted figure and there is nothing to type; what is missing
-- off a short one is whatever the guest has just handed over, and only the
-- person holding it knows.
--
-- **It refuses to overshoot.** A top-up exists to make a deposit whole, so
-- more than the shortfall is not a top-up — and clamping silently would be the
-- function deciding what the clerk meant. The screen states the figure and the
-- refusal names it.
--
-- **It moves the booking only when the deposit comes whole.** The status pair
-- is derived in TypeScript like every other transition (architecture.md §5.3),
-- but it is applied here only if the arithmetic under the row lock agrees that
-- nothing is left owing. A caller that passed a pair for a part of a shortfall
-- gets the money recorded and the booking left where it was, rather than a
-- booking confirmed on a deposit that is still short.
--
-- **`method` and `collected_at` are left alone.** They say how and when the
-- deposit was *first* seen; rewriting them would erase that a transfer ever
-- happened and put the desk's name on a customer's promise. The top-up's own
-- method and time live on its audit event, which is where the deposit's
-- history reads them from.

create function top_up_booking_deposit(
  p_property_id uuid,
  p_booking_id uuid,
  p_amount_cents integer,
  p_method text,
  p_from_status text default null,
  p_to_status text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_deposit deposit%rowtype;
  v_quoted integer;
  v_shortfall integer;
  v_total integer;
  v_completes boolean := false;
  v_confirmed boolean := false;
  v_updated integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if p_method is null or p_method not in ('cash', 'bank_transfer') then
    return jsonb_build_object('ok', false, 'error', 'invalid_method');
  end if;

  -- Booking then deposit, the order every function touching both takes.
  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  select * into v_deposit
  from deposit
  where booking_id = p_booking_id and property_id = p_property_id
  for update;

  -- Nothing to add to. Recording the deposit is the other function, and the
  -- screen offers that one instead.
  if v_deposit.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_recorded');
  end if;

  -- A promise is not short, it is unchecked. Adding to it would put money on
  -- the ledger the property has not seen, which is the one thing
  -- `collected_at` exists to prevent.
  if v_deposit.collected_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_collected');
  end if;

  -- `deposit_release_arithmetic` binds `released_amount_cents` and
  -- `owed_cents` to `amount_cents` on a released row, so moving the figure
  -- afterwards would either violate the constraint or rewrite a signed
  -- approval. Neither is a thing a top-up may do.
  if v_deposit.released_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_released');
  end if;

  v_quoted := coalesce(v_booking.security_deposit_cents, 0);
  v_shortfall := v_quoted - v_deposit.amount_cents;

  if v_shortfall <= 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_short');
  end if;

  if p_amount_cents > v_shortfall then
    return jsonb_build_object(
      'ok', false, 'error', 'exceeds_shortfall', 'shortfall_cents', v_shortfall
    );
  end if;

  v_total := v_deposit.amount_cents + p_amount_cents;
  v_completes := v_total >= v_quoted;

  -- Only asked when the booking is going to move. A top-up that leaves the
  -- deposit short changes nothing about the booking, so its status is not this
  -- function's business.
  if p_to_status is not null and v_completes and v_booking.status <> p_from_status then
    return jsonb_build_object('ok', false, 'error', 'status_changed', 'status', v_booking.status);
  end if;

  update deposit
  set amount_cents = v_total
  where id = v_deposit.id and property_id = p_property_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'deposit.topped_up', 'deposit', v_deposit.id,
    jsonb_build_object('amount_cents', v_deposit.amount_cents, 'quoted_cents', v_quoted),
    jsonb_build_object(
      'booking_id', p_booking_id,
      'booking_reference', v_booking.reference,
      'amount_cents', v_total,
      'added_cents', p_amount_cents,
      'quoted_cents', v_quoted,
      'method', p_method,
      'complete', v_completes
    )
  );

  if p_to_status is not null and v_completes then
    update booking
    set status = p_to_status
    where id = p_booking_id
      and property_id = p_property_id
      and status = p_from_status;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      -- Unreachable: the row is locked above. Raised rather than returned
      -- precisely because reaching it would mean the lock did not hold — the
      -- position every other function here takes on the same statement.
      raise exception 'top_up_booking_deposit lost the booking it had locked (%)', p_booking_id;
    end if;

    v_confirmed := true;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'booking.secure_with_deposit', 'booking', p_booking_id,
      jsonb_build_object('status', p_from_status),
      jsonb_build_object(
        'status', p_to_status,
        'secured_by', 'security_deposit',
        'amount_cents', v_total
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'deposit_id', v_deposit.id,
    'booking_id', p_booking_id,
    'reference', v_booking.reference,
    'amount_cents', v_total,
    'added_cents', p_amount_cents,
    'shortfall_cents', greatest(v_quoted - v_total, 0),
    'complete', v_completes,
    'confirmed_now', v_confirmed,
    'status', case when v_confirmed then p_to_status else v_booking.status end
  );
end;
$function$;

comment on function top_up_booking_deposit(uuid, uuid, integer, text, text, text, uuid) is
  'Adds money already seen to a collected deposit that came up short of the booking''s quote (prd.md §11). Refuses to overshoot the shortfall, and moves the booking only when the deposit comes whole.';

revoke execute on function top_up_booking_deposit(uuid, uuid, integer, text, text, text, uuid)
  from public, anon, authenticated;

grant execute on function top_up_booking_deposit(uuid, uuid, integer, text, text, text, uuid)
  to service_role;

-- ── 4. verify_deposit() stops confirming what it did not secure ───────────
--
-- The function that *creates* every short deposit, and the one place the new
-- rule could not reach on its own: `verify_deposit()` does not ask
-- `booking_deposit_is_secured()`. It applies the status pair TypeScript handed
-- it, unconditionally. Left alone, confirming BND 50 against a BND 100 quote
-- would still move the booking to `confirmed` and still send the guest the
-- email — and the guest would then be turned away at the door by section 2.
-- That is worse than the gap this migration exists to close, not better.
--
-- Body only; the signature is 20260913000200's. One variable decides it.
--
-- **The deposit is still recorded at whatever arrived.** Refusing the money
-- would leave a clerk with a line in the bank statement and nowhere to put it,
-- which is how a deposit ends up in WhatsApp. What stops is the *inference*
-- that collecting it secured the booking.

create or replace function verify_deposit(
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
  -- Whether this verification is what secures the booking. A caller can only
  -- ever offer the pair; this decides whether it is taken, under the row lock
  -- and against the figure the booking quotes now.
  v_moves boolean := false;
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
  -- the promise was raised — an amendment can reprice a booking between the
  -- two moments, and matching against a stale figure is the amount rule
  -- defeated by the amend path.
  v_due := v_booking.security_deposit_cents;

  if p_observed_amount_cents <> v_due and v_override_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'due_cents', v_due);
  end if;

  -- Over the quote secures it; under does not. `>=` rather than `=` because an
  -- accepted overpayment is already reachable through the override above.
  v_moves := p_to_status is not null and p_observed_amount_cents >= v_due;

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

  if v_moves then
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

  if v_moves then
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
    'amount_cents', p_observed_amount_cents,
    'quoted_cents', v_due,
    'shortfall_cents', greatest(v_due - p_observed_amount_cents, 0),
    -- Whether the booking moved. The caller sends the confirmation email on
    -- this and nothing else, so a short verification sends none.
    'moved', v_moves,
    'status', case when v_moves then p_to_status else v_booking.status end
  );
end;
$function$;

comment on function verify_deposit(uuid, uuid, text, text, integer, text, text, date, text, uuid) is
  'Records that a promised security deposit arrived, at whatever figure was seen. Moves the booking to confirmed only when that figure covers the quote in full (prd.md §11) — a short deposit is collected and secures nothing.';

-- ── 5. deposit_summary carries the quote ──────────────────────────────────
--
-- The shortfall is derived, never stored — the position §11 takes on the
-- stages, and for the same reason: an amendment can reprice the quote, and a
-- stored difference would be right only until it did. Deriving it needs both
-- figures in one row, and the view already joins the booking, so this is one
-- column rather than a second query on every screen that shows a deposit.
--
-- Appended last: `create or replace view` permits adding columns only at the
-- end.

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
  b.security_deposit_cents as quoted_cents
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
