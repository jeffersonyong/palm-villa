import { describe, expect, test } from 'vitest'

import { bnd } from '@/lib/domain/money'

import {
  createWalkInBooking,
  getBookingByReference,
  getDailySnapshot,
  listBookings,
  transitionBooking,
} from './bookings'
import { bookingInput, givenBooking, givenBookingInState } from './test/factory'
import { auditEventsFor } from './test/inspect'

/**
 * The read layer the portal's list screens sit on, against the real database.
 *
 * These assertions were written against the fixture layer to "pin the behaviour
 * the database implementation has to reproduce" — filter semantics on the
 * half-open range, sort stability, and what the daily snapshot counts. This is
 * that implementation, so they are ported rather than retired, and now run
 * against Postgres.
 */

const TODAY = '2026-08-28'

describe('listBookings', () => {
  test('returns everything when unfiltered', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })
    await givenBooking({ unitRef: '3B-02', checkIn: TODAY, checkOut: '2026-08-30' })

    expect(await listBookings()).toHaveLength(2)
  })

  test('filters by status', async () => {
    const confirmed = await givenBooking({
      unitRef: '3B-01',
      checkIn: TODAY,
      checkOut: '2026-08-30',
    })
    const doomed = await givenBooking({ unitRef: '3B-02', checkIn: TODAY, checkOut: '2026-08-30' })

    await transitionBooking(doomed.id, 'cancel')

    const cancelled = await listBookings({ status: 'cancelled' })

    expect(cancelled.map((booking) => booking.reference)).toEqual([doomed.reference])
    expect(cancelled.map((booking) => booking.reference)).not.toContain(confirmed.reference)
  })

  test('sorts by check-in, then reference', async () => {
    // Created out of order, and two share a check-in date so the second sort
    // key decides between them. References are allocated in creation order, so
    // `early` holds the lower one.
    const late = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-09-05',
      checkOut: '2026-09-07',
    })
    const early = await givenBooking({
      unitRef: '3B-02',
      checkIn: '2026-09-01',
      checkOut: '2026-09-03',
    })
    const alsoEarly = await givenBooking({
      unitRef: '3B-03',
      checkIn: '2026-09-01',
      checkOut: '2026-09-02',
    })

    const listed = await listBookings()

    expect(listed.map((booking) => booking.reference)).toEqual([
      early.reference,
      alsoEarly.reference,
      late.reference,
    ])
  })

  test('matches a stay that overlaps the filter range', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-09-01',
      checkOut: '2026-09-05',
    })

    const listed = await listBookings({ overlaps: { start: '2026-09-04', end: '2026-09-10' } })

    expect(listed.map((entry) => entry.reference)).toEqual([booking.reference])
  })

  test('excludes a stay that ends on the day the filter range starts', async () => {
    // Half-open: the guest leaves on the 5th, so they do not occupy it.
    await givenBooking({ unitRef: '3B-01', checkIn: '2026-09-01', checkOut: '2026-09-05' })

    expect(await listBookings({ overlaps: { start: '2026-09-05', end: '2026-09-08' } })).toEqual([])
  })
})

describe('getBookingByReference', () => {
  test('finds a booking by its exact reference', async () => {
    const booking = await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })

    expect((await getBookingByReference(booking.reference))?.reference).toBe(booking.reference)
  })

  test('ignores surrounding space and case, which are typing not identity', async () => {
    const booking = await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })

    const typed = `  ${booking.reference.toLowerCase()} `

    expect((await getBookingByReference(typed))?.reference).toBe(booking.reference)
  })

  test('returns null when nothing matches', async () => {
    expect(await getBookingByReference('PV-9999')).toBeNull()
  })

  test('returns the priced lines that produced the total', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-09-01',
      checkOut: '2026-09-04',
    })

    const read = await getBookingByReference(booking.reference)

    // prd.md §8: the total is always the sum of its lines, never a stored
    // figure, which is what makes a price explainable to a guest disputing it.
    expect(read?.lines).toHaveLength(1)
    expect(read?.lines[0]?.amount).toBe(bnd(600))
    expect(read?.total).toBe(bnd(600))
    expect(read?.securityDeposit).toBe(bnd(100))
  })
})

