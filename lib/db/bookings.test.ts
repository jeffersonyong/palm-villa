import { beforeEach, describe, expect, test } from 'vitest'

import { bnd } from '@/lib/domain/money'

import { getBookingByReference, getDailySnapshot, listBookings } from './bookings'
import { addBooking, resetBookings, type BookingFixture } from './fixtures'

/**
 * The read layer the portal's list screens sit on. Fixture-backed for now, so
 * these tests pin the behaviour the Supabase implementation has to reproduce:
 * filter semantics, sort stability, and what the daily snapshot counts.
 */

const TODAY = '2026-08-28'

function booking(overrides: Partial<BookingFixture> & { reference: string }): BookingFixture {
  return {
    id: `booking-${overrides.reference}`,
    unitId: 'three-bedroom-01',
    unitRef: '3B-01',
    range: { start: TODAY, end: '2026-08-30' },
    status: 'confirmed',
    guestName: 'Test Guest',
    guestPhone: '+673 000 0000',
    vehicleRegistration: null,
    chargeableGuests: 2,
    exemptGuests: 0,
    lines: [],
    total: bnd(400),
    securityDeposit: bnd(100),
    createdAt: `${TODAY}T00:00:00.000Z`,
    ...overrides,
  }
}

beforeEach(() => {
  resetBookings()
})

describe('listBookings', () => {
  test('returns everything when unfiltered', async () => {
    addBooking(booking({ reference: 'PV-0001' }))
    addBooking(booking({ reference: 'PV-0002' }))

    expect(await listBookings()).toHaveLength(2)
  })

  test('filters by status', async () => {
    addBooking(booking({ reference: 'PV-0001', status: 'confirmed' }))
    addBooking(booking({ reference: 'PV-0002', status: 'cancelled' }))

    const cancelled = await listBookings({ status: 'cancelled' })

    expect(cancelled.map((b) => b.reference)).toEqual(['PV-0002'])
  })

  test('sorts by check-in, then reference', async () => {
    addBooking(booking({ reference: 'PV-0003', range: { start: '2026-09-05', end: '2026-09-07' } }))
    addBooking(booking({ reference: 'PV-0002', range: { start: '2026-09-01', end: '2026-09-03' } }))
    addBooking(booking({ reference: 'PV-0001', range: { start: '2026-09-01', end: '2026-09-02' } }))

    const listed = await listBookings()

    expect(listed.map((b) => b.reference)).toEqual(['PV-0001', 'PV-0002', 'PV-0003'])
  })

  test('matches a stay that overlaps the filter range', async () => {
    addBooking(booking({ reference: 'PV-0001', range: { start: '2026-09-01', end: '2026-09-05' } }))

    const listed = await listBookings({ overlaps: { start: '2026-09-04', end: '2026-09-10' } })

    expect(listed.map((b) => b.reference)).toEqual(['PV-0001'])
  })

  test('excludes a stay that ends on the day the filter range starts', async () => {
    // Half-open: the guest leaves on the 5th, so they do not occupy it.
    addBooking(booking({ reference: 'PV-0001', range: { start: '2026-09-01', end: '2026-09-05' } }))

    expect(await listBookings({ overlaps: { start: '2026-09-05', end: '2026-09-08' } })).toEqual([])
  })
})

describe('getBookingByReference', () => {
  test('finds a booking by its exact reference', async () => {
    addBooking(booking({ reference: 'PV-4821' }))

    expect((await getBookingByReference('PV-4821'))?.reference).toBe('PV-4821')
  })

  test('ignores surrounding space and case, which are typing not identity', async () => {
    addBooking(booking({ reference: 'PV-4821' }))

    expect((await getBookingByReference('  pv-4821 '))?.reference).toBe('PV-4821')
  })

  test('returns null when nothing matches', async () => {
    expect(await getBookingByReference('PV-9999')).toBeNull()
  })
})

describe('getDailySnapshot', () => {
  test('counts arrivals, departures and bookings awaiting payment', async () => {
    addBooking(
      booking({
        reference: 'PV-0001',
        status: 'confirmed',
        range: { start: TODAY, end: '2026-08-31' },
      }),
    )
    addBooking(
      booking({
        reference: 'PV-0002',
        status: 'checked_in',
        range: { start: '2026-08-26', end: TODAY },
      }),
    )
    addBooking(booking({ reference: 'PV-0003', status: 'awaiting_payment_verification' }))

    const snapshot = await getDailySnapshot(TODAY)

    expect(snapshot.arrivals.map((b) => b.reference)).toEqual(['PV-0001'])
    expect(snapshot.departures.map((b) => b.reference)).toEqual(['PV-0002'])
    expect(snapshot.awaitingVerificationCount).toBe(1)
  })

  test('does not count a held unit as occupied — blocked is not occupied', async () => {
    addBooking(
      booking({ reference: 'PV-0001', status: 'held', range: { start: TODAY, end: '2026-08-31' } }),
    )

    expect((await getDailySnapshot(TODAY)).occupiedTonightCount).toBe(0)
  })

  test('counts a stay running through tonight as occupied', async () => {
    addBooking(
      booking({
        reference: 'PV-0001',
        status: 'checked_in',
        range: { start: '2026-08-27', end: '2026-08-30' },
      }),
    )

    expect((await getDailySnapshot(TODAY)).occupiedTonightCount).toBe(1)
  })

  test('does not count a guest leaving this morning as occupied tonight', async () => {
    addBooking(
      booking({
        reference: 'PV-0001',
        status: 'checked_in',
        range: { start: '2026-08-26', end: TODAY },
      }),
    )

    expect((await getDailySnapshot(TODAY)).occupiedTonightCount).toBe(0)
  })
})
