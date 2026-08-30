-- Payments: the verification queue and cash recording (capabilities B4–B7).
--
-- prd.md §10 owns the rules; architecture.md §6.2 is normative for the shape:
-- "Confirming requires payment.verify, records verifier and timestamp, and
-- matches on amount as well as reference: a mismatched amount can only be
-- confirmed through an explicit override that records a reason. A manual-match
-- action attaches an arbitrary observed payment to a booking for customers who
-- omit the reference."
--
-- This is NOT a ledger. Nothing here computes a balance, a refund, a
-- forfeiture or an amount outstanding. prd.md §18 N5 is open and §9.6 records
-- that money is not moved by this system, so two payments against one booking
-- are two recorded facts and never an arithmetic.
--
-- Five parts, in dependency order.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The payment table.
-- ═══════════════════════════════════════════════════════════════════════════

create table payment (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  booking_id uuid not null,

  -- prd.md §10.1 [C] names exactly two methods for v1. Card is deferred
  -- pending merchant onboarding (NG1); as with booking.status, this is a check
  -- rather than an enum because widening a check is a one-line migration.
  method text not null check (method in ('bank_transfer', 'cash')),

  -- Two values, not three. There is deliberately no `rejected`: B4–B7 contains
  -- no action for "the transfer never arrived", and a status for an outcome
  -- nobody has described would be this schema deciding a product question.
  -- Today that outcome is a booking cancellation; prd.md §18 N13 asks the
  -- client whether it needs an answer of its own.
  --
  -- Cash is born `verified` — there is no bank to check, the clerk is holding
  -- the notes. prd.md §10.5's "verified by Finance" is the daily cash-up
  -- (capability E4) reconciling recorded against banked cash, which is a later
  -- fact about a day's takings and not a second state of this row.
  status text not null check (status in ('pending_verification', 'verified')),

  -- What the booking was worth when this payment was raised, and again when it
  -- was verified: verify_payment() re-reads booking.total_cents under the row
  -- lock and writes it here as part of verifying.
  --
  -- Without that refresh a booking quoted at 400, amended to 500 and then
  -- verified at 400 would report "matches", and B5's promise would be broken
  -- by the amend path rather than by anything in this file. The figure the
  -- guest was originally quoted is preserved in the audit event's `before`, so
  -- both are recoverable.
  --
  -- Deliberately excludes the security deposit. prd.md §11 and priceStay()
  -- both hold the refundable BND 100 apart from the total; it is collected on
  -- arrival and gets its own record when the deposits slice lands.
  expected_amount_cents integer not null check (expected_amount_cents >= 0),

  -- What was actually observed in the bank, or counted out. Null until then: a
  -- pending transfer has been promised, not seen, and seeding this to the
  -- expected figure would have the database assert an amount nobody has
  -- looked at.
  amount_cents integer check (amount_cents > 0),

  -- The reference AS IT APPEARED IN THE BANK, plus who sent it and when it
  -- landed. There is no `payment.reference` column: architecture.md §6.1 is
  -- explicit that the booking reference IS the payment reference, and a second
  -- copy would be a second thing to get out of step. These three exist only
  -- for prd.md §10.4's manual-match escape hatch — what the clerk actually saw
  -- on the statement when the customer quoted nothing useful.
  observed_reference text,
  observed_sender text,
  observed_on date,

  -- How this payment came to be attached to this booking. Null while pending,
  -- and null for cash, which is handed over rather than matched.
  match_kind text check (match_kind in ('reference', 'manual')),

  -- Two reasons, because they justify two different things and can co-occur: a
  -- transfer with no reference that is also fifty dollars short is one click
  -- carrying two separate justifications.
  amount_override_reason text,
  match_reason text,

  -- prd.md §10.5 / capability B7: "record who collected, when, and against
  -- which booking". Kept distinct from verified_by/verified_at even though
  -- they coincide for cash today, because "who took the money" and "who signed
  -- it off" are different facts and E4's cash-up will want the first alone.
  collected_by uuid references auth.users (id),
  collected_at timestamptz,

  -- architecture.md §6.2: "records verifier and timestamp".
  verified_by uuid references auth.users (id),
  verified_at timestamptz,

  created_by uuid references auth.users (id),

  -- The waiting clock behind B4's "time waiting" column, and deliberately the
  -- payment's creation rather than the booking's: when the public flow lands,
  -- the wait begins when the customer says they have transferred, not when
  -- they started filling in the form.
  created_at timestamptz not null default now(),

  -- Reserved for the documents slice. FK-less on purpose: a real slip column
  -- will carry the composite foreign key every other child uses, and writing
  -- half of it now would only have to be dropped and re-added. The queue reads
  -- this as "no slip on file" and says so on screen.
  slip_document_id uuid,

  unique (property_id, id),
  foreign key (property_id, booking_id) references booking (property_id, id) on delete cascade,

  -- ── The teeth ────────────────────────────────────────────────────────────
  -- scope-of-capabilities.md B5, in writing, to the client: "Confirm payments
  -- by matching both reference and amount — a short payment is flagged, never
  -- silently accepted." This is that promise as a constraint rather than as a
  -- code path. checkPaymentMatch() in lib/domain refuses first and returns a
  -- sentence the clerk can act on; this refuses last, and no server action, no
  -- RPC and no psql session gets round it.
  constraint payment_mismatch_needs_reason check (
    status <> 'verified'
    or amount_cents = expected_amount_cents
    or amount_override_reason is not null
  ),

  -- prd.md §10.4's escape hatch is an approval-semantic act — architecture.md
  -- §4 names "manual payment match" in its list — so it always carries a why.
  constraint payment_manual_match_needs_reason check (
    match_kind is distinct from 'manual' or match_reason is not null
  ),

  -- A verified payment always knows its amount and when it was signed off.
  constraint payment_verified_is_observed check (
    (status = 'verified') = (amount_cents is not null and verified_at is not null)
  ),

  -- A verified transfer always records how it was matched; a pending one never
  -- has been.
  constraint payment_transfer_verification_is_matched check (
    (method = 'bank_transfer' and status = 'verified') = (match_kind is not null)
  ),

  -- Cash is collected by definition, so `when` is not optional on it.
  --
  -- `collected_by` is not constrained here, matching booking.created_by and
  -- audit_event.actor_id: an actor is nullable throughout this schema because
  -- a write can originate from a system path with no signed-in person behind
  -- it. B7's "who" is enforced where the actor actually exists — every server
  -- action opens with requirePermission(), which returns one or throws.
  constraint payment_cash_is_collected check (
    (method = 'cash') = (collected_at is not null)
  )
);

