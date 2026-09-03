-- Deposits, inspections and charges (capabilities E1, E2, E3).
--
-- scope-of-capabilities.md E1: "See all security deposits currently held, as a
-- live ledger." E2: "Approve deposit releases — the approval is only available
-- once the inspection is recorded, and is logged as a formal event." E3:
-- "Record itemised charges against a deposit, each with a reason and author;
-- where charges exceed the deposit, the balance is tracked as an amount owed."
--
-- prd.md §2 lists the gap this closes as one of the five the platform exists
-- for: "Deposit handling has no ledger. Nobody can answer what deposits do we
-- owe back right now."
--
-- ── Redeeming the note 20260831000100 left ────────────────────────────────
--
-- The payments migration excluded the security deposit from a payment's
-- expected amount and said why: "prd.md §11 and priceStay() both hold the
-- refundable BND 100 apart from the total; it is collected on arrival and gets
-- its own record when the deposits slice lands." This is that record.
--
-- It is deliberately not a `payment` row. A payment settles what a booking is
-- worth; a deposit is a liability held against it, and folding the two together
-- would put money in the daily cash-up (E4) that is not revenue and misstate
-- both figures. `booking.security_deposit_cents` stays what it always was —
-- the amount QUOTED at booking — and the row created here is what was actually
-- taken.
--
-- ── The stage is not a column ─────────────────────────────────────────────
--
-- A deposit is in one of four stages and all four are consequences of facts
-- recorded here or on the booking: a release approval, an inspection row, the
-- booking's own status. depositStageOf() in lib/domain/deposit.ts derives it,
-- for the reason architecture.md §5.1 gives about unit.status — a second copy
-- of a fact drifts from the first — and for the reason §5.3 keeps the booking
-- transition table out of plpgsql: branching rules live in one place. The view
-- in part 5 returns facts and no `stage`.
--
-- ── What this deliberately does NOT do ────────────────────────────────────
--
-- * **No money moves.** A release is an approval event carrying who, when and
--   the figures as they stood — prd.md §11 requirement 5, and the position
--   architecture.md §6.4 already takes on refunds. Handing the notes back
--   happens in the world. N5 in the open-questions register stays untouched,
--   and nothing here depends on its answer.
-- * **No photographs.** prd.md §11 requirement 2 asks for them; private
--   buckets, signed URLs and retention expiry are the documents slice
--   (architecture.md §8), and a column pointing at nothing would be a promise
--   the product cannot keep. Flagged to the client rather than absorbed.
-- * **No `awaiting_inspection` or `cleaning` unit status.** Those are written
--   and cleared by the housekeeping field screens (C2–C3), which do not exist.
--   What changes here is that the inspection FACT now exists for them to
--   derive from. lib/domain/unit-status.ts keeps DEFERRED_UNIT_STATUSES.
-- * **No forfeiture on cancellation.** A deposit exists only because somebody
--   was checked in, so a cancelled booking never had one to forfeit.
--
-- One assumption worth stating where the schema depends on it: **a booking has
-- at most one occupancy**. booking_summary has assumed it since 20260829000600
-- and this migration does too, in the view's join and in record_inspection().
--
-- Nine parts, in dependency order.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The deposit itself.
--
-- One per booking, created at check-in, and the row IS the fact that money was
-- taken — there is no `collected` flag, the same construction
-- unit_out_of_service_is_whole uses. Nor is there a `status`: see the header.
--
-- The release columns are the recorded event's figures, kept on the row as
-- well as in the audit event because "what do we owe back right now" is a
-- query, and answering it by scanning jsonb would be reading the audit trail
-- as a data store. They are all-or-none, and they are internally consistent by
-- CONSTRAINT rather than by code path: whichever writer produced them, the
-- three figures a person signed cannot disagree with each other.
--
-- `amount_cents > 0` rather than >= 0: a booking quoting no deposit (a day
-- pass, or any booking whose security_deposit_cents is the column's default 0)
-- checks in with no deposit row at all. A row asserting that nothing was
-- collected would show up in the ledger as a liability of zero, which is a line
-- in "what do we owe back" that nobody owes.
-- ═══════════════════════════════════════════════════════════════════════════

create table deposit (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  booking_id uuid not null,

  -- What was taken, in cents (architecture.md §5.1). Copied from the booking's
  -- quoted figure at check-in rather than read through to it, because an
  -- amendment can reprice a booking and what is held must not move with it.
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('bank_transfer', 'cash')),
  collected_by uuid references auth.users (id),
  collected_at timestamptz not null default now(),

  -- The approved release (capability E2).
  released_by uuid references auth.users (id),
  released_at timestamptz,
  release_note text,
  released_amount_cents integer check (released_amount_cents >= 0),
  charges_total_cents integer check (charges_total_cents >= 0),
  owed_cents integer check (owed_cents >= 0),

  -- The excess, once the guest has paid it (prd.md §11 requirement 6).
  owed_settled_at timestamptz,
  owed_settled_by uuid references auth.users (id),
  owed_settled_method text check (owed_settled_method in ('bank_transfer', 'cash')),

  unique (property_id, id),
  -- One deposit per booking. The write path refuses a second one with a
  -- sentence; this is what makes it impossible rather than unlikely.
  unique (property_id, booking_id),
  foreign key (property_id, booking_id) references booking (property_id, id) on delete cascade,

  constraint deposit_release_is_whole check (
    (
      released_at is null
      and released_by is null
      and released_amount_cents is null
      and charges_total_cents is null
      and owed_cents is null
    )
    or (
      released_at is not null
      and released_amount_cents is not null
      and charges_total_cents is not null
      and owed_cents is not null
    )
  ),

  -- depositFiguresOf() in lib/domain/deposit.ts, said again in SQL. This is
  -- the one place the arithmetic is deliberately duplicated: prd.md §11 [C]
  -- makes the deposit not a cap on liability, so the split between what goes
  -- back and what is still owed is the whole answer, and a release row whose
  -- figures do not add up is a dispute nobody can settle.
  constraint deposit_release_arithmetic check (
    released_at is null
    or (
      released_amount_cents = greatest(amount_cents - charges_total_cents, 0)
      and owed_cents = greatest(charges_total_cents - amount_cents, 0)
    )
  ),

  constraint deposit_settlement_is_whole check (
    (owed_settled_at is null) = (owed_settled_method is null)
  ),

  -- Nothing is settled that was never owed, and nothing is owed before the
  -- release said so.
  constraint deposit_settlement_needs_debt check (
    owed_settled_at is null or (released_at is not null and owed_cents > 0)
  )
);

