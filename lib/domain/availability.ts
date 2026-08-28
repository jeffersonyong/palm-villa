import { nightsBetween, type StayDate } from './dates'

/**
 * Occupancy ranges.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS MODULE IS NOT THE DOUBLE-BOOKING CONTROL.
 *
 * prd.md §15 and architecture.md §5.2 both require that double booking be made
 * impossible by a database constraint — a GiST exclusion constraint on the
 * occupancy range — and explicitly not by application logic. That constraint is
 * capability G1 in scope-of-capabilities.md, promised to the client in writing.
 *
 * What lives here is the *query* side: deciding what to show as available, and
 * checking a candidate range before attempting a write so the guest gets a
 * sentence rather than a constraint violation. Both are conveniences layered on
 * top of the real control. When two staff members submit at the same instant,
 * the database is what refuses the second one — not this file.
 *
 * Until the schema slice lands there is no database, so nothing is currently
 * enforcing G1 at all. See lib/db/fixtures.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * A half-open date range `[start, end)`.
 *
 * Half-open is what makes back-to-back bookings legal by construction: a guest
 * checking out on the 14th and another checking in on the 14th do not overlap,
 * because the first range ends before the 14th begins. This matches the
 * `daterange(start_date, end_date, '[)')` in architecture.md §5.2 exactly — the
 * two must agree or the preview and the database will disagree at the boundary.
 */
export interface DateRange {
  start: StayDate
  end: StayDate
}

/** True when the range covers at least one night. */
export function isValidRange(range: DateRange): boolean {
  return nightsBetween(range.start, range.end) >= 1
}

/**
 * True when two half-open ranges overlap.
 *
 * Touching ranges do not overlap: `[12, 14)` and `[14, 16)` are adjacent.
 */
export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.start < b.end && b.start < a.end
}

/** True when the candidate range clears every existing range. */
export function isFree(candidate: DateRange, existing: readonly DateRange[]): boolean {
  return !existing.some((range) => overlaps(candidate, range))
}

/** Every date the range occupies — the check-out day is excluded. */
export function nightsIn(range: DateRange): StayDate[] {
  const dates: StayDate[] = []

  for (let offset = 0; offset < nightsBetween(range.start, range.end); offset += 1) {
    const date = new Date(Date.parse(`${range.start}T00:00:00Z`) + offset * 86_400_000)
    dates.push(date.toISOString().slice(0, 10))
  }

  return dates
}