comment on column payment.slip_document_id is
  'Reserved for the documents slice; no foreign key until the document table exists.';

-- The queue: pending only, oldest first, one property. A partial index because
-- the settled rows are the ones that accumulate and the queue never reads them.
create index payment_pending_idx on payment (property_id, created_at)
  where status = 'pending_verification';

-- The booking detail screen's payments section.
create index payment_booking_idx on payment (property_id, booking_id);

-- The cash log, newest first.
create index payment_cash_idx on payment (property_id, collected_at desc)
  where method = 'cash';

-- Migration 000800 enumerates the tables it enables RLS on, so a new table is
-- not covered by it. Enabled with no policies: deny-all for anon and
-- authenticated, bypassed by the service-role client, authorisation in
-- requirePermission() (architecture.md §4).
alter table payment enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. payment_summary — the read model.
--
-- A view of its own rather than columns appended to booking_summary. `create
-- or replace view` can only append, so every column added there is permanent
-- surface area on the read path of every bookings-list query — and the queue
-- does not want an aggregate anyway. It wants the payment row: the waiting
-- clock, the observed fields, the override reason.
-- ═══════════════════════════════════════════════════════════════════════════

create view payment_summary
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
  -- What is due NOW. B4's "amount expected" column reads this rather than the
  -- snapshot, so a booking amended after the quote shows its current price and
  -- the screen can flag the two disagreeing.
  b.total_cents as due_amount_cents,
  b.updated_at as booking_updated_at,
  g.name as guest_name,
  g.phone as guest_phone,
  o.start_date as check_in,
  u.ref as unit_ref
from payment p
join booking b on b.id = p.booking_id
join guest g on g.id = b.guest_id
-- LEFT, unlike booking_summary, which joins day passes out by construction. A
-- day pass occupies no unit (prd.md §6.1) but can still be paid for, and a
-- payment that vanishes from the verification queue because its booking has no
-- room is a payment nobody verifies.
left join occupancy o on o.booking_id = b.id
left join unit u on u.id = o.unit_id;

revoke all on payment_summary from public, anon, authenticated;
grant select on payment_summary to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. create_walk_in_booking() learns how the guest paid.
--
-- Dropped and recreated rather than replaced: `create or replace function`
-- cannot add a parameter, it defines an overload, and an overload reachable by
-- the same argument names is the ambiguity PostgREST resolves badly. Migration
-- 20260830000100 sets this precedent for available_units().
--
-- The payment row is written inside this transaction for the same reason the
-- occupancy row is: a confirmed booking with no payment record is a booking
-- nobody can prove was paid for. A losing exclusion-constraint race takes the
-- payment back with everything else.
-- ═══════════════════════════════════════════════════════════════════════════

