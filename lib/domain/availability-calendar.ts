import { type DateRange, nightsIn, overlaps } from './availability'
import { addDays, nightsBetween, type StayDate } from './dates'

/**
 * How many units of each type are free on each night (capability A1).
 *
 * The portal answers availability one question at a time — "is this unit free
 * for these dates" — because a clerk already has the dates. A customer does
 * not: they are choosing the dates, and the calendar has to say what is free
 * before they have picked anything. So this reads the same occupancy facts the
 * tape chart does and pivots them the other way, into a count per night.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS NOT THE DOUBLE-BOOKING CONTROL EITHER.
 *
 * `availability.ts` says it for the portal and it is just as true here: what
 * this module produces is a picture, and a picture can be out of date by the
 * time somebody clicks. The exclusion constraint refuses the second booking
 * (architecture.md §5.2, capability G1), and `create_public_stay_booking()`
 * walks its candidates against that refusal rather than against this count.
 *
 * What this owes the constraint is agreement at the edges, so a night drawn as
 * free is a night the database will actually sell:
 *
 *   - the same status rule — everything except `expired`, `cancelled` and
 *     `no_show` occupies a unit, a `held` night included;
 *   - the same half-open nights, so a stay `[14, 16)` takes the 14th and the
 *     15th and leaves the 16th free for the next guest;
 *   - the same treatment of a lease with no end date (N19), which occupies
 *     every night from its start onward.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A unit, as this module needs it. */
export interface CalendarUnit {
  id: string
  unitTypeSlug: string
  /** False when the unit is out of service — it can be sold to nobody. */
  serviceable: boolean
}

/**
 * An occupancy, as this module needs it.
 *
 * `end` is nullable for the open-ended lease N19 allows, and every comparison
 * below has to survive that null — the trap `available_units()` and
 * `unit_state()` were both bitten by once.
 */
export interface CalendarOccupancyRange {
  unitId: string
  start: StayDate
  end: StayDate | null
  status: string
}

/**
 * The statuses that release a unit. Everything else holds it.
 *
 * The same list the exclusion constraint's `where` carries, and every SQL
 * reader that repeats it (supabase/migrations/20260922000100). `no_show`
 * joined on 22 September 2026: a guest who never came releases the rest of
 * their nights, so tonight can be sold again (prd.md §9.5).
 */
const RELEASING_STATUSES: readonly string[] = ['expired', 'cancelled', 'no_show']

export function occupiesUnit(status: string): boolean {
  return !RELEASING_STATUSES.includes(status)
}

/** How many units of each type exist, ignoring what is booked. */
export function unitsByType(units: readonly CalendarUnit[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()

  for (const unit of units) {
    if (!unit.serviceable) {
      continue
    }

    counts.set(unit.unitTypeSlug, (counts.get(unit.unitTypeSlug) ?? 0) + 1)
  }

  return counts
}

/**
 * Free units per type, per night, across a half-open window.
 *
 * Built by counting what is *taken* and subtracting, rather than by testing
 * each unit against each night: a month of forty-eight units is fifteen
 * hundred cells, and the occupancies covering them are a few dozen.
 *
 * A unit out of service is out of both figures — it is neither free nor taken,
 * it is not inventory. That differs from the occupancy report, which keeps it
 * in the denominator so a building that broke down does not look fuller than
 * one that did not; the difference is deliberate, because that report measures
 * how the property did and this one answers what somebody can buy.
 */
export function nightlyFreeCounts(input: {
  window: DateRange
  units: readonly CalendarUnit[]
  occupancies: readonly CalendarOccupancyRange[]
}): ReadonlyMap<StayDate, ReadonlyMap<string, number>> {
  const { window, units, occupancies } = input

  const typeOfUnit = new Map(units.map((unit) => [unit.id, unit]))
  const totals = unitsByType(units)

  // Nights taken, per type. Only the occupancies that hold a unit, and only
  // over units this property still counts as inventory.
  const taken = new Map<StayDate, Map<string, number>>()

  for (const occupancy of occupancies) {
    if (!occupiesUnit(occupancy.status)) {
      continue
    }

    const unit = typeOfUnit.get(occupancy.unitId)

    if (!unit || !unit.serviceable) {
      continue
    }

    // An open-ended lease runs to the end of the window and beyond; clipping
    // it here is what `daterange(start, null)` does in the database.
    const end = occupancy.end ?? window.end
    const range: DateRange = { start: occupancy.start, end }

    if (!overlaps(range, window)) {
      continue
    }

    const from = occupancy.start > window.start ? occupancy.start : window.start
    const to = end < window.end ? end : window.end

    for (const night of nightsIn({ start: from, end: to })) {
      const row = taken.get(night) ?? new Map<string, number>()

      row.set(unit.unitTypeSlug, (row.get(unit.unitTypeSlug) ?? 0) + 1)
      taken.set(night, row)
    }
  }

  const free = new Map<StayDate, ReadonlyMap<string, number>>()

  for (const night of nightsIn(window)) {
    const row = new Map<string, number>()
    const takenTonight = taken.get(night)

    for (const [slug, total] of totals) {
      row.set(slug, Math.max(total - (takenTonight?.get(slug) ?? 0), 0))
    }

    free.set(night, row)
  }

  return free
}

/** How many units of a type are free on one night. Zero for a night nobody counted. */
export function freeOn(
  counts: ReadonlyMap<StayDate, ReadonlyMap<string, number>>,
  night: StayDate,
  unitTypeSlug: string,
): number {
  return counts.get(night)?.get(unitTypeSlug) ?? 0
}

/**
 * The first night of a stay that has nothing free, or null when every night
 * does.
 *
 * A range is only sellable when the *same type* is free on every one of its
 * nights — a customer cannot be moved between rooms halfway through — and the
 * screen has to say which night is the problem, because "those dates are not
 * available" over a two-week range tells somebody nothing they can act on.
 *
 * It does not follow that the range is sellable when this returns null: the
 * same unit has to be free throughout, and a count of one on Monday and one on
 * Tuesday can be two different rooms. `available_units()` is what answers that,
 * and it is the query the form runs before it quotes.
 */
export function firstBlockedNight(
  range: DateRange,
  unitTypeSlug: string,
  counts: ReadonlyMap<StayDate, ReadonlyMap<string, number>>,
): StayDate | null {
  if (nightsBetween(range.start, range.end) < 1) {
    return null
  }

  for (const night of nightsIn(range)) {
    if (freeOn(counts, night, unitTypeSlug) < 1) {
      return night
    }
  }

  return null
}

/**
 * The window a public calendar may show: tonight through the last night the
 * advance rule allows.
 *
 * Half-open, like every other range here. The last *bookable* night is the day
 * before the furthest check-out, so the window ends one day past it — a
 * customer booking to the very edge of the window checks out on the last day
 * the rule allows, and `priceStay` is what refuses anything beyond it.
 */
export function publicBookingWindow(today: StayDate, maxAdvanceDays: number): DateRange {
  return { start: today, end: addDays(today, Math.max(maxAdvanceDays, 1) + 1) }
}
