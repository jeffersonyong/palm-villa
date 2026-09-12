import type { PropertyConfig } from './config'
import type { StayDate } from './dates'

/**
 * How many places a day pass has, and who is on one (capability A3).
 *
 * Capacity and party composition are two questions that only look separate:
 * what fills a facility is bodies, and what the pricing engine charges for is
 * bands, and the number that connects them is the headcount. Keeping both here
 * means the figure the capacity check uses is the figure the receipt was built
 * from.
 */

/** A facility, as this module needs it. */
export interface FacilityHeadroom {
  slug: string
  name: string
  includedInDayPass: boolean
  /** Null means no capacity has ever been agreed — prd.md C2. */
  dayPassCapacity: number | null
}

/**
 * The ceiling that actually binds, and null when none does.
 *
 * **The smallest among the facilities the pass admits.** A pass is one product
 * that opens every included facility, so the first one to fill is the one that
 * decides; taking the largest would oversell it, and summing them would count
 * one person once per pool they could walk past.
 *
 * A facility with no capacity configured is not a capacity of zero — it is a
 * number nobody has agreed (prd.md C2, every row null today), and reading it as
 * zero would close the pass to everybody. Facilities the pass does not admit
 * are ignored: their capacity is a fact about something this product does not
 * sell.
 *
 * That this is an assumption rather than a stated rule is in the register.
 */
export function bindingCapacity(facilities: readonly FacilityHeadroom[]): number | null {
  const configured = facilities
    .filter((facility) => facility.includedInDayPass && facility.dayPassCapacity !== null)
    .map((facility) => facility.dayPassCapacity as number)

  return configured.length === 0 ? null : Math.min(...configured)
}

/** Which facility the ceiling came from, for the sentence that reports it. */
export function bindingFacility(facilities: readonly FacilityHeadroom[]): FacilityHeadroom | null {
  const capacity = bindingCapacity(facilities)

  if (capacity === null) {
    return null
  }

  return (
    facilities.find(
      (facility) => facility.includedInDayPass && facility.dayPassCapacity === capacity,
    ) ?? null
  )
}

/** Places sold and the ceiling on one date, as the database reports them. */
export interface DayHeadroom {
  date: StayDate
  /** Null means no limit is configured. */
  capacity: number | null
  taken: number
}

/**
 * Places left on a date, or null when nothing limits it.
 *
 * Never negative. A capacity lowered below what is already sold is an owner's
 * decision about tomorrow, not a reason to report a negative number of places
 * to a customer — the passes already sold stand.
 */
export function placesLeft(headroom: DayHeadroom): number | null {
  if (headroom.capacity === null) {
    return null
  }

  return Math.max(headroom.capacity - headroom.taken, 0)
}

/** True when a party of this size can still be admitted on that date. */
export function hasRoomFor(headroom: DayHeadroom, headcount: number): boolean {
  const left = placesLeft(headroom)

  return left === null || headcount <= left
}

/** A band as it was sold, kept with the pass rather than pointed at. */
export interface DayPassPartyLine {
  bandId: string
  label: string
  count: number
}

export interface DayPassPartyResult {
  ok: true
  /** Keyed by band id — what `priceDayPass` takes. */
  party: Readonly<Record<string, number>>
  /** What is written to `day_pass.party`, carrying the labels as they were. */
  snapshot: readonly DayPassPartyLine[]
  /** Bodies through the gate, whatever they paid. */
  headcount: number
  /** What the booking records, on the stay flow's meaning of the two words. */
  chargeableGuests: number
  exemptGuests: number
}

/**
 * The most guests one age band may be sold in a single booking.
 *
 * **Input validation, deliberately not capacity.** What a facility holds is
 * `dayPassCapacity`, which is unset — prd.md C2 leaves the figure to the
 * client — and this ceiling must never be read as an answer to it. It is the
 * boundary check the form already applies and the server did not: `CountField`
 * renders `max={50}` on every band, and the stay flow's schema caps its guest
 * counts at the same 50.
 *
 * Without it a submitted `1e6` was an integer, passed every check here, and
 * reached a Postgres `integer` column; far enough past it and the write fails
 * as an unhandled overflow rather than a sentence. A held pass for a hundred
 * thousand heads is also the thing that fills a capacity the day one is
 * configured, because held passes count against headroom.
 */
export const MAX_GUESTS_PER_BAND = 50

export type DayPassPartyError =
  | 'unknown_age_band'
  | 'no_guests'
  | 'negative_quantity'
  | 'too_many_guests'

export type DayPassParseResult = DayPassPartyResult | { ok: false; error: DayPassPartyError }

/**
 * Turns a form's count-per-band into everything the writers need.
 *
 * **Headcount counts everybody, including a band priced at zero.** An infant
 * admitted free still occupies a place at the pool, and a capacity that
 * ignored them would let a facility fill past its own ceiling with the
 * business's blessing. The same body is *not* a chargeable guest, which is
 * where the two figures part company: `chargeableGuests` matches the stay
 * flow's meaning — somebody the price counted — so the bookings register reads
 * one number across three streams.
 *
 * The snapshot keeps each band's label as well as its id, which is what lets a
 * pass sold to "Child 1–11" still say so after the owner renames the band. A
 * receipt describes a moment; only a door gets relabelled (prd.md §7.1).
 */
export function partyFromCounts(
  counts: Readonly<Record<string, number>>,
  config: PropertyConfig,
): DayPassParseResult {
  const party: Record<string, number> = {}
  const snapshot: DayPassPartyLine[] = []
  let headcount = 0
  let chargeableGuests = 0
  let exemptGuests = 0

  for (const [bandId, count] of Object.entries(counts)) {
    if (!Number.isInteger(count) || count < 0) {
      return { ok: false, error: 'negative_quantity' }
    }

    if (count > MAX_GUESTS_PER_BAND) {
      return { ok: false, error: 'too_many_guests' }
    }

    if (count === 0) {
      continue
    }

    const band = config.dayPassAgeBands.find((candidate) => candidate.id === bandId)

    if (!band) {
      return { ok: false, error: 'unknown_age_band' }
    }

    party[bandId] = count
    snapshot.push({ bandId, label: band.label, count })
    headcount += count

    if (band.pricePerPerson > 0) {
      chargeableGuests += count
    } else {
      exemptGuests += count
    }
  }

  if (headcount === 0) {
    return { ok: false, error: 'no_guests' }
  }

  // Sold in the order the bands are configured, so a receipt reads the way the
  // settings screen does rather than the way an object's keys happened to.
  const ordered = config.dayPassAgeBands
    .map((band) => snapshot.find((line) => line.bandId === band.id))
    .filter((line): line is DayPassPartyLine => line !== undefined)

  return { ok: true, party, snapshot: ordered, headcount, chargeableGuests, exemptGuests }
}

/** What each refusal says to a customer. */
export const DAY_PASS_PARTY_MESSAGES: Readonly<Record<DayPassPartyError, string>> = {
  unknown_age_band: 'That age group is no longer offered. Refresh the page and try again.',
  no_guests: 'Add at least one guest.',
  negative_quantity: 'Enter a number of guests.',
  too_many_guests: `For a group this size, please call us — a booking here takes up to ${MAX_GUESTS_PER_BAND} guests in each age group.`,
}
