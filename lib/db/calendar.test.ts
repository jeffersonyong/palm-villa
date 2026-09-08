import { describe, expect, test } from 'vitest'

import { transitionBooking } from './bookings'
import { listOccupanciesInWindow } from './calendar'
import { givenBooking, givenBookingInState, givenLease, unitIdByRef } from './test/factory'
import { endUnitLease } from './units'

/**
 * The calendar's read against the real database (capability B1).
 *
 * What is worth proving is the rule, not the plumbing: the calendar draws
 * exactly what the exclusion constraint blocks. That is a wider set than the
 * occupancy report's — a hold and a draft are in, because a unit somebody is
 * holding cannot be sold — and it has to survive the two nulls the schema
 * allows: a lease with no booking, and a lease with no end.
 *
 * November 2026, well clear of the demo seed's fortnight around today.
 */

const WINDOW = { start: '2026-11-01', end: '2026-12-01' }

async function rowsFor(unitRef: string) {
  const unitId = await unitIdByRef(unitRef)
  const rows = await listOccupanciesInWindow(WINDOW)

  return rows.filter((row) => row.unitId === unitId)
}

describe('listOccupanciesInWindow', () => {
  test('returns a stay inside the window with its guest, reference and stream', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-11-05',
      checkOut: '2026-11-08',
      guestName: 'Calendar Guest',
    })

    const mine = await rowsFor('3B-01')

    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({
      status: 'confirmed',
      start: '2026-11-05',
      end: '2026-11-08',
      occupantName: 'Calendar Guest',
      booking: { reference: booking.reference, stream: 'short_stay' },
    })
  })

  test('is half-open at the start: a stay ending on the first day does not touch the month', async () => {
    await givenBooking({ unitRef: '3B-02', checkIn: '2026-10-28', checkOut: '2026-11-01' })
    await givenBooking({ unitRef: '3B-03', checkIn: '2026-10-28', checkOut: '2026-11-02' })

    expect(await rowsFor('3B-02')).toHaveLength(0)
    expect(await rowsFor('3B-03')).toMatchObject([{ start: '2026-10-28', end: '2026-11-02' }])
  })

  test('is half-open at the end: a stay starting on the day after the month does not touch it', async () => {
    await givenBooking({ unitRef: '3B-04', checkIn: '2026-11-30', checkOut: '2026-12-02' })
    await givenBooking({ unitRef: '3B-05', checkIn: '2026-12-01', checkOut: '2026-12-03' })

    expect(await rowsFor('3B-04')).toHaveLength(1)
    expect(await rowsFor('3B-05')).toHaveLength(0)
  })

  test('returns a stay that spans the whole month', async () => {
    await givenBooking({ unitRef: '3B-06', checkIn: '2026-10-20', checkOut: '2026-12-10' })

    expect(await rowsFor('3B-06')).toMatchObject([{ start: '2026-10-20', end: '2026-12-10' }])
  })

  test('returns an open-ended lease, which has no booking and no end', async () => {
    await givenLease({
      unitRef: '3B-07',
      occupantName: 'Long Tenant',
      start: '2026-10-01',
      end: null,
    })

    const mine = await rowsFor('3B-07')

    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({
      status: 'leased',
      start: '2026-10-01',
      end: null,
      occupantName: 'Long Tenant',
      booking: null,
    })
  })

  test('includes a hold and a draft — the opposite of the occupancy report', async () => {
    // A hold is not a night sold, so the report leaves it out (prd.md §14
    // [A]). It still blocks the unit — the exclusion constraint counts it —
    // and a calendar that hid it would offer a night nobody can have.
    await givenBookingInState({ unitRef: '3B-08', checkIn: '2026-11-10', checkOut: '2026-11-12' }, [
      'hold',
    ])
    await givenBookingInState(
      { unitRef: '3B-09', checkIn: '2026-11-10', checkOut: '2026-11-12' },
      [],
    )

    expect(await rowsFor('3B-08')).toMatchObject([{ status: 'held' }])
    expect(await rowsFor('3B-09')).toMatchObject([{ status: 'draft' }])
  })

  test('excludes a cancelled stay and an expired hold — the only two that free a unit', async () => {
    const cancelled = await givenBooking({
      unitRef: '3B-10',
      checkIn: '2026-11-10',
      checkOut: '2026-11-12',
    })
    await transitionBooking(cancelled.id, 'cancel')

    await givenBookingInState({ unitRef: '3B-11', checkIn: '2026-11-10', checkOut: '2026-11-12' }, [
      'hold',
      'expire',
    ])

    expect(await rowsFor('3B-10')).toHaveLength(0)
    expect(await rowsFor('3B-11')).toHaveLength(0)
  })

  test('excludes a lease that was recorded in error and unwound', async () => {
    const { occupancyId } = await givenLease({
      unitRef: '3B-12',
      start: '2026-11-03',
      end: '2027-05-01',
    })
    // An end on the start date is not an ending; the unit layer cancels the
    // lease instead (units.test.ts), and a cancelled lease holds nothing.
    await endUnitLease({ occupancyId, end: '2026-11-03', actorId: null })

    expect(await rowsFor('3B-12')).toHaveLength(0)
  })
})