-- Three partial indexes for the three questions the ledger asks. The first is
-- E1 itself — what is held right now — and it is the one that must stay fast
-- as the released rows accumulate past it.
create index deposit_held_idx on deposit (property_id, collected_at desc)
  where released_at is null;

create index deposit_released_idx on deposit (property_id, released_at desc)
  where released_at is not null;

create index deposit_owed_idx on deposit (property_id, released_at desc)
  where owed_cents > 0 and owed_settled_at is null;

-- 20260829000800 enumerates the tables it enables RLS on, so a table created
-- afterwards is not covered by it. Enabled with no policies: deny-all for anon
-- and authenticated, bypassed by the service-role client, authorisation in
-- requirePermission() (architecture.md §4). That file's own header names this
-- slice's rule — "approve is only available once inspection is recorded" — as
-- the example of logic richer than a row filter.
alter table deposit enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The inspection.
--
-- Hung off the OCCUPANCY, as prd.md §6.2 sketches it ("Inspection occupancy_id,
-- inspected_by, outcome, notes, photos[]") and not off the booking. The
-- inspection is about the unit after a stay, and §6.1 makes an occupancy the
-- one object a stay and a tenancy share — so a lease that ends and is
-- inspected needs no second table when phase three arrives. The write path
-- takes a booking id, because that is what every screen holds.
--
-- One per occupancy, and append-only as a product rule rather than by trigger:
-- lib/db/inspections.ts exposes a read and a write and nothing else, which is
-- the position booking_note takes. The audit trail is what is protected by
-- triggers; this is a record somebody may need to correct, and correcting it
-- should stay a screen rather than a migration.
--
-- No photos. See the header.
-- ═══════════════════════════════════════════════════════════════════════════

create table inspection (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  occupancy_id uuid not null,

  -- Two outcomes, mirroring INSPECTION_OUTCOMES in lib/domain/inspection.ts —
  -- the relationship lib/domain/payment.ts has to the payment table, so
  -- widening this is a code change and a migration together. prd.md §11
  -- branches exactly once, and this is that branch.
  outcome text not null check (outcome in ('clean', 'issues_found')),
  notes text,
  inspected_by uuid references auth.users (id),
  inspected_at timestamptz not null default now(),

  unique (property_id, id),
  unique (property_id, occupancy_id),
  foreign key (property_id, occupancy_id) references occupancy (property_id, id) on delete cascade,

  -- An inspection that says something is wrong without saying what cannot
  -- support the charge that follows it. checkInspectionNotes() refuses first,
  -- with a sentence; this refuses last.
  constraint inspection_issues_need_notes check (
    outcome <> 'issues_found' or btrim(coalesce(notes, '')) <> ''
  )
);

alter table inspection enable row level security;

comment on table inspection is
  'Photographic evidence (prd.md §11 req 2, capability C2) arrives with the documents slice; this table carries outcome and notes only.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Charges against a deposit (capability E3).
--
-- Its own table, and specifically NOT a booking_line. prd.md §8 makes the
-- lines the price — booking.total_cents is their sum, and priceStay()
-- re-derives all of them on every amendment — so a damage charge added as a
-- line would be revenue on the booking, would be wiped by the next amendment,
-- and would break the invariant that the deposit is held apart from the total.
--
-- Hung off the deposit rather than the booking, which is a delta from the
-- §6.2 sketch (`Charge booking_id, amount, reason, created_by, settled`) worth
-- naming: a charge exists only because money is being held to answer for it,
-- the booking is one hop away through the deposit, and `settled` is a fact
-- about the excess as a WHOLE — one guest paying one balance — so it lives on
-- the deposit and not once per charge.
--
-- Waiving is a decision under its own permission (`charge.waive`, Finance), so
-- a waived charge is kept and excluded from the arithmetic rather than
-- deleted. activeChargesTotal() in lib/domain/deposit.ts is the other half.
-- ═══════════════════════════════════════════════════════════════════════════

create table deposit_charge (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  deposit_id uuid not null,

  amount_cents integer not null check (amount_cents > 0),
  -- prd.md §11 requirement 3: itemised, with a reason and an author. Required
  -- by the database and not only by the form, the way a discount's reason is:
  -- this is somebody's money being kept, and the first question asked about it
  -- later is what for.
  reason text not null check (btrim(reason) <> ''),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),

  waived_at timestamptz,
  waived_by uuid references auth.users (id),
  waive_reason text,

  unique (property_id, id),
  foreign key (property_id, deposit_id) references deposit (property_id, id) on delete cascade,

  constraint deposit_charge_waiver_is_whole check (
    (waived_at is null and waive_reason is null)
    or (waived_at is not null and btrim(coalesce(waive_reason, '')) <> '')
  )
);

