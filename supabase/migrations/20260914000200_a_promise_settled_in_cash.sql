-- ═══════════════════════════════════════════════════════════════════════════
-- A promised deposit settled in cash before the guest arrives (capability B16;
-- prd.md §9.1, §11).
--
-- 20260914000100 gave the desk a way to take a deposit and refused outright
-- when a row already existed. That refusal is right for a deposit already in
-- the safe and wrong for one that is still only a promise, and the sequence it
-- strands is ordinary rather than exotic: a customer books online, presses "I
-- have made the transfer", the transfer fails or they change their mind, and
-- they walk in with BND 100 in cash.
--
-- Before this, that clerk had two dishonest options and no honest one.
-- `verify_deposit()` would record that a bank transfer had been seen, which is
-- a false entry in the ledger about money that arrived a different way; a cash
-- *payment* would book the BND 100 as revenue against the stay, which §9.1
-- spends a paragraph forbidding. Refusing was itself the failure the whole
-- capability exists to remove — a row in the queue nobody can clear.
--
-- ── The judgement is already recorded ─────────────────────────────────────
--
-- prd.md §11 answers this exact question one step later, at the door: *a
-- deposit still only promised is collected at the door rather than refused —
-- the guest is standing there, an abandoned transfer is exactly when the desk
-- needs the BND 100 in cash, and refusing would send a paying customer away to
-- fix a row.* Nothing about that reasoning depends on the guest being there to
-- check in, so this applies it wherever they are standing. It is the same
-- fulfilment `check_in_booking()` performs, on the same row, with the method
-- corrected to what actually changed hands and `promised_at` surviving as the
-- record that the customer said they had sent it.
--
-- **Only cash fulfils a promise.** Replacing one awaited transfer with another
-- says nothing new and clears nothing, so a transfer against an existing
-- promise is still refused.
--
-- **The booking moves by `verify_payment`**, which is the edge
-- `verify_deposit()` already uses out of `awaiting_payment_verification`. The
-- promise is being settled rather than the booking being secured afresh, so
-- reusing `secure_with_deposit` here would mint a second edge into `confirmed`
-- for one kind of money — the thing 20260914000100 was careful not to do.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function record_booking_deposit(
  p_property_id uuid,
  p_booking_id uuid,
  p_method text,
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
  v_deposit_id uuid;
  v_fulfilled boolean := false;
begin
  if p_method not in ('cash', 'bank_transfer') then
    raise exception 'unknown deposit method: %', p_method;
  end if;

  -- Booking then deposit, the order `check_in_booking()` takes them in and
  -- says so. Two writers taking them in opposite orders is the deadlock this
  -- avoids by convention rather than by luck.
  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if coalesce(v_booking.security_deposit_cents, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_deposit_quoted');
  end if;

  select * into v_deposit
  from deposit
  where booking_id = p_booking_id and property_id = p_property_id
  for update;

  -- Already in the safe. Nothing to take and nothing to correct.
  if v_deposit.id is not null and v_deposit.collected_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_recorded');
  end if;

  -- A promise, and a second promise settles nothing.
  if v_deposit.id is not null and p_method <> 'cash' then
    return jsonb_build_object('ok', false, 'error', 'already_promised');
  end if;

  if p_from_status is not null and v_booking.status <> p_from_status then
    return jsonb_build_object('ok', false, 'error', 'status_changed', 'status', v_booking.status);
  end if;

  if v_deposit.id is not null then
    -- Fulfilled on the row that already exists, so one-deposit-per-booking
    -- holds and the customer's own claim is not erased by the desk correcting
    -- how the money actually arrived.
    update deposit
    set
      amount_cents = v_booking.security_deposit_cents,
      method = 'cash',
      collected_at = now(),
      collected_by = p_actor_id
    where id = v_deposit.id and property_id = p_property_id;

    v_deposit_id := v_deposit.id;
    v_fulfilled := true;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'deposit.collected', 'deposit', v_deposit.id,
      jsonb_build_object(
        'promised_at', v_deposit.promised_at,
        'method', v_deposit.method,
        'amount_cents', v_deposit.amount_cents
      ),
      jsonb_build_object(
        'booking_id', p_booking_id,
        'booking_reference', v_booking.reference,
        'amount_cents', v_booking.security_deposit_cents,
        'method', 'cash',
        'via', 'at_desk_after_promise'
      )
    );

  elsif p_method = 'cash' then
    insert into deposit (
      property_id, booking_id, amount_cents, method, collected_by, collected_at
    )
    values (
      p_property_id, p_booking_id, v_booking.security_deposit_cents, 'cash', p_actor_id, now()
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
        'method', 'cash',
        'via', 'at_booking'
      )
    );

  else
    insert into deposit (
      property_id, booking_id, amount_cents, method, promised_at, collected_at, collected_by
    )
    values (
      p_property_id, p_booking_id, v_booking.security_deposit_cents,
      'bank_transfer', now(), null, null
    )
    returning id into v_deposit_id;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'deposit.promised', 'deposit', v_deposit_id,
      null,
      jsonb_build_object(
        'booking_id', p_booking_id,
        'booking_reference', v_booking.reference,
        'amount_cents', v_booking.security_deposit_cents,
        'method', 'bank_transfer',
        'via', 'at_booking'
      )
    );
  end if;

  if p_to_status is not null then
    update booking
    set status = p_to_status
    where id = p_booking_id
      and property_id = p_property_id
      and status = p_from_status;

    if not found then
      raise exception 'record_booking_deposit lost the booking it had locked (%)', p_booking_id;
    end if;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id,
      p_actor_id,
      case
        when v_fulfilled then 'booking.verify_payment'
        when p_method = 'cash' then 'booking.secure_with_deposit'
        else 'booking.submit_payment'
      end,
      'booking',
      p_booking_id,
      jsonb_build_object('status', p_from_status),
      jsonb_build_object(
        'status', p_to_status,
        'raised', 'deposit',
        'amount_cents', v_booking.security_deposit_cents
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'deposit_id', v_deposit_id,
    'booking_id', p_booking_id,
    'reference', v_booking.reference,
    'amount_cents', v_booking.security_deposit_cents,
    'method', case when v_fulfilled then 'cash' else p_method end,
    'fulfilled_promise', v_fulfilled,
    'status', coalesce(p_to_status, v_booking.status)
  );

exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_recorded');
end;
$function$;

comment on function record_booking_deposit(uuid, uuid, text, text, text, uuid) is
  'Records the security deposit against a booking before check-in (prd.md §11, capability B16). Cash is written collected and secures the booking; a transfer is written promised and joins the verification queue; cash against an existing promise fulfils it on the same row, correcting the method and confirming the booking. The amount is always the booking''s quoted figure.';
