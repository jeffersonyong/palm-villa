import { isFree, overlaps, type DateRange } from '@/lib/domain/availability'
import { transition, type BookingStatus } from '@/lib/domain/booking-state'
import { palmVillaConfig, type PropertyConfig } from '@/lib/domain/config'
import { addDays, type StayDate } from '@/lib/domain/dates'
import type { BookingLine } from '@/lib/domain/lines'
import type { Cents } from '@/lib/domain/money'

import {
  addBooking,
  allBookings,
  bookedRangesFor,
  nextReference,
  units,
  type BookingFixture,
} from './fixtures'
import { getUnits, type Unit } from './inventory'

/**
 * Booking reads and writes.
 *
 * Backed by fixtures until the schema slice — see lib/db/fixtures.ts for what
 * that does and does not guarantee. In particular the overlap check in
 * `createWalkInBooking` is a stand-in for the database exclusion constraint and
 * NOT capability G1.
 */

export interface AvailabilityQuery {
  range: DateRange
  unitTypeId?: string
}

/**
 * Units free for the whole range.
 *
 * Half-open, so a unit whose previous booking ends on the check-in date is
 * free — same semantics as the database constraint (architecture.md §5.2).
 */
export async function findAvailableUnits(query: AvailabilityQuery): Promise<readonly Unit[]> {
  const candidates = await getUnits(query.unitTypeId)

  return candidates.filter((unit) => isFree(query.range, bookedRangesFor(unit.id)))
}

/** Availability counts per unit type, for the "3 of 36 free" summary. */
export async function countAvailableByType(range: DateRange): Promise<Record<string, number>> {
  return units.reduce<Record<string, number>>((counts, unit) => {
    if (isFree(range, bookedRangesFor(unit.id))) {
      counts[unit.unitTypeId] = (counts[unit.unitTypeId] ?? 0) + 1
    }

    return counts
  }, {})
}

export interface BookingListFilter {
  status?: BookingStatus
  /** Stays touching this half-open range, matching availability semantics. */
  overlaps?: DateRange
}

/**
 * Bookings, most imminent first.
 *
 * Sorted by check-in and then reference so the order is stable — a list that
 * reshuffles between reads is unusable for a staff member scanning it.
 */
export async function listBookings(
  filter: BookingListFilter = {},
): Promise<readonly BookingFixture[]> {
  return allBookings()
    .filter((booking) => {
      if (filter.status && booking.status !== filter.status) return false
      if (filter.overlaps && !overlaps(booking.range, filter.overlaps)) return false

      return true
    })
    .toSorted(
      (a, b) =>
        a.range.start.localeCompare(b.range.start) || a.reference.localeCompare(b.reference),
    )
}

/**
 * One booking by its human reference.
 *
 * Normalised on the way in: staff read references off a bank transfer or a
 * printout, so leading spaces and lower case are typing, not a different
 * booking.
 */
export async function getBookingByReference(reference: string): Promise<BookingFixture | null> {
  const normalised = reference.trim().toUpperCase()

  return allBookings().find((booking) => booking.reference === normalised) ?? null
}

export interface DailySnapshot {
  /** Confirmed bookings whose stay starts today. */
  arrivals: readonly BookingFixture[]
  /** Checked-in bookings whose stay ends today. */
  departures: readonly BookingFixture[]
  awaitingVerificationCount: number
  occupiedTonightCount: number
  totalUnits: number
}

/**
 * Today at a glance: who is arriving, who is leaving, what is waiting on money.
 *
 * `today` is a parameter rather than a clock read, so the snapshot is testable
 * and the caller decides which day it is asking about.
 *
 * `occupiedTonightCount` is a display figure for this screen, not the occupancy
 * definition the reports will need (prd.md §14) — held units are excluded here
 * because a unit blocked by an unpaid hold is not occupied, but a reporting
 * definition has to be agreed with the client rather than assumed from this.
 */
export async function getDailySnapshot(today: StayDate): Promise<DailySnapshot> {
  const bookings = allBookings()
  const tonight: DateRange = { start: today, end: addDays(today, 1) }

  return {
    arrivals: bookings
      .filter((booking) => booking.status === 'confirmed' && booking.range.start === today)
      .toSorted((a, b) => a.unitRef.localeCompare(b.unitRef)),
    departures: bookings
      .filter((booking) => booking.status === 'checked_in' && booking.range.end === today)
      .toSorted((a, b) => a.unitRef.localeCompare(b.unitRef)),
    awaitingVerificationCount: bookings.filter(
      (booking) => booking.status === 'awaiting_payment_verification',
    ).length,
    occupiedTonightCount: bookings.filter(
      (booking) =>
        (booking.status === 'confirmed' || booking.status === 'checked_in') &&
        overlaps(booking.range, tonight),
    ).length,
    totalUnits: units.length,
  }
}

export interface CreateWalkInBookingInput {
  unitId: string
  range: DateRange
  guestName: string
  guestPhone: string
  vehicleRegistration: string | null
  chargeableGuests: number
  exemptGuests: number
  lines: readonly BookingLine[]
  total: Cents
  securityDeposit: Cents
}

export type CreateBookingResult =
  | { ok: true; booking: BookingFixture }
  | { ok: false; error: { code: 'unit_not_found' | 'unit_unavailable'; message: string } }

/**
 * Creates a walk-in booking, already paid.
 *
 * prd.md §9.4 [C]: the guest is present and pays immediately, so the booking is
 * created and paid in a single action and never passes through `held`. The
 * status is derived by running the state machine rather than assigned, so this
 * path cannot drift from architecture.md §5.3's rule that no code sets status
 * directly.
 *
 * The real implementation does this in one transaction — booking, lines,
 * occupancy, guest and audit event together — and relies on the exclusion
 * constraint to reject a losing race. The check below cannot do that.
 */
export async function createWalkInBooking(
  input: CreateWalkInBookingInput,
  config: PropertyConfig = palmVillaConfig,
): Promise<CreateBookingResult> {
  const unit = units.find((candidate) => candidate.id === input.unitId)

  if (!unit) {
    return { ok: false, error: { code: 'unit_not_found', message: 'That unit does not exist.' } }
  }

  // Stand-in for the exclusion constraint. Re-checked here rather than trusting
  // the availability list the form was rendered from, because that list may be
  // minutes old — but this still loses a genuine race, which is the whole
  // reason the real control belongs in Postgres.
  if (!isFree(input.range, bookedRangesFor(unit.id))) {
    return {
      ok: false,
      error: {
        code: 'unit_unavailable',
        message: `${unit.ref} was booked for those dates while this form was open.`,
      },
    }
  }

  const created = transition('draft', 'pay_in_full')

  if (!created.ok) {
    throw new Error(`Walk-in transition rejected: ${created.error.message}`)
  }

  const booking: BookingFixture = {
    id: `booking-${Date.now()}-${unit.id}`,
    reference: nextReference(),
    unitId: unit.id,
    unitRef: unit.ref,
    range: input.range,
    status: created.status,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    vehicleRegistration: input.vehicleRegistration,
    chargeableGuests: input.chargeableGuests,
    exemptGuests: input.exemptGuests,
    lines: input.lines,
    total: input.total,
    securityDeposit: input.securityDeposit ?? config.securityDeposit,
    createdAt: new Date().toISOString(),
  }

  addBooking(booking)

  return { ok: true, booking }
}