create index deposit_charge_deposit_idx on deposit_charge (property_id, deposit_id, created_at);

alter table deposit_charge enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Check-in, which is where a deposit comes from.
--
-- prd.md §11 [C] says the deposit is collected on arrival, and until now
-- nothing in the product marked an arrival: `check_in` existed in the state
-- machine and was reachable only from a test. It becomes a portal action here,
-- gated by `booking.amend` until open question N11 settles who may check a
-- guest in (**[A]**, prd.md §4).
--
-- The status move and the deposit insert are ONE transaction on purpose. A
-- guest checked in with no deposit recorded is exactly the gap in the
-- spreadsheet this replaces — somebody takes the notes and means to write it
-- down.
--
-- Why this does not call transition_booking(): that function reports a refused
-- move as a VALUE, and a `return` in plpgsql does not roll back, so calling it
-- and then inserting would leave a moved booking behind a refusal. It is the
-- same reason verify_payment() inlines its update, and transition_booking()
-- already carries a comment saying so. Legality still lives in TypeScript —
-- the caller passes the pair transition() derived (architecture.md §5.3).
-- ═══════════════════════════════════════════════════════════════════════════

create function check_in_booking(
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
  v_deposit_id uuid;
  v_updated integer;
begin
  -- Lock, validate everything, then write. Two people at one desk is the
  -- ordinary case, and a guard that fired after the update would leave the
  -- booking moved.
  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Under READ COMMITTED, `for update` blocks on the winner and re-reads the
  -- committed row, so the loser of a double-click sees 'checked_in' here
  -- rather than writing over it.
  if v_booking.status <> p_from_status then
    return jsonb_build_object('ok', false, 'error', 'status_changed', 'status', v_booking.status);
  end if;

  if p_method is null or p_method not in ('bank_transfer', 'cash') then
    return jsonb_build_object('ok', false, 'error', 'invalid_method');
  end if;

  -- A backstop rather than a race the status guard leaves open: a deposit
  -- exists only after a check-in, and a checked-in booking has already failed
  -- the guard above. It is here so the one-deposit-per-booking rule is never
  -- reported to a clerk as a constraint violation, whatever route a future
  -- caller takes to this function — and it is checked BEFORE the update,
  -- because a `return` in plpgsql would not undo one.
  if exists (select 1 from deposit where booking_id = p_booking_id and property_id = p_property_id) then
    return jsonb_build_object('ok', false, 'error', 'already_collected');
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

  -- A booking quoting no deposit checks in without one. See the note on
  -- deposit.amount_cents.
  if v_booking.security_deposit_cents > 0 then
    insert into deposit (property_id, booking_id, amount_cents, method, collected_by)
    values (
      p_property_id, p_booking_id, v_booking.security_deposit_cents, p_method, p_actor_id
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
        'method', p_method
      )
    );
  end if;

  -- The booking's own move, in the shape transition_booking() writes it, so
  -- the history panel reads one vocabulary. The deposit key is omitted rather
  -- than null where none was taken — the convention transition_booking() uses
  -- for its reason.
  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'booking.check_in', 'booking', p_booking_id,
    jsonb_build_object('status', p_from_status),
    case
      when v_deposit_id is null then jsonb_build_object('status', p_to_status)
      else jsonb_build_object('status', p_to_status, 'deposit_id', v_deposit_id)
    end
  );

  return jsonb_build_object('ok', true, 'status', p_to_status, 'deposit_id', v_deposit_id);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Recording an inspection (capability C2, portal half).
