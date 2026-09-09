-- ═══════════════════════════════════════════════════════════════════════════
-- The security deposit, taken at the desk (capability B16, staff half;
-- prd.md §9.1, §11; open-questions.md N29).
--
-- 20260913000200 built the customer's half of this: a guest booking online
-- presses a button and a *promised* deposit appears in the verification queue.
-- Its own as-built note in prd.md §11 says what it left undone in as many
-- words — "the desk still cannot take a deposit-secured advance booking at
-- the counter" — and this is that.
--
-- The gap was not cosmetic. Between the two halves there was no way to record
-- a deposit against a booking before check-in, so a customer who transferred
-- the BND 100 and never pressed the button left the desk with nothing correct
-- to do: `record_transfer_payment()` raises a *payment* for the outstanding
-- stay, which is the wrong figure and the wrong kind of money, and cash would
-- put a deposit into the daily cash-up that §14 keeps out of it. The clerk's
-- only honest option was to ring the customer and ask them to click something.
--
-- ── What this adds ────────────────────────────────────────────────────────
--
-- One writer, `record_booking_deposit()`, and it is deliberately the mirror of
-- the two payment paths rather than a new idea:
--
--   - **Cash is money now.** Counted in front of somebody, so the row is
--     written collected, and the booking is secured on the spot. That is the
--     `deposit_pending_is_a_transfer` constraint's rule, obeyed rather than
--     restated: there is no such thing as "cash promised".
--   - **A transfer is a promise.** Written with `promised_at` and no
--     `collected_at`, exactly as the customer's own button writes it, so it
--     lands in the same queue and is settled by the same `verify_deposit()`.
--     Nothing here is a second way to verify money.
--
-- **It does not choose the amount.** The figure is the booking's quoted
-- `security_deposit_cents`, read under the lock — the same rule
-- `check_in_booking()` follows, and for the same reason prd.md §11 gives: what
-- is held must not move when an amendment reprices the stay. A caller that
-- could name a figure would be a caller that could take BND 10 against a
-- booking quoting BND 100.
--
-- **The status move is the state machine's**, decided in TypeScript by
-- `transition()` and passed in (architecture.md §5.3). Two events reach this
-- function: `secure_with_deposit` for cash, which confirms the booking because
-- the money is in the drawer, and `submit_payment` for a transfer, which sends
-- it to the queue. Both are guarded on the status the caller read, so a clerk
-- and a customer acting in the same second produce one row and one refusal.
--
-- **It writes no payment row and schedules no accounting pack.** A deposit
-- settles nothing: the stay is still owed in full on arrival, which is the
-- distinction §9.1 spends a paragraph on and the reason a deposit has never
-- been a `payment`.
-- ═══════════════════════════════════════════════════════════════════════════

create function record_booking_deposit(
  p_property_id uuid,
  p_booking_id uuid,
  p_method text,
  -- The status pair, or nulls where the booking does not move. A deposit taken
  -- against an already-confirmed booking is the ordinary catch-up case — the
  -- desk settling a customer who transferred and never said so — and writing
  -- `confirmed → confirmed` would put a second confirmation in a history for a
  -- booking that never moved. `verify_payment()` takes the same position.
  p_from_status text,
  p_to_status text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_deposit_id uuid;
  v_existing integer;
begin
  if p_method not in ('cash', 'bank_transfer') then
    raise exception 'unknown deposit method: %', p_method;
  end if;

  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  -- Nothing to take. A booking quoting zero is either a waiver (capability
  -- B15) or a stream that has never carried a deposit, and writing a row for
  -- nothing would put a liability on the ledger against a decision somebody
  -- made not to have one. The `amount_cents > 0` check would refuse it
  -- anyway; this is the sentence rather than the constraint violation.
  if coalesce(v_booking.security_deposit_cents, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_deposit_quoted');
  end if;

  -- One deposit per booking. The unique constraint makes it impossible; this
  -- makes it a sentence a clerk can act on, which is the arrangement
  -- `check_in_booking()` and `record_transfer_payment()` both use.
  select count(*) into v_existing
  from deposit d
  where d.booking_id = p_booking_id and d.property_id = p_property_id;

  if v_existing > 0 then
    return jsonb_build_object('ok', false, 'error', 'already_recorded');
  end if;

  if p_from_status is not null and v_booking.status <> p_from_status then
    return jsonb_build_object('ok', false, 'error', 'status_changed', 'status', v_booking.status);
  end if;

  if p_method = 'cash' then
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
        -- The three `via`s now in the trail — `at_check_in`,
        -- `at_check_in_after_promise` and this — are how a reader tells where
        -- in the guest's journey the money actually arrived.
        'via', 'at_booking'
      )
    );
  else
    -- A promise, not a liability. `collected_at` stays null until somebody
    -- reads the bank, which is what keeps this out of the ledger's "held" and
    -- out of the cash-up. Identical in shape to what the customer's own button
    -- writes, so the queue cannot tell the two apart and does not need to.
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
      -- Unreachable: the row is locked above and the status was compared
      -- against it. Raised rather than returned for the reason
      -- `submit_public_payment()` gives — reaching it would mean the lock did
      -- not hold, which is a fault rather than a refusal.
      raise exception 'record_booking_deposit lost the booking it had locked (%)', p_booking_id;
    end if;

    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id,
      p_actor_id,
      case when p_method = 'cash' then 'booking.secure_with_deposit' else 'booking.submit_payment' end,
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
    'method', p_method,
    'status', coalesce(p_to_status, v_booking.status)
  );

exception
  -- One deposit per booking, enforced by the unique constraint. The count
  -- above is the ordinary guard; this is two clerks pressing at once, and it
  -- means the same thing — the work is already done.
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_recorded');
end;
$function$;

comment on function record_booking_deposit(uuid, uuid, text, text, text, uuid) is
  'Records the security deposit against a booking before check-in (prd.md §11, capability B16). Cash is written collected and secures the booking; a transfer is written promised and joins the verification queue. The amount is always the booking''s quoted figure.';

revoke execute on function record_booking_deposit(uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated;

grant execute on function record_booking_deposit(uuid, uuid, text, text, text, uuid)
  to service_role;
