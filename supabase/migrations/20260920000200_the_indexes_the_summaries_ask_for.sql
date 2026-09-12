-- Indexes for the lookups that had none.
--
-- ── The shape of the problem ────────────────────────────────────────────────
--
-- Every child table here is indexed with `property_id` first, which is right
-- for the convention architecture.md §5.1 sets: every table carries it and
-- every query scopes by it. But the three summary views do not scope their
-- laterals that way — they cannot, because a lateral joins to the parent row
-- it is already inside:
--
--   booking_summary   where bl.booking_id = b.id            (booking_line)
--                     where bv.booking_id = b.id            (booking_vehicle)
--                     where p.booking_id = b.id and p.status = 'verified'
--   payment_summary   where other_payment.booking_id = b.id and ... = 'verified'
--   deposit_summary   where dc.deposit_id = d.id and dc.waived_at is null
--
-- A predicate on `booking_id` alone cannot use a btree led by `property_id`:
-- Postgres 17 has no skip scan. So each of those laterals is a sequential scan
-- of the child table, re-executed once per parent row. The register reads a
-- page of 25 bookings and also asks for `count: 'exact'`, which evaluates the
-- laterals across the whole filtered set — so the cost is not bounded by the
-- page size.
--
-- It is milliseconds at today's volumes and that is the honest reading. What
-- makes it worth fixing now rather than later is that it gets worse with the
-- square of the building's history rather than with its size, and an index is
-- the cheapest thing in this repository to add.
--
-- Partial where the lateral is partial: a verified payment and a live charge
-- are the only rows those two sums ever look at, and the smaller index is also
-- the one whose predicate the planner can prove matches.
--
-- ── The two foreign keys with no index ──────────────────────────────────────
--
-- `audit_event.actor_id` and `booking.guest_id` are both referencing columns
-- with nothing leading on them. An unindexed FK makes the parent's delete
-- check a full scan of the child, and `audit_event` is the fastest-growing
-- table here — every action, every document opened, every email.
--
-- `audit_event.actor_id` has a second reader, and it is the one that hurts:
-- deleteStaffAccount() counts an account's history before allowing a delete
-- (lib/db/staff.ts), filtering on `actor_id` and nothing else. That is a full
-- scan of the audit trail on every attempt. `at desc` is carried as the second
-- column so the audit screen's who-filter gets its ordering from the same
-- index; it is deliberately not led by `property_id`, because the count that
-- needs it most does not filter on one.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The summary views' laterals.
-- ═══════════════════════════════════════════════════════════════════════════

create index booking_line_booking_idx on booking_line (booking_id);

create index booking_vehicle_booking_idx on booking_vehicle (booking_id);

create index payment_booking_verified_idx on payment (booking_id)
  where status = 'verified';

create index deposit_charge_live_idx on deposit_charge (deposit_id)
  where waived_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The foreign keys.
-- ═══════════════════════════════════════════════════════════════════════════

create index audit_event_actor_idx on audit_event (actor_id, at desc);

create index booking_guest_idx on booking (property_id, guest_id);