--
-- Keyed by booking, stored against its occupancy: the screen holds a booking
-- reference, the fact belongs to the stay. prd.md §11 [C] puts this with
-- Housekeeping, and §4 [C] keeps the approval away from them — "Housekeeping
-- records the inspection; a separate role approves" — which is why this
-- function and approve_deposit_release() below are two actions behind two
-- permissions rather than one screen behind one.
--
-- Only after check-out. Inspecting a unit somebody is still living in is not a
-- thing that happens, and allowing it early would let a release be signed off
-- mid-stay.
-- ═══════════════════════════════════════════════════════════════════════════

create function record_inspection(
  p_property_id uuid,
  p_booking_id uuid,
  p_outcome text,
  p_notes text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_booking booking%rowtype;
  v_occupancy occupancy%rowtype;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_inspection_id uuid;
  v_unit_ref text;
begin
  select * into v_booking
  from booking
  where id = p_booking_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_booking.status <> 'completed' then
    return jsonb_build_object(
      'ok', false, 'error', 'booking_not_completed', 'status', v_booking.status
    );
  end if;

  -- A booking has at most one occupancy (see the header). A day pass has none,
  -- and there is no unit to inspect for one.
  select * into v_occupancy
  from occupancy
  where booking_id = p_booking_id and property_id = p_property_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_occupancy');
  end if;

  if exists (
    select 1 from inspection
    where occupancy_id = v_occupancy.id and property_id = p_property_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_inspected');
  end if;

  if p_outcome is null or p_outcome not in ('clean', 'issues_found') then
    return jsonb_build_object('ok', false, 'error', 'invalid_outcome');
  end if;

  -- checkInspectionNotes() refuses first with a sentence a cleaner can act on;
  -- inspection_issues_need_notes refuses last. This one exists so a write
  -- arriving from anywhere else is still told which rule it broke.
  if p_outcome = 'issues_found' and v_notes is null then
    return jsonb_build_object('ok', false, 'error', 'notes_required');
  end if;

  insert into inspection (property_id, occupancy_id, outcome, notes, inspected_by)
  values (p_property_id, v_occupancy.id, p_outcome, v_notes, p_actor_id)
  returning id into v_inspection_id;

  select ref into v_unit_ref from unit where id = v_occupancy.unit_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'inspection.recorded', 'inspection', v_inspection_id,
    null,
    jsonb_build_object(
      'occupancy_id', v_occupancy.id,
      'booking_id', p_booking_id,
      'booking_reference', v_booking.reference,
      'unit_ref', v_unit_ref,
      'outcome', p_outcome,
      'notes', v_notes
    )
  );

  return jsonb_build_object('ok', true, 'inspection_id', v_inspection_id);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Charges: adding one, and waiving one (capability E3).
--
-- Both lock the DEPOSIT first and nothing in this schema takes these two rows
-- in the other order, so a clerk adding a charge and an approver signing off
-- cannot deadlock — they queue.
--
-- Charges are open from check-in until the release is approved. A broken
-- window on the second night of a five-night stay is a charge against this
-- deposit, and making somebody wait for the guest to leave before writing it
-- down is how it ends up in WhatsApp instead. Approval closes them, because
-- the statement a guest is given is what was signed off.
-- ═══════════════════════════════════════════════════════════════════════════

create function add_deposit_charge(
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

  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if v_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  insert into deposit_charge (property_id, deposit_id, amount_cents, reason, created_by)
  values (p_property_id, p_deposit_id, p_amount_cents, v_reason, p_actor_id)
  returning id into v_charge_id;

  select * into v_booking from booking where id = v_deposit.booking_id;

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

create function waive_deposit_charge(
  p_property_id uuid,
  p_charge_id uuid,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_charge deposit_charge%rowtype;
  v_deposit deposit%rowtype;
  v_deposit_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  -- The charge is read without a lock only to find its deposit; the deposit is
  -- locked first, then the charge is re-read under it. Lock order is the same
  -- as add_deposit_charge() and approve_deposit_release(), so a waiver and an
  -- approval racing each other queue rather than deadlock.
  select deposit_id into v_deposit_id
  from deposit_charge
  where id = p_charge_id and property_id = p_property_id;

  if v_deposit_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_deposit
  from deposit
  where id = v_deposit_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_charge
  from deposit_charge
  where id = p_charge_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_deposit.released_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_released');
  end if;

  if v_charge.waived_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_waived');
  end if;

  if v_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  update deposit_charge
  set waived_at = now(), waived_by = p_actor_id, waive_reason = v_reason
  where id = p_charge_id and property_id = p_property_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'charge.waived', 'deposit_charge', p_charge_id,
    jsonb_build_object('amount_cents', v_charge.amount_cents, 'charge_reason', v_charge.reason),
    jsonb_build_object(
      'deposit_id', v_deposit.id,
      'amount_cents', v_charge.amount_cents,
      'charge_reason', v_charge.reason,
      'reason', v_reason
    )
  );

  return jsonb_build_object('ok', true);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Approving a release (capability E2), and settling what is owed.
--
-- prd.md §11 requirement 5: "Approval is a recorded event (who, when,
-- amounts), not a status flag. The audit trail is the point of an approval
-- step." Both are written — the event because it is the point, and the columns
-- because "what do we owe back right now" is a query and answering it out of
-- jsonb would be reading the audit trail as a data store.
--
-- Requirement 4's gate — "unavailable until inspection is recorded and charges
-- entered" — is half a database rule and half a screen rule. The inspection is
-- refused here, in the one place no caller can go around. "Charges entered" is
-- satisfied by the approver seeing the itemised list and the resulting figures
-- before confirming (**[A]**, prd.md §11): a release with no charges is the
-- ordinary case, so there is nothing to require.
--
-- The charges are summed UNDER the deposit's lock, so a charge added while the
-- dialog was open either lands before the approval and is counted, or queues
-- behind it and is refused as `already_released`. Neither outcome is a figure
-- signed against a list that changed underneath it.
-- ═══════════════════════════════════════════════════════════════════════════

create function approve_deposit_release(
  p_property_id uuid,
  p_deposit_id uuid,
  p_note text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_deposit deposit%rowtype;
  v_booking booking%rowtype;
  v_inspection inspection%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_charges integer;
  v_charge_count integer;
  v_released integer;
  v_owed integer;
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

  -- Read without a lock: a release requires `completed`, which is terminal
  -- (lib/domain/booking-state.ts), so the status cannot move away underneath
  -- this check.
  select * into v_booking from booking
  where id = v_deposit.booking_id and property_id = p_property_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_booking.status <> 'completed' then
    return jsonb_build_object(
      'ok', false, 'error', 'booking_not_completed', 'status', v_booking.status
    );
  end if;

  select i.* into v_inspection
  from inspection i
  join occupancy o on o.id = i.occupancy_id
  where o.booking_id = v_deposit.booking_id and i.property_id = p_property_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'inspection_missing');
  end if;

  select coalesce(sum(amount_cents), 0)::integer, count(*)::integer
  into v_charges, v_charge_count
  from deposit_charge
  where deposit_id = p_deposit_id and property_id = p_property_id and waived_at is null;

  -- depositFiguresOf(), and deposit_release_arithmetic checks the same thing
  -- as the row lands.
  v_released := greatest(v_deposit.amount_cents - v_charges, 0);
  v_owed := greatest(v_charges - v_deposit.amount_cents, 0);

  update deposit
  set released_at = now(),
      released_by = p_actor_id,
      release_note = v_note,
      released_amount_cents = v_released,
      charges_total_cents = v_charges,
      owed_cents = v_owed
  where id = p_deposit_id and property_id = p_property_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'deposit.release_approved', 'deposit', p_deposit_id,
    jsonb_build_object(
      'amount_cents', v_deposit.amount_cents,
      'booking_reference', v_booking.reference
    ),
    -- The figures as they stood, so a dispute a year later is answered from
    -- the event rather than from rows that have since been added to.
    case
      when v_note is null then jsonb_build_object(
        'released_amount_cents', v_released,
        'charges_total_cents', v_charges,
        'owed_cents', v_owed,
        'charge_count', v_charge_count,
        'inspection_id', v_inspection.id,
        'inspection_outcome', v_inspection.outcome
      )
      else jsonb_build_object(
        'released_amount_cents', v_released,
        'charges_total_cents', v_charges,
        'owed_cents', v_owed,
        'charge_count', v_charge_count,
        'inspection_id', v_inspection.id,
        'inspection_outcome', v_inspection.outcome,
        'reason', v_note
      )
    end
  );

  return jsonb_build_object(
    'ok', true,
    'released_amount_cents', v_released,
    'charges_total_cents', v_charges,
    'owed_cents', v_owed
  );
