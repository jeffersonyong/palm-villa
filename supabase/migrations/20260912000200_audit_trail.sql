-- ═══════════════════════════════════════════════════════════════════════════
-- The audit trail, property-wide (capability F4; prd.md §15, architecture §4).
--
-- The events have been recorded since 20260829000300 and read one record at a
-- time ever since: a booking's history, a deposit's, a unit's. F4 promises the
-- owner the *whole* trail — "every change to bookings, payments, deposits, and
-- charges, with actor and timestamp" — and that is a different question. It is
-- asked across entities ("every discount this month"), across actors ("what did
-- Aina change on Tuesday") and across time, none of which an entity-scoped read
-- can answer.
--
-- ── Why a view, and not a function ─────────────────────────────────────────
--
-- Every filter the screen offers — a date window, an action family, an actor, a
-- kind of record — is one PostgREST operator, and `count: 'exact'` rides on the
-- same request. That is the paging contract every list screen in the portal
-- already uses (listBookings, deposit_summary), including the past-the-end
-- handling lib/db/audit.ts worked out for PGRST103. A function would have to
-- take a limit and an offset and return the count separately, which is that
-- contract restated in a second place.
--
-- ── What the view adds ─────────────────────────────────────────────────────
--
-- `action_family`, so "everything about payments" is one filter rather than
-- five, and `subject_label` — what the event was ABOUT, in words a person can
-- read. A trail whose rows say `deposit_charge` and a uuid is a log; a trail
-- whose rows say `PV-0042` is a record somebody can work from.
--
-- The label is resolved by a `case` of scalar subqueries rather than by joins,
-- because each entity type reaches its name by a different path and most rows
-- need none of them. A row whose subject has since been deleted — a band that
-- was removed, a booking that cascaded — resolves to null, and the screen falls
-- back to the name in the event's own payload. That is the point of the payload
-- carrying one.
--
-- `staff_user` is deliberately NOT resolved here: those live in `auth.users`,
-- which this schema does not read from, and the screen already loads the staff
-- roster to name actors. It names subjects from the same map.
--
-- ── Indexes: none, deliberately ────────────────────────────────────────────
--
-- Every query this serves is scoped to the property and ordered by `at desc`,
-- which `audit_event_property_at_idx` (20260829000300) already answers; the
-- filters then narrow within that scan. At this property's volume — tens of
-- events a day, and a filtered window almost always in view — that is
-- milliseconds for years. The two worth adding the day it is measured slow, and
-- not before, are (property_id, actor_id, at desc) for "everything one person
-- did" and (property_id, action, at desc) for a single verb across all time.
-- Named here so the next person does not have to work out which.
-- ═══════════════════════════════════════════════════════════════════════════

create view audit_event_summary
with (security_invoker = true)
as
select
  e.id,
  e.property_id,
  e.actor_id,
  e.action,
  -- 'booking.discounted' → 'booking'. The screen filters on this so a person
  -- can ask for payments without naming all five payment verbs.
  split_part(e.action, '.', 1) as action_family,
  e.entity_type,
  e.entity_id,
  e.before,
  e.after,
  e.at,
  case e.entity_type
    when 'booking' then (select b.reference from booking b where b.id = e.entity_id)
    when 'payment' then (
      select b.reference from payment p join booking b on b.id = p.booking_id
      where p.id = e.entity_id
    )
    when 'deposit' then (
      select b.reference from deposit d join booking b on b.id = d.booking_id
      where d.id = e.entity_id
    )
    when 'deposit_charge' then (
      select b.reference
      from deposit_charge c
      join deposit d on d.id = c.deposit_id
      join booking b on b.id = d.booking_id
      where c.id = e.entity_id
    )
    when 'inspection' then (
      select b.reference
      from inspection i
      join occupancy o on o.id = i.occupancy_id
      join booking b on b.id = o.booking_id
      where i.id = e.entity_id
    )
    when 'document' then (
      select b.reference from document doc join booking b on b.id = doc.booking_id
      where doc.id = e.entity_id
    )
    when 'unit' then (select u.ref from unit u where u.id = e.entity_id)
    when 'unit_type' then (select t.name from unit_type t where t.id = e.entity_id)
    when 'staff_role' then (select r.name from staff_role r where r.id = e.entity_id)
    when 'cash_banking' then (
      select to_char(c.business_date, 'YYYY-MM-DD') from cash_banking c where c.id = e.entity_id
    )
    when 'day_pass_band' then (
      select b.label from day_pass_age_band b where b.id = e.entity_id
    )
    when 'day_pass_bundle' then (
      select d.label from day_pass_bundle d where d.id = e.entity_id
    )
    when 'facility' then (select f.name from facility f where f.id = e.entity_id)
    when 'bank_account' then (
      select a.bank_name || ' ' || a.account_number from bank_account a where a.id = e.entity_id
    )
    -- The property is the subject of a settings change and of the unit
    -- registry's summary row. Its own name is the only sensible label.
    when 'property' then (select p.name from property p where p.id = e.entity_id)
    when 'document_retention' then (select p.name from property p where p.id = e.entity_id)
    else null
  end as subject_label
from audit_event e;

comment on view audit_event_summary is
  'The audit trail with each event''s subject resolved to something readable (capability F4). A subject that has since been deleted resolves to null; the screen falls back to the name in the event payload.';

revoke all on audit_event_summary from public, anon, authenticated;
grant select on audit_event_summary to service_role;
