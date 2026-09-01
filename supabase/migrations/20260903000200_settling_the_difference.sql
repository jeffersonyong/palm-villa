-- Settling what an amendment leaves outstanding (capabilities B3, B5, B13).
--
-- 20260831000100 opens by saying the payment slice "is NOT a ledger" and that
-- "two payments against one booking are two recorded facts and never an
-- arithmetic". That was true and correct for what existed then. The amendment
-- path (B3) has since made it untenable: a guest who has paid for one night
-- and extends to two leaves the booking worth more than has been paid for it,
-- and until now the product could neither name that figure nor take a second
-- bank transfer to clear it.
--
-- What that forced staff to do is the argument for this file. The only way to
-- record a top-up was the cash form, so a transfer would have been logged as
-- cash — a lie about the method that lands in Finance's daily cash-up (E4) as
-- notes that were never in the drawer. Failing that, the clerk confirmed a
-- short payment through B5's override, which exists so that a short payment is
-- never silently accepted; a flag that fires on the routine case stops being
-- read.
--
-- ── What this is NOT ──────────────────────────────────────────────────────
--
-- It is not part payments. prd.md §9.1 [C] still stands: full payment secures
-- a unit, and nothing here offers a guest the choice of paying half now. The
-- balance being computable does make that mechanically possible, and that is
-- worth knowing rather than hiding — it is now the *product* that declines to
-- offer instalments, not the schema that cannot express one. N16 in the
-- open-questions register is unchanged and still Jason's to answer.
--
-- Five parts, in dependency order.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. booking_summary learns what has been paid against a booking.
--
-- Derived, never stored. A stored `paid_cents` is a second copy of a figure
-- the payment rows already hold, and the two would disagree the first time a
-- payment was written by anything that forgot to maintain it. Outstanding is
-- not a column at all: it is `total_cents - paid_cents`, computed in
-- lib/domain/balance.ts, which is where the one subtraction lives.
--
-- Only `verified` payments count. A pending transfer has been promised, not
-- seen (see the note on payment.amount_cents), and a booking that reports
-- itself paid because somebody said they would send the money is exactly the
-- failure B5 exists to prevent.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view booking_summary
with (security_invoker = true)
as
select
  b.id,
  b.property_id,
  b.reference,
  b.status,
  b.stream,
  g.name as guest_name,
  g.phone as guest_phone,
  b.chargeable_guests,
  b.exempt_guests,
  b.total_cents,
  b.security_deposit_cents,
  b.hold_expires_at,
  b.created_at,
  b.updated_at,
  b.no_vehicle,
  o.unit_id,
  u.ref as unit_ref,
  ut.slug as unit_type_slug,
  o.start_date as check_in,
  o.end_date as check_out,
  coalesce(l.lines, '[]'::jsonb) as lines,
  coalesce(v.vehicles, '[]'::jsonb) as vehicles,
  b.discount_kind,
  b.discount_value,
  b.discount_reason,
  -- Cast because `sum()` is bigint and every other money column here is
  -- integer cents; a view column that changes type is also a view that
  -- `create or replace` refuses to replace next time.
  coalesce(pay.paid_cents, 0)::integer as paid_cents
from booking b
join guest g on g.id = b.guest_id
left join occupancy o on o.booking_id = b.id
left join unit u on u.id = o.unit_id
left join unit_type ut on ut.id = u.unit_type_id
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'type', bl.line_type,
      'description', bl.description,
      'quantity', bl.quantity,
      'unitPrice', bl.unit_price_cents,
      'amount', bl.amount_cents
    )
    order by bl.sort_order
  ) as lines
  from booking_line bl
  where bl.booking_id = b.id
) l on true
left join lateral (
  select jsonb_agg(bv.registration order by bv.sort_order) as vehicles
  from booking_vehicle bv
  where bv.booking_id = b.id
) v on true
left join lateral (
  select sum(p.amount_cents) as paid_cents
  from payment p
  where p.booking_id = b.id and p.status = 'verified'
) pay on true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. payment_summary's "amount expected" becomes what is OUTSTANDING.
--
-- The column keeps its name and its position — `create or replace view` allows
-- the expression behind a column to change, and only refuses a rename, a
-- retype or a reorder — but its meaning narrows from "what the booking is
-- worth" to "what the booking is worth that nothing else has already paid".
--
-- For every payment that existed before this migration the two are identical,
-- because a booking had at most one payment. They diverge exactly where the
-- queue was previously wrong: a second transfer raised to clear the difference
-- an amendment created would have shown "amount expected 400" against a
-- booking with 200 already banked, and the clerk would have been asked to
-- justify the 200 that actually arrived.
--
-- Other verified payments, not all of them: a pending payment must not be
-- matched against a total its own predecessor has already reduced, and it must
-- not exclude itself from a sum it does not contribute to anyway.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view payment_summary
with (security_invoker = true)
as
select
  p.id,
  p.property_id,
  p.booking_id,
  p.method,
  p.status,
  p.expected_amount_cents,
  p.amount_cents,
  p.observed_reference,
  p.observed_sender,
  p.observed_on,
  p.match_kind,
  p.amount_override_reason,
  p.match_reason,
  p.collected_by,
  p.collected_at,
  p.verified_by,
  p.verified_at,
  p.created_by,
  p.created_at,
  p.slip_document_id,
  b.reference as booking_reference,
  b.status as booking_status,
  -- Cast for the reason booking_summary's paid_cents is: `sum()` widens to
  -- bigint, and `create or replace view` refuses to change a column's type.
  (b.total_cents - coalesce(other.paid_cents, 0))::integer as due_amount_cents,
  b.updated_at as booking_updated_at,
  g.name as guest_name,
  g.phone as guest_phone,
  o.start_date as check_in,
  u.ref as unit_ref