end;
$function$;

-- Where charges exceeded the deposit, prd.md §11 requirement 6 makes the
-- difference "an outstanding amount owed, with a shareable statement". This
-- records that the guest has paid it. **[A]**: it is not a booking payment —
-- it settles no booking, appears in no cash-up, and is gated by
-- `payment.record_cash`, which is already the permission meaning "may say that
-- money arrived" (prd.md §10.7, N11). Whole amounts only; a part payment
-- against an excess is N21.

create function settle_deposit_owed(
  p_property_id uuid,
  p_deposit_id uuid,
  p_method text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_deposit deposit%rowtype;
begin
  select * into v_deposit
  from deposit
  where id = p_deposit_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_deposit.released_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_released');
  end if;

  if coalesce(v_deposit.owed_cents, 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_owed');
  end if;

  if v_deposit.owed_settled_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  if p_method is null or p_method not in ('bank_transfer', 'cash') then
    return jsonb_build_object('ok', false, 'error', 'invalid_method');
  end if;

  update deposit
  set owed_settled_at = now(), owed_settled_by = p_actor_id, owed_settled_method = p_method
  where id = p_deposit_id and property_id = p_property_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'deposit.owed_settled', 'deposit', p_deposit_id,
    jsonb_build_object('owed_cents', v_deposit.owed_cents),
    jsonb_build_object('owed_cents', v_deposit.owed_cents, 'method', p_method)
  );

  return jsonb_build_object('ok', true);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. The ledger's read model.
--
-- Its own view rather than columns appended to booking_summary, for the reason
-- payment_summary is its own: `create or replace view` can only ever add, and
-- a booking row does not want six deposit columns it is null in. The subject
-- here is the deposit — E1's question is "what do we owe back", not "what is
-- this booking's deposit doing" — so the deposit is the driving table.
--
-- Facts only. No `stage` column: depositStageOf() derives it (see the header).
--
-- Two things to note in the joins. The occupancy is LEFT joined for the reason
-- payment_summary and booking_summary both do it — a booking that occupies no
-- unit must be a row rather than a row joined away — even though a day pass
-- carries no deposit today and so cannot appear here. And `charges_total_cents`
-- is the LIVE total of unwaived charges, which is not the same figure as the
-- deposit's own `charges_total_cents`: that one is what was signed off, frozen
-- at approval. Both are exposed, named apart, because the statement must show
-- what was approved and the screen must show what is standing.
--
-- The sums are cast to integer: sum() returns bigint, and a view column typed
-- bigint is a `create or replace` that refuses the next time somebody adds a
-- column beside it — the lesson booking_summary.paid_cents already carries.
-- ═══════════════════════════════════════════════════════════════════════════

create view deposit_summary
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

  -- Standing against the deposit right now. Waived charges excluded.
  coalesce(c.charges_total_cents, 0)::integer as charges_total_cents,
  coalesce(c.charge_count, 0)::integer as charge_count,

  d.released_at,
  d.released_by,
  d.release_note,
  d.released_amount_cents,
  -- What was signed off, which stops being the figure above the moment a
  -- charge is waived after the fact. Nothing can do that today — charges close
  -- at approval — and the two are named apart so that stays true by reading.
  d.charges_total_cents as approved_charges_total_cents,
  d.owed_cents,

  d.owed_settled_at,
  d.owed_settled_by,
  d.owed_settled_method
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
-- 9. Grants.
--
-- Every function is service-role only, like every other writer in this schema:
-- the data client is the only caller and authorisation happens above it, in
-- requirePermission() (architecture.md §4).
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on deposit_summary from public, anon, authenticated;
grant select on deposit_summary to service_role;

revoke execute on function check_in_booking(uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke execute on function record_inspection(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
revoke execute on function add_deposit_charge(uuid, uuid, integer, text, uuid)
  from public, anon, authenticated;
revoke execute on function waive_deposit_charge(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function approve_deposit_release(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function settle_deposit_owed(uuid, uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function check_in_booking(uuid, uuid, text, text, text, uuid) to service_role;
grant execute on function record_inspection(uuid, uuid, text, text, uuid) to service_role;
grant execute on function add_deposit_charge(uuid, uuid, integer, text, uuid) to service_role;
grant execute on function waive_deposit_charge(uuid, uuid, text, uuid) to service_role;
grant execute on function approve_deposit_release(uuid, uuid, text, uuid) to service_role;
grant execute on function settle_deposit_owed(uuid, uuid, text, uuid) to service_role;