drop function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text, integer, integer, integer, integer, jsonb, uuid
);

create function create_walk_in_booking(
  p_property_id uuid,
  p_unit_id uuid,
  -- Still derived by transition() in lib/domain and never chosen here:
  -- 'confirmed' for cash (draft --pay_in_full-->), or
  -- 'awaiting_payment_verification' for a transfer (draft --submit_payment-->).
  p_status text,
  p_check_in date,
  p_check_out date,
  p_guest_name text,
  p_guest_phone text,
  p_vehicle_registration text,
  p_chargeable_guests integer,
  p_exempt_guests integer,
  p_total_cents integer,
  p_security_deposit_cents integer,
  p_lines jsonb,
  p_payment_method text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_guest_id uuid;
  v_booking_id uuid;
  v_payment_id uuid;
  v_reference text;
  v_is_cash boolean := p_payment_method = 'cash';
begin
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
    chargeable_guests, exempt_guests, vehicle_registration,
    total_cents, security_deposit_cents, created_by
  )
  values (
    p_property_id, v_reference, 'short_stay', p_status, v_guest_id,
    p_chargeable_guests, p_exempt_guests, p_vehicle_registration,
    p_total_cents, p_security_deposit_cents, p_actor_id
  )
  returning id into v_booking_id;

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

  -- The payment's own status is derived here, and that asymmetry with p_status
  -- is deliberate. booking.status is a state machine architecture.md §5.3
  -- keeps in exactly one place; a payment's initial status is not a machine at
  -- all, it is a property of the method — cash has no bank to check. One
  -- expression beats a second round trip and a second thing to keep in step.
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

  -- architecture.md §5.3: every transition writes an audit event, in the same
  -- transaction as the transition itself.
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
      'security_deposit_cents', p_security_deposit_cents,
      'payment_method', p_payment_method
    )
  );

  -- And a second event against the payment itself, so the money has its own
  -- entry in the trail rather than being a field on the booking's.
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

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'reference', v_reference,
    'payment_id', v_payment_id
  );

exception
  -- The G1 constraint refusing a second booking over the same unit and dates.
  -- Everything above is rolled back with it, so a losing race leaves no guest,
  -- no booking, no lines and no payment behind. The reference number it
  -- consumed is not returned to the sequence; see 20260829000500 for why that
  -- is fine.
  --
  -- Returned as a value rather than raised, because this is not an error in
  -- the system: it is two people wanting the same unit, and the caller turns
  -- it into a sentence on screen.
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_unavailable');
  -- A unit id that does not exist, or belongs to another property — the
  -- composite foreign key on occupancy catches both.
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'unit_not_found');
end;
$function$;

revoke execute on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text,
  integer, integer, integer, integer, jsonb, text, uuid
) from public, anon, authenticated;

grant execute on function create_walk_in_booking(
  uuid, uuid, text, date, date, text, text, text,
  integer, integer, integer, integer, jsonb, text, uuid
) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. verify_payment() — B5's amount match, B6's manual match, one transaction.
--
-- One function rather than three. Confirm, confirm-with-override and
-- manual-match differ only in which columns are written and which audit verbs
-- fire; three functions would each need the same double lock, the same status
-- guard and the same booking transition, and would drift apart the first time
-- one of them was edited.
--
-- Why this does not call transition_booking(): that function returns its
-- refusal as a VALUE, and a `return` in plpgsql does not roll back. Calling it
-- after updating the payment would leave the payment verified and the booking
-- unmoved. The six lines of duplicated update are the honest version, and
-- transition_booking() carries a note pointing here.
-- ═══════════════════════════════════════════════════════════════════════════

