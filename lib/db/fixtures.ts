import type { DateRange } from '@/lib/domain/availability'
import type { BookingLine } from '@/lib/domain/lines'
import type { Cents } from '@/lib/domain/money'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEMPORARY. THIS FILE IS NOT A DATABASE AND IS DELETED BY THE SCHEMA SLICE.
 *
 * Inventory and bookings live in module scope so the walk-in booking form can
 * be built and demonstrated before the Supabase schema exists. Everything here
 * resets when the dev server restarts, and nothing here is shared between
 * processes — two browser tabs on one dev server share it, a deployed instance
 * would not.
 *
 * ── The part that matters ──────────────────────────────────────────────────
 *
 * `findClashingRanges` below refuses overlapping bookings so the form behaves
 * correctly on screen. THAT IS A DEMO STAND-IN, NOT CAPABILITY G1.
 *
 * prd.md §15 and architecture.md §5.2 both require double booking to be made
 * impossible by a GiST exclusion constraint in Postgres, and explicitly not by
 * application logic — because application logic loses the race when two staff
 * members submit at the same instant, which is exactly when it matters. G1 is
 * promised to the client in writing (scope-of-capabilities.md).
 *
 * Until the schema slice lands, G1 IS NOT DELIVERED. Do not treat a passing
 * overlap check here as evidence that it is.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface UnitFixture {
  id: string
  /** Human-facing unit reference, e.g. `3B-04`. */
  ref: string
  unitTypeId: string
}

export interface BookingFixture {
  id: string
  /** Human-readable payment reference, `PV-` + 4 digits (architecture.md §6.1). */
  reference: string
  unitId: string
  range: DateRange
  status: 'confirmed'
  guestName: string
  guestPhone: string
  vehicleRegistration: string | null
  chargeableGuests: number
  exemptGuests: number
  lines: readonly BookingLine[]
  total: Cents
  securityDeposit: Cents
  createdAt: string
}

/**
 * Unit counts from prd.md §7.1.
 *
 * TODO(client): prd.md §18 N1 — the number of 2-bedroom units is unknown, and
 * assumption A2 has the 48-unit total excluding them. Seeded as 4 purely so the
 * type is bookable in the demo. This number is invented and must not survive
 * into the seed script.
 */
const UNIT_COUNTS: Readonly<Record<string, number>> = {
  'two-bedroom': 4,
  'three-bedroom': 36,
  'four-bedroom': 6,
  'semi-detached': 6,
}

/**
 * Reference prefixes.
 *
 * TODO(client): the building's real unit numbering is unknown — nothing in the
 * PRD records how units are labelled on the doors. These are generated so the
 * form has something to display and to distinguish units by; they are not the
 * client's references.
 */
const REF_PREFIX: Readonly<Record<string, string>> = {
  'two-bedroom': '2B',
  'three-bedroom': '3B',
  'four-bedroom': '4B',
  'semi-detached': 'SD',
}

function buildUnits(): UnitFixture[] {
  return Object.entries(UNIT_COUNTS).flatMap(([unitTypeId, count]) =>
    Array.from({ length: count }, (_unused, index) => {
      const number = String(index + 1).padStart(2, '0')
      const ref = `${REF_PREFIX[unitTypeId] ?? 'U'}-${number}`

      return { id: `${unitTypeId}-${number}`, ref, unitTypeId }
    }),
  )
}

/** The unit registry. Fixed for the lifetime of the process. */
export const units: readonly UnitFixture[] = buildUnits()

/** Bookings created during this dev session. Lost on restart. */
const bookings: BookingFixture[] = []

export function allBookings(): readonly BookingFixture[] {
  return bookings
}

/**
 * Ranges already booked on a unit.
 *
 * See the file header: this is the demo stand-in for the database exclusion
 * constraint, not the constraint itself.
 */
export function bookedRangesFor(unitId: string): readonly DateRange[] {
  return bookings.filter((booking) => booking.unitId === unitId).map((booking) => booking.range)
}

export function addBooking(booking: BookingFixture): void {
  bookings.push(booking)
}

/**
 * Allocates the next booking reference.
 *
 * architecture.md §6.1: `PV-` plus a 4-digit number, unique per property, short
 * enough to type into a bank transfer description. Sequential here because a
 * counter is the obvious fixture; the real implementation needs uniqueness
 * under concurrency, which is a database concern.
 */
export function nextReference(): string {
  return `PV-${String(4821 + bookings.length).padStart(4, '0')}`
}

/** Clears the store. Test-only. */
export function resetBookings(): void {
  bookings.length = 0
}
