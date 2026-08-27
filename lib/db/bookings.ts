import { isFree, type DateRange } from '@/lib/domain/availability'
import { transition } from '@/lib/domain/booking-state'
import { palmVillaConfig, type PropertyConfig } from '@/lib/domain/config'
import type { BookingLine } from '@/lib/domain/lines'
import type { Cents } from '@/lib/domain/money'

import { addBooking, bookedRangesFor, nextReference, units, type BookingFixture } from './fixtures'
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

export interface AvailableUnit extends Unit {
  available: boolean
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
    range: input.range,
    status: created.status as 'confirmed',
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
