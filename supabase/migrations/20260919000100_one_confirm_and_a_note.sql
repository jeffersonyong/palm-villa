-- ═══════════════════════════════════════════════════════════════════════════
-- One confirm, and a note (capabilities B5, B6, B16)
--
-- The verification queue offered a payment two doors — *Confirm* and *Match
-- manually* — and offered a deposit one. The asymmetry was justified in a
-- comment on the deposit control: a manual match exists to attach a transfer
-- that arrived without a reference, and a deposit is raised against one
-- booking by the customer pressing a button on that booking's own page, so
-- there is nothing to match it to.
--
-- That reasoning does not survive being looked at. A pending *payment* row is
-- raised exactly the same way, by the same button on the same page, and
-- `match_payment_manually` never attached a floating payment to an arbitrary
-- booking — it took a pending row that was already attached and recorded what
-- the bank actually showed. The case it exists for happens to deposits
-- identically: the guest transfers BND 100 and forgets to quote PV-4821.
--
-- So the fix is not a second manual-match door for deposits. It is one door
-- for both, which is what the desk wanted anyway: a clerk who does not know
-- before opening their bank app whether the reference was quoted should not
-- have to pick which dialog to open — the same argument the confirm dialog
-- already makes about the amount override, where the *discrepancy* is the flag
-- rather than a door chosen in advance.
--
-- **The absence is the flag, here too.** One dialog, an optional note, and
-- if the clerk clears the reference field the note becomes required — because
-- with nothing quoted it is the only thing identifying the payment, which is
-- precisely what prd.md §10.4's escape hatch was asking for in five fields.
-- `match_kind` is then *derived* from whether a reference was recorded rather
-- than chosen, so the audit flag architecture.md §4 relies on survives with no
-- extra typing in the ordinary case.
--
-- **Payment needs no schema change at all.** `payment_manual_match_needs_reason`
-- (20260831000100) already says exactly the new rule — manual implies a
-- reason — and it was written before anyone thought of deriving the kind. What
-- changes above it is only who decides `match_kind`.
--
-- **Deposit needs the two columns payment has had since 20260831000100.** Its
-- observed_* columns were added to "mirror payment's exactly" (20260913000200)
-- and the mirror stopped one short of the pair that records how the money was
-- tied to the booking. Until now nothing wrote them because nothing offered a
-- deposit the choice; from here both kinds of money are confirmed by one
-- dialog, and a deposit matched by hand must leave the same trace a payment
-- does.
--
-- What is NOT dropped: `observed_sender` and `observed_on` on both tables. The
-- single dialog stops collecting them — a free-text note holds "sent by John
-- at 9pm" without asking a clerk to split it across three fields — but the
-- rows already written carry real transcriptions off real statements, and the
-- booking screen still renders them. Dead to new writes, kept for the reads.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The deposit records how it was matched ─────────────────────────────

alter table deposit
  add column match_kind text check (match_kind in ('reference', 'manual')),
  add column match_reason text;

comment on column deposit.match_kind is
  'How this deposit came to be attached to this booking: ''reference'' where the bank showed the booking reference, ''manual'' where it did not and a person tied the two together. Derived from whether a reference was observed, never chosen in a dialog. Null while promised, and null for cash — money handed over at the desk is not matched.';

comment on column deposit.match_reason is
  'What the person confirming wrote down. Optional where the bank quoted the reference, and the note is then whatever was worth keeping; required where it did not, because with no reference this is the only thing identifying the transfer (prd.md §10.4).';

-- The escape hatch is an approval-semantic act — architecture.md §4 names
-- "manual payment match" in its list — so it always carries a why. Word for
-- word `payment_manual_match_needs_reason` (20260831000100): the same act
-- against a different kind of money gets the same teeth.
alter table deposit add constraint deposit_manual_match_needs_reason check (
  match_kind is distinct from 'manual' or match_reason is not null
);

-- Mirrors deposit_override_reason_length (20260913000200). A note is a
-- sentence a colleague reads later, not a document.
alter table deposit add constraint deposit_match_reason_length check (
  match_reason is null or char_length(match_reason) between 1 and 280
);

