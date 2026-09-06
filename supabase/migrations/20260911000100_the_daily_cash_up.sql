-- ═══════════════════════════════════════════════════════════════════════════
-- The daily cash-up (capability E4; prd.md §10.5, §14).
--
-- prd.md §10.5 [C] says cash is "reconciled by comparing cash collected
-- against recorded transactions and receipts, then verified by the Finance
-- team", and §10.5 [A] reads that verification as THIS screen rather than as a
-- second approval on each payment: a clerk holding the notes has no bank to
-- check, so a cash payment is verified when it is taken and Finance reconciles
-- the day.
--
-- Reconciling needs a figure the system has never held. 20260831000100 said so
-- when it built payments — the cash-up is "a later fact about a day's takings
-- and not a second state of this row" — and left `collected_by` / `collected_at`
-- separate from `verified_by` / `verified_at` for exactly this. This migration
-- writes that fact down.
--
-- ── Why a table and not a payment status ───────────────────────────────────
--
-- Banking is not something that happens to a payment. Notes from six payments
-- go to the bank in one envelope, and a payment is not a note — the same
-- BND 200 that arrived as two payments may be banked as one deposit, or across
-- two runs. So a banking is its own record against a business DAY, and what a
-- day owes is derived by summing both sides (lib/domain/reports/cash-up.ts).
-- Nothing about the reconciliation is stored: the derived-not-stored position
-- architecture.md §5.1 takes for `unit.status` and a deposit's stage.
--
-- ── Why append-only, and why no negative ───────────────────────────────────
--
-- A banking is a physical act with a witness. Editing one rewrites what
-- somebody says they did, so a correction is a SECOND entry and the day's
-- variance moves — the position `booking_note` and `inspection` take, enforced
-- as a product rule in lib/db/cash-banking.ts (list and record, nothing else)
-- rather than by a rejection trigger; only `audit_event` is trigger-protected
-- (architecture.md §4). Amounts are positive for the same reason: money coming
-- back out of the bank is a refund, and refunds are N5, open.
--
-- ── Who may record one ─────────────────────────────────────────────────────
--
-- [A] `payment.verify`, minting no new permission string. §10.5's own [A]
-- makes the cash-up the act of verifying cash, so whoever may verify money is
-- whoever may say it reached the bank. Admin and Finance hold it, which is
-- where prd.md §4 puts reconciliation. Raised as N26 — and with it the
-- consequence that Front Office, who take the cash, hold neither `report.view`
-- nor a reason to open the screen.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. cash_banking — one row per trip to the bank.
--
-- `business_date` is the day the money was TAKEN, not the day it was banked:
-- an evening's cash is walked to BIBD the next morning, and filing it under
-- the morning would leave every day short and the next day over. It is chosen
-- by the person banking, defaulted by the screen to the day being viewed, and
-- may not be in the future — a cash-up for tomorrow is not a thing, and the
-- guard is here rather than only in the form because a date is the field most
-- likely to be typed wrong.
--
-- `banked_at` is when the record was written, which is a different fact and
-- the one the audit trail needs.
-- ═══════════════════════════════════════════════════════════════════════════

create table cash_banking (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  business_date date not null,
  amount_cents integer not null check (amount_cents > 0),
  note text,
  banked_by uuid references auth.users (id),
  banked_at timestamptz not null default now(),
  unique (property_id, id),
  constraint cash_banking_note_length check (
    note is null or char_length(note) between 1 and 280
  )
);

-- The cash-up reads one window of days at a time. `banked_at` is the second
-- key so two runs on one day have a total order — the reason the register
-- sorts by reference as well as by date (design.md §Components — a paginated
-- table needs a total order).
--
-- Declared descending though `listCashBankings()` reads ascending: Postgres
-- serves either direction from one index at the same cost, and descending is
-- the direction a second reader will want, since a cash-up is worked from the
-- most recent day backwards.
create index cash_banking_day_idx
  on cash_banking (property_id, business_date desc, banked_at desc);