create function verify_payment(
  p_property_id uuid,
  p_payment_id uuid,
  -- The booking status the caller read, and the one transition() derived from
  -- it. Legality stays in TypeScript (architecture.md §5.3).
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
  -- ── Lock everything, validate everything, then write ──────────────────────
  --
  -- Two clerks working the same queue row at the same moment is the ordinary
  -- case, not the exotic one. amend_booking() sets the pattern: take the row
  -- locks first, so every check below is made against a row nobody else can
  -- move until this transaction ends.
  --
  -- Validating after a partial write would be a bug rather than a style
  -- choice — a `return` here does not undo an update that already happened.
  --
  -- Lock order is payment then booking, and nothing else in this schema takes
  -- them in the opposite order (amend_booking goes booking, occupancy, guest;
  -- record_cash_payment below takes the booking alone).
  select * into v_payment
  from payment
  where id = p_payment_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Under READ COMMITTED, `for update` blocks on the winner and then re-reads
  -- the committed row, so the loser of a double-click sees 'verified' here
  -- rather than writing over it.
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

  if v_booking.status <> p_from_status then
    return jsonb_build_object('ok', false, 'error', 'status_changed');
  end if;

  -- What is due now, not what was quoted. See the note on
  -- payment.expected_amount_cents.
  v_due := v_booking.total_cents;

  -- Belt and braces in front of the table checks, so a missing reason reaches
  -- the clerk as a sentence rather than as a constraint violation. `due_cents`
  -- rides along because the dialog may be showing a stale figure — that is
  -- exactly the case this guard catches after an amendment.
  if p_observed_amount_cents <> v_due and v_override_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'due_cents', v_due);
  end if;

  if p_match_kind = 'manual' and v_match_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'due_cents', v_due);
  end if;

  -- ── Writes ────────────────────────────────────────────────────────────────
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

  update booking
  set status = p_to_status
  where id = v_booking.id
    and property_id = p_property_id
    and status = p_from_status;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Unreachable: the booking row is locked above. Raised rather than
    -- returned precisely because it would mean the lock did not hold, and that
    -- must roll the payment update back rather than report it calmly.
    raise exception 'verify_payment lost the booking it had locked (%)', v_booking.id;
  end if;

  -- ── Audit (architecture.md §4) ────────────────────────────────────────────
  --
  -- Up to three verbs for one click, because there are up to three distinct
  -- approval semantics in it, and §4 names "manual payment match" as one of
  -- them by hand. Separate rows rather than fields inside one, so "show me
  -- every payment confirmed against a mismatch" is a lookup on `action` over
  -- audit_event_entity_idx instead of a scan through jsonb.
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

  -- The booking's own transition, in the shape transition_booking() writes it,
  -- so the history panel reads one vocabulary.
  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'booking.verify_payment', 'booking', v_booking.id,
    jsonb_build_object('status', p_from_status),
    jsonb_build_object('status', p_to_status)
  );

  return jsonb_build_object(
    'ok', true,
    'status', p_to_status,
    'amount_cents', p_observed_amount_cents,
    'due_cents', v_due
  );

exception
  -- The table checks, if the guards above are ever bypassed or outgrown.
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
end;
$function$;

revoke execute on function verify_payment(
  uuid, uuid, text, text, integer, text, text, text, date, text, text, uuid
) from public, anon, authenticated;

grant execute on function verify_payment(
  uuid, uuid, text, text, integer, text, text, text, date, text, text, uuid
) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. record_cash_payment() — B7.
--
-- prd.md §10.5: "record who collected, when, and against which booking."
--
-- The booking transition is optional, because cash is recorded against
-- bookings in more than one state: against one awaiting a transfer it settles
-- it, and against one already confirmed it records a fact and moves nothing.
-- The caller passes the pair transition() derived, or nulls.
-- ═══════════════════════════════════════════════════════════════════════════

create function record_cash_payment(
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

  -- Cash gets the same amount rule as a transfer. It would have been easy to
  -- have this function write its own reason when the figures disagree — the
  -- constraint would be satisfied and nobody would be asked anything — but a
  -- machine-generated justification is exactly what B5 exists to prevent. If
  -- the notes on the counter do not add up to the booking total, a person
  -- says why.
  if p_amount_cents <> v_booking.total_cents and v_override_reason is null then
    return jsonb_build_object(
      'ok', false, 'error', 'reason_required', 'due_cents', v_booking.total_cents
    );
  end if;

  insert into payment (
    property_id, booking_id, method, status,
    expected_amount_cents, amount_cents,
    amount_override_reason,
    collected_by, collected_at, verified_by, verified_at, created_by
  )
  values (
    p_property_id, p_booking_id, 'cash', 'verified',
    v_booking.total_cents, p_amount_cents,
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
      'expected_amount_cents', v_booking.total_cents,
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

revoke execute on function record_cash_payment(uuid, uuid, integer, text, text, text, text, uuid)
  from public, anon, authenticated;

grant execute on function record_cash_payment(uuid, uuid, integer, text, text, text, text, uuid)
  to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- A note left where the next reader will trip over it.
--
-- verify_payment() and record_cash_payment() both inline the status update
-- that transition_booking() would otherwise make, and that duplication is
-- deliberate rather than an oversight. Recorded against the function itself so
-- that anyone about to "tidy this up" finds the reason first.
-- ═══════════════════════════════════════════════════════════════════════════

comment on function transition_booking(uuid, uuid, text, text, text, uuid, text) is
  'The status write and its audit event, made atomic. Not used by verify_payment() or record_cash_payment(), which must write a payment row in the same transaction: this function reports a refused move as a return value, and a plpgsql return does not roll back, so calling it after the payment insert would leave the payment written and the booking unmoved. Those two take the row locks themselves and inline the six lines this does.';