describe('getDailySnapshot', () => {
  test('counts arrivals, departures and bookings awaiting payment', async () => {
    const arriving = await givenBooking({
      unitRef: '3B-01',
      checkIn: TODAY,
      checkOut: '2026-08-31',
    })
    const leaving = await givenBooking({
      unitRef: '3B-02',
      checkIn: '2026-08-26',
      checkOut: TODAY,
    })

    await transitionBooking(leaving.id, 'check_in')

    await givenBookingInState({ unitRef: '3B-03', checkIn: TODAY, checkOut: '2026-08-30' }, [
      'hold',
      'submit_payment',
    ])

    const snapshot = await getDailySnapshot(TODAY)

    expect(snapshot.arrivals.map((booking) => booking.reference)).toEqual([arriving.reference])
    expect(snapshot.departures.map((booking) => booking.reference)).toEqual([leaving.reference])
    expect(snapshot.awaitingVerificationCount).toBe(1)
  })

  test('does not count a held unit as occupied — blocked is not occupied', async () => {
    await givenBookingInState({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-31' }, [
      'hold',
    ])

    expect((await getDailySnapshot(TODAY)).occupiedTonightCount).toBe(0)
  })

  test('counts a stay running through tonight as occupied', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-08-27',
      checkOut: '2026-08-30',
    })

    await transitionBooking(booking.id, 'check_in')

    expect((await getDailySnapshot(TODAY)).occupiedTonightCount).toBe(1)
  })

  test('does not count a guest leaving this morning as occupied tonight', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-08-26',
      checkOut: TODAY,
    })

    await transitionBooking(booking.id, 'check_in')

    expect((await getDailySnapshot(TODAY)).occupiedTonightCount).toBe(0)
  })

  test('reports the seeded unit total', async () => {
    // 36 three-bedroom + 6 four-bedroom + 6 semi-detached (prd.md §7.1). The
    // 2-bedroom count is prd.md §18 N1 and is deliberately unseeded.
    expect((await getDailySnapshot(TODAY)).totalUnits).toBe(48)
  })
})

describe('createWalkInBooking', () => {
  test('derives confirmed from the state machine, never assigns it', async () => {
    const booking = await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })

    // prd.md §9.4 [C]: the guest is present and pays immediately, so the
    // booking is created and paid in one action and never passes through
    // `held`. transition('draft', 'pay_in_full') is what produces this.
    expect(booking.status).toBe('confirmed')
  })

  test('allocates a PV- reference in the architecture.md §6.1 format', async () => {
    const booking = await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })

    expect(booking.reference).toMatch(/^PV-\d{4,}$/)
  })

  test('gives two bookings different references', async () => {
    const first = await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })
    const second = await givenBooking({ unitRef: '3B-02', checkIn: TODAY, checkOut: '2026-08-30' })

    expect(first.reference).not.toBe(second.reference)
  })

  test('reports a unit that does not exist rather than throwing', async () => {
    const result = await createWalkInBooking(
      await bookingInput({
        unitId: '00000000-0000-0000-0000-000000000000',
        checkIn: TODAY,
        checkOut: '2026-08-30',
      }),
    )

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe('unit_not_found')
  })

  test('writes an audit event for the creation', async () => {
    const booking = await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })

    // architecture.md §4: approvals and state changes are events, not flags,
    // and prd.md §15 requires every booking state change to carry an actor and
    // a timestamp. The actor is null until the auth slice supplies sessions.
    const events = await auditEventsFor(booking.id)

    expect(events.map((event) => event.action)).toEqual(['booking.created_walk_in'])
    expect(events[0]?.after).toMatchObject({ reference: booking.reference, status: 'confirmed' })
  })
})

describe('transitionBooking', () => {
  test('records the move as an audit event with both statuses', async () => {
    const booking = await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })

    await transitionBooking(booking.id, 'check_in')

    const events = await auditEventsFor(booking.id)

    expect(events.map((event) => event.action)).toEqual([
      'booking.created_walk_in',
      'booking.check_in',
    ])
    expect(events[1]?.before).toMatchObject({ status: 'confirmed' })
    expect(events[1]?.after).toMatchObject({ status: 'checked_in' })
  })

  test('refuses an illegal move and leaves the booking alone', async () => {
    const booking = await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })

    // `check_out` is only legal from `checked_in`. Returned rather than thrown:
    // this is usually two staff members acting on one booking at once, which is
    // a message on screen and not a crash.
    const result = await transitionBooking(booking.id, 'check_out')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe('illegal_transition')
    expect((await getBookingByReference(booking.reference))?.status).toBe('confirmed')
  })

  test('refuses to move a terminal booking', async () => {
    const booking = await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })

    await transitionBooking(booking.id, 'cancel')

    const result = await transitionBooking(booking.id, 'check_in')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe('terminal_state')
  })
})
