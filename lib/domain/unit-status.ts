import type { BookingStatus } from './booking-state'
import type { StayDate } from './dates'

/**
 * What state a unit is in, on a given day (capability B8).
 *
 * ── Why this is a derivation and not a column ──────────────────────────────
 *
 * architecture.md §5.1 left `unit.status` out of the schema on purpose: "an
 * unread status column that availability silently ignores is worse than none."
 * Most of prd.md §6.4's lifecycle is already recorded — an occupied unit is a
 * unit with a `checked_in` occupancy over today, and the occupancy rows that
 * say so are the same rows the exclusion constraint reads. Storing the answer
 * as well would be storing a second copy of a fact, and the copy would drift.
 *
 * So only the two states that cannot be derived are stored: `out_of_service`
 * (a column pair on the unit) and the lease behind `leased_long_term` (an
 * occupancy row with no booking). Everything else is computed here.
 *
 * ── Why the rules are here and not in SQL ─────────────────────────────────
 *
 * `unit_state()` returns facts; this function turns them into a status. That
 * split is the same one architecture.md §5.3 makes for the booking state
 * machine — "no code path assigns a status without going through it" — and it
 * exists for the same reason: a `case` expression in plpgsql plus a union type
 * here would be two copies of one set of rules, and the screen and the
 * database would eventually disagree about what a unit is doing.
 *
 * Coverage here is mandatory (architecture.md §2).
 */

export type UnitStatus =
  | 'available'
  | 'held'
  | 'booked'
  | 'occupied'
  | 'leased_long_term'
  | 'out_of_service'

/**
 * The statuses in reading order: the lifecycle first, then the two facts a
 * person puts on a unit. This is the order the filter panel and the stat strip
 * render them in.
 */
export const UNIT_STATUSES = [
  'available',
  'held',
  'booked',
  'occupied',
  'leased_long_term',
  'out_of_service',
] as const satisfies readonly UnitStatus[]

/** How each status is named on screen. Singular: a badge labels one unit. */
export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  available: 'Available',
  held: 'Held',
  booked: 'Booked',
  occupied: 'Occupied',
  leased_long_term: 'Leased',
  out_of_service: 'Out of service',
}

/**
 * The two states prd.md §6.4 names that this build cannot show.
 *
 * Listed rather than omitted so the gap is documented where the statuses are,
 * not only in a document. `awaiting_inspection` and `cleaning` are written and
 * cleared by the inspection flow — capabilities C2 and C3 — which does not
 * exist yet. A board that invented them would show a state nothing can set and
 * nobody can clear, which is worse than a board that admits it cannot see the
 * difference between a unit that is clean and one that is merely empty.
 */
export const DEFERRED_UNIT_STATUSES = ['awaiting_inspection', 'cleaning'] as const

/**
 * The status of an occupancy row.
 *
 * A booking's occupancy mirrors its booking (20260829000200's trigger). A lease
 * has no booking and carries `leased`, which is deliberately absent from
 * `BookingStatus`: it is not a state any booking can be in, and the trigger
 * that mirrors booking statuses cannot produce it.
 */
export type OccupancyStatus = BookingStatus | 'leased'

export interface UnitStateFacts {
  /** Null unless someone has taken the unit out of service. */
  outOfServiceSince: StayDate | null
  /**
   * The one occupancy covering the day in question, if any.
   *
   * At most one, by construction rather than by convention: the
   * `no_overlapping_occupancy` exclusion constraint forbids two unreleased
   * occupancies over the same unit and the same day (capability G1).
   */
  covering: { status: OccupancyStatus } | null
}

/**
 * What the unit is doing, first match wins.
 *
 * Out of service outranks everything, including an occupancy, because it is a
 * statement about the unit itself rather than about who is in it — and because
 * `set_unit_out_of_service()` refuses to create that combination in the first
 * place, so seeing it means something has gone wrong and the more alarming
 * label is the useful one.
 */
export function deriveUnitStatus(facts: UnitStateFacts): UnitStatus {
  if (facts.outOfServiceSince !== null) {
    return 'out_of_service'
  }

  if (facts.covering === null) {
    return 'available'
  }

  switch (facts.covering.status) {
    case 'leased':
      return 'leased_long_term'
    case 'checked_in':
      return 'occupied'
    case 'confirmed':
      return 'booked'
    // `draft` sits with the held states rather than with available: a draft
    // occupancy still holds its slot in the exclusion constraint, so calling
    // the unit available here would put this board and available_units() into
    // disagreement about the same row.
    case 'draft':
    case 'held':
    case 'awaiting_payment_verification':
      return 'held'
    // `completed` and `no_show` fall through to available, and that is the
    // known gap rather than an oversight. An occupancy in either state whose
    // end date has not yet passed still blocks availability — this is exactly
    // the `awaiting_inspection` state prd.md §6.4 names and C2–C3 will write.
    // Until then the board says available and availability says otherwise; the
    // divergence is recorded in architecture.md §5.2 rather than papered over
    // with a seventh status nothing can clear.
    default:
      return 'available'
  }
}

/** True when the value is one of the six — for reading a URL parameter. */
export function isUnitStatus(value: string): value is UnitStatus {
  return (UNIT_STATUSES as readonly string[]).includes(value)
}

/**
 * The stat strip's figures.
 *
 * Every status appears, including the ones at zero: a tile that vanishes when
 * its count reaches zero makes the strip's width jump as the day goes on, and
 * "nothing is out of service" is information worth showing.
 */
export function countByStatus(
  statuses: readonly UnitStatus[],
): Readonly<Record<UnitStatus, number>> {
  const counts = Object.fromEntries(UNIT_STATUSES.map((status) => [status, 0])) as Record<
    UnitStatus,
    number
  >

  for (const status of statuses) {
    counts[status] += 1
  }

  return counts
}