from payment p
join booking b on b.id = p.booking_id
join guest g on g.id = b.guest_id
left join occupancy o on o.booking_id = b.id
left join unit u on u.id = o.unit_id
left join lateral (
  select sum(q.amount_cents) as paid_cents
  from payment q
  where q.booking_id = b.id and q.status = 'verified' and q.id <> p.id
) other on true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. verify_payment() matches against the outstanding figure, and may move no
--    booking at all.
--
-- Two changes, both in the body, so this is a replace rather than the drop and
-- recreate a new parameter would have forced.
--
-- **The amount rule.** `v_due` was `booking.total_cents`. It is now the total
-- less what other verified payments have already settled. In the single
-- payment case — every payment that existed before this migration — the two
-- are the same figure and nothing changes. Where they differ, this is the
-- difference between "you are 200 short" and "you have paid the 200 you owed".
--
-- **The transition is now optional**, the way record_cash_payment's already
-- was. A top-up is verified against a booking that is already `confirmed`, and
-- there is no legal move from there — `transition()` in lib/domain says so, and
-- the caller now passes nulls rather than inventing a self-transition. Writing
-- `confirmed -> confirmed` would have put a second "Booking confirmed" line in
-- the history for a booking that never moved.
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. record_cash_payment() gets the same outstanding rule.
--
-- Body-only, for the reason above. Cash keeps the amount rule a transfer has —
-- where the notes on the counter do not add up to what is owed, a person says
-- why — but "what is owed" is now the balance rather than the whole booking.
-- Taking BND 200 in cash to settle the second night of a BND 400 booking is
-- the ordinary case, and it stopped requiring a written justification.
-- ═══════════════════════════════════════════════════════════════════════════

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
    -- What this payment was for, not what the booking is worth. On a booking
    -- with nothing paid the two coincide, which is every payment written
    -- before this migration.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. record_transfer_payment() — the path that did not exist.
--
-- Until now the only two writers of a `payment` row were
-- create_walk_in_booking() and record_cash_payment(), so a second bank
-- transfer against an existing booking could not be represented at all. This
-- is the mirror of the cash path for the method that had none.
--
-- **It takes no amount.** A pending transfer has been promised, not seen —
-- `payment.amount_cents` is null until somebody has looked at the bank, and
-- the `payment_verified_is_observed` constraint enforces it. What the clerk is
-- asserting here is "the guest says they have sent the outstanding figure",
-- and the real number is entered at verification against the statement. Asking
-- for it twice would invite the second answer to disagree with the first.
--
-- **It moves no booking.** A top-up is raised against a booking that is
-- already confirmed, and confirmation is not something that happens twice.
-- Where a booking is genuinely awaiting its first transfer it already has a
-- pending payment, which the guard below refuses to duplicate.
-- ═══════════════════════════════════════════════════════════════════════════

create function record_transfer_payment(
  p_property_id uuid,
  p_booking_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_payment_id uuid;
  v_due integer;
  v_pending integer;
begin
  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  select v_booking.total_cents - coalesce(sum(p.amount_cents), 0)
  into v_due
  from payment p
  where p.booking_id = p_booking_id
    and p.property_id = p_property_id
    and p.status = 'verified';

  -- Nothing to collect. Refused rather than written, because a pending payment
  -- for zero is a row in the verification queue that nobody can ever clear —
  -- confirming it would need an override reason for an amount that is not owed.
  if v_due <= 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_outstanding', 'due_cents', v_due);
  end if;

  -- One at a time. Two pending transfers on one booking are two rows in the
  -- queue for the same money, and whichever is verified first silently makes
  -- the other one wrong.
  select count(*) into v_pending
  from payment p
  where p.booking_id = p_booking_id
    and p.property_id = p_property_id
    and p.status = 'pending_verification';

  if v_pending > 0 then
    return jsonb_build_object('ok', false, 'error', 'already_pending');
  end if;

  insert into payment (
    property_id, booking_id, method, status,
    expected_amount_cents, amount_cents, match_kind, created_by
  )
  values (
    p_property_id, p_booking_id, 'bank_transfer', 'pending_verification',
    v_due, null, null, p_actor_id
  )
  returning id into v_payment_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'payment.recorded', 'payment', v_payment_id,
    null,
    jsonb_build_object(
      'booking_id', p_booking_id,
      'reference', v_booking.reference,
      'method', 'bank_transfer',
      'expected_amount_cents', v_due,
      'amount_cents', null
    )
  );

  return jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'due_cents', v_due);
end;
$function$;

revoke execute on function record_transfer_payment(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function record_transfer_payment(uuid, uuid, uuid) to service_role;

comment on function record_transfer_payment(uuid, uuid, uuid) is
  'Raises a pending bank transfer against an existing booking for whatever is outstanding on it. Takes no amount: a pending transfer has been promised, not seen, and the observed figure is entered at verification.';