-- 20260829000800 enumerates the tables it enables RLS on, so a table created
-- afterwards is not covered by it. Enabled with no policies: deny-all for anon
-- and authenticated, bypassed by the service-role client, authorisation in
-- requirePermission() (architecture.md §4).
alter table cash_banking enable row level security;

comment on table cash_banking is
  'Cash banked against a business day (capability E4). Append-only as a product rule: lib/db/cash-banking.ts exposes list and record and nothing else, and a correction is a second row. What a day reconciles to is derived, never stored.';

comment on column cash_banking.business_date is
  'The Brunei calendar day the cash was TAKEN, not the day it reached the bank. Chosen by the person banking; never in the future.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. payment_summary carries the booking's stream.
--
-- Revenue by stream (prd.md §14, capability E5) groups verified payments by
-- what was sold, and the view the payments layer already reads had every
-- column but that one. Appended, because `create or replace view` allows a new
-- column only at the end — the same move 20260910000100 made on
-- booking_summary. Otherwise this is the view 20260903000200 defined, repeated
-- verbatim because a replace restates the whole body. Privileges survive a
-- replace, so the grants below do not repeat it.
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
  u.ref as unit_ref,
  b.stream as booking_stream
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
-- 3. record_cash_banking() — the write and its audit event, in one
--    transaction.
--
-- Refusals are returned rather than raised, like every other writer here, so
-- the screen can say which field is wrong instead of showing an error page.
-- Today is read from the property's own timezone, the way unit_state() reads
-- it: the server runs in UTC, and "not in the future" asked in UTC would
-- refuse the first eight hours of every Brunei day.
-- ═══════════════════════════════════════════════════════════════════════════

create function record_cash_banking(
  p_property_id uuid,
  p_business_date date,
  p_amount_cents integer,
  p_note text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
as $function$
declare
  v_today date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
  v_banked_at timestamptz;
begin
  select (now() at time zone p.time_zone)::date into v_today
  from property p
  where p.id = p_property_id;

  -- `time_zone` is `not null`, so a null here means no such property — the
  -- `if not found` the other writers use, expressed through the value this one
  -- actually needs rather than through a row it would otherwise discard.
  if v_today is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Two failures, deliberately not one code: a caller that sent no date and a
  -- caller that sent next Tuesday have different problems, and a screen that
  -- answered the first with "that day has not happened" would be describing a
  -- day nobody named.
  if p_business_date is null then
    return jsonb_build_object('ok', false, 'error', 'date_required');
  end if;

  if p_business_date > v_today then
    return jsonb_build_object('ok', false, 'error', 'future_date', 'today', v_today);
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if v_note is not null and char_length(v_note) > 280 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long');
  end if;

  insert into cash_banking (property_id, business_date, amount_cents, note, banked_by)
  values (p_property_id, p_business_date, p_amount_cents, v_note, p_actor_id)
  returning id, banked_at into v_id, v_banked_at;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id, p_actor_id, 'cash.banked', 'cash_banking', v_id, null,
    case
      when v_note is null then jsonb_build_object(
        'business_date', p_business_date, 'amount_cents', p_amount_cents
      )
      else jsonb_build_object(
        'business_date', p_business_date, 'amount_cents', p_amount_cents, 'note', v_note
      )
    end
  );

  return jsonb_build_object(
    'ok', true, 'banking_id', v_id, 'banked_at', v_banked_at
  );
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Grants. Service-role only, like every other writer in this schema.
-- ═══════════════════════════════════════════════════════════════════════════

-- Stated explicitly, where `deposit`, `inspection` and `payment` leave it to
-- the defaults plus RLS: this is the one base table the application selects
-- from **directly** rather than through a summary view (lib/db/cash-banking.ts
-- needs no joins), so it is granted the way the views are. `select, insert`
-- and no more, which is the append-only rule said a second time — in the one
-- place a future `update` would have to get past.
revoke all on cash_banking from public, anon, authenticated;
grant select, insert on cash_banking to service_role;

revoke execute on function record_cash_banking(uuid, date, integer, text, uuid)
  from public, anon, authenticated;

grant execute on function record_cash_banking(uuid, date, integer, text, uuid) to service_role;