-- ── 2. The payment's columns say what they now mean ───────────────────────
--
-- No structural change — `payment_manual_match_needs_reason` already enforces
-- the rule. Only the comments were written when a clerk chose the kind from a
-- menu, and a comment that describes a menu nobody opens any more is the kind
-- of thing that sends the next reader looking for a screen that does not
-- exist.

comment on column payment.match_kind is
  'How this payment came to be attached to this booking. Derived from whether the bank showed the booking reference, never chosen in a dialog. Null while pending, and null for cash, which is handed over rather than matched.';

comment on column payment.match_reason is
  'What the person confirming wrote down. Optional where the bank quoted the reference; required where it did not, because with no reference this is the only thing identifying the transfer (prd.md §10.4).';

comment on column payment.observed_sender is
  'Who the bank showed as the sender. Written by the manual-match dialog that existed until 19 September 2026; no longer collected — the single confirm dialog takes a free-text note instead — and kept because the rows that carry it are transcriptions off real statements.';

comment on column payment.observed_on is
  'The date the payment appeared on the statement. Written by the manual-match dialog that existed until 19 September 2026; no longer collected, and kept for the same reason as observed_sender.';

-- ── 3. verify_deposit() records the match ─────────────────────────────────
--
-- Dropped and recreated rather than replaced: two new parameters make a new
-- signature, and `create or replace` would leave the old function beside the
-- new one as an overload for every caller to resolve ambiguously.
--
-- The body is 20260917000100's with one guard and three assignments added.
-- The guard mirrors verify_payment()'s and sits before any write, for the
-- reason every guard in these functions does: a plpgsql `return` does not roll
-- back what came before it.

drop function verify_deposit(uuid, uuid, text, text, integer, text, text, date, text, uuid);

create function verify_deposit(
  p_property_id uuid,
  p_deposit_id uuid,
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
  v_match_reason text := nullif(btrim(coalesce(p_match_reason, '')), '');
begin
  if p_observed_amount_cents is null or p_observed_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if p_match_kind is null or p_match_kind not in ('reference', 'manual') then
    return jsonb_build_object('ok', false, 'error', 'invalid_match_kind');
  end if;

  -- Trimmed here rather than trusted from the caller, exactly as the override
  -- reason is: a note of three spaces satisfies `required` in a browser and
  -- satisfies nobody reading the trail afterwards.
  if p_match_kind = 'manual' and v_match_reason is null then
    return jsonb_build_object('ok', false, 'error', 'match_reason_required');
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
    match_kind = p_match_kind,
    observed_reference = p_observed_reference,
    observed_sender = p_observed_sender,
    observed_on = p_observed_on,
    amount_override_reason = v_override_reason,
    match_reason = v_match_reason
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
      'via', 'transfer_at_booking',
      'match_kind', p_match_kind
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

  -- Its own event, as `payment.matched_manually` is (20260831000100): tying
  -- money to a booking without the bank agreeing is the approval-semantic act
  -- architecture.md §4 lists, and it is read on its own rather than found
  -- inside the collection event.
  if p_match_kind = 'manual' then
    insert into audit_event (
      property_id, actor_id, action, entity_type, entity_id, before, after
    )
    values (
      p_property_id, p_actor_id, 'deposit.matched_manually', 'deposit', p_deposit_id,
      jsonb_build_object('booking_reference', v_booking.reference),
      jsonb_build_object(
        'observed_reference', p_observed_reference,
        'observed_sender', p_observed_sender,
        'observed_on', p_observed_on,
        'reason', v_match_reason
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

comment on function verify_deposit(uuid, uuid, text, text, integer, text, text, text, date, text, text, uuid) is
  'Records that a promised security deposit arrived, at whatever figure was seen, and how it was matched to the booking. Moves the booking to confirmed only when that figure covers the quote in full (prd.md §11) — a short deposit is collected and secures nothing. A manual match carries a reason, as a payment''s does.';

-- The grant is re-issued because the old function was dropped with it.
-- architecture.md §4: the browser never reaches these, only the server's
-- service-role client does.
revoke execute on function verify_deposit(
  uuid, uuid, text, text, integer, text, text, text, date, text, text, uuid
) from public, anon, authenticated;

grant execute on function verify_deposit(
  uuid, uuid, text, text, integer, text, text, text, date, text, text, uuid
) to service_role;
