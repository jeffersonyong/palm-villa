import { describe, expect, test } from 'vitest'

import { bnd } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import {
  amendBooking,
  countBookingsByStream,
  createWalkInBooking,
  getBookingByReference,
  getDailySnapshot,
  listBookings,
  transitionBooking,
} from './bookings'
import {
  bookingInput,
  givenBooking,
  givenBookingInState,
  givenDayPassBooking,
} from './test/factory'
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

    expect((await listBookings()).bookings).toHaveLength(2)
  })

  test('filters by status', async () => {
    const confirmed = await givenBooking({
      unitRef: '3B-01',
      checkIn: TODAY,
      checkOut: '2026-08-30',
    })
    const doomed = await givenBooking({ unitRef: '3B-02', checkIn: TODAY, checkOut: '2026-08-30' })

    await transitionBooking(doomed.id, 'cancel')

    const { bookings: cancelled } = await listBookings({ statuses: ['cancelled'] })

    expect(cancelled.map((booking) => booking.reference)).toEqual([doomed.reference])
    expect(cancelled.map((booking) => booking.reference)).not.toContain(confirmed.reference)
  })

  test('filters by several statuses at once', async () => {
    const confirmed = await givenBooking({
      unitRef: '3B-01',
      checkIn: TODAY,
      checkOut: '2026-08-30',
    })
    const doomed = await givenBooking({ unitRef: '3B-02', checkIn: TODAY, checkOut: '2026-08-30' })
    const arrived = await givenBooking({ unitRef: '3B-03', checkIn: TODAY, checkOut: '2026-08-30' })

    await transitionBooking(doomed.id, 'cancel')
    await transitionBooking(arrived.id, 'check_in')

    const { bookings: listed } = await listBookings({ statuses: ['cancelled', 'checked_in'] })

    expect(listed.map((booking) => booking.reference).sort()).toEqual(
      [doomed.reference, arrived.reference].sort(),
    )
    expect(listed.map((booking) => booking.reference)).not.toContain(confirmed.reference)
  })

  test('an empty status list is no filter, not an empty screen', async () => {
    // Clearing the last chip off the filter row must show everything again.
    await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })
    await givenBooking({ unitRef: '3B-02', checkIn: TODAY, checkOut: '2026-08-30' })

    expect((await listBookings({ statuses: [] })).bookings).toHaveLength(2)
  })

  test('puts the booking taken most recently first, whatever its dates', async () => {
    // The register's front door. It sorted by check-in until it paginated, at
    // which point page 1 became the oldest bookings on record; a clerk wants
    // the one they just took. Check-in deliberately runs *against* creation
    // order here, so a test that passed on either rule cannot pass on both.
    const first = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-09-05',
      checkOut: '2026-09-07',
    })
    const second = await givenBooking({
      unitRef: '3B-02',
      checkIn: '2026-09-01',
      checkOut: '2026-09-03',
    })
    const third = await givenBooking({
      unitRef: '3B-03',
      checkIn: '2026-09-01',
      checkOut: '2026-09-02',
    })

    const { bookings: listed } = await listBookings()

    expect(listed.map((booking) => booking.reference)).toEqual([
      third.reference,
      second.reference,
      first.reference,
    ])
  })

  test('breaks a tie on reference, so no row can drift across a page boundary', async () => {
    // Two bookings created inside the same clock tick would otherwise have no
    // defined order between them, and an order that is not total lets a row
    // appear on two pages or on neither. References are allocated in creation
    // order, so descending reference agrees with descending creation.
    const created = await Promise.all([
      givenBooking({ unitRef: '3B-01', checkIn: '2026-09-01', checkOut: '2026-09-03' }),
      givenBooking({ unitRef: '3B-02', checkIn: '2026-09-01', checkOut: '2026-09-03' }),
      givenBooking({ unitRef: '3B-03', checkIn: '2026-09-01', checkOut: '2026-09-03' }),
    ])

    const descending = [...created.map((booking) => booking.reference)].sort().reverse()

    // Read twice: an unstable order is allowed to be wrong once and right the
    // next time, which is exactly the bug pagination turns into a lost row.
    expect((await listBookings()).bookings.map((entry) => entry.reference)).toEqual(descending)
    expect((await listBookings()).bookings.map((entry) => entry.reference)).toEqual(descending)
  })

  test('matches a stay that overlaps the filter range', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-09-01',
      checkOut: '2026-09-05',
    })

    const { bookings: listed } = await listBookings({
      overlaps: { start: '2026-09-04', end: '2026-09-10' },
    })

    expect(listed.map((entry) => entry.reference)).toEqual([booking.reference])
  })

  test('excludes a stay that ends on the day the filter range starts', async () => {
    // Half-open: the guest leaves on the 5th, so they do not occupy it.
    await givenBooking({ unitRef: '3B-01', checkIn: '2026-09-01', checkOut: '2026-09-05' })

    expect(
      (await listBookings({ overlaps: { start: '2026-09-05', end: '2026-09-08' } })).bookings,
    ).toEqual([])
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

/**
 * The register carries every stream (capability B1).
 *
 * `booking_summary` used to inner-join occupancy, which meant a day pass could
 * never appear in a list whose own header calls itself "every booking across
 * all streams". These pin the left join: the row is present, and everything
 * occupancy would have supplied is absent rather than invented.
 */
describe('bookings that occupy no unit', () => {
  test('a day pass appears in the list, with no unit and no dates', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })
    const dayPass = await givenDayPassBooking()

    const { bookings: listed } = await listBookings()
    const found = listed.find((booking) => booking.reference === dayPass.reference)

    expect(found).toBeDefined()
    expect(found?.stream).toBe('day_pass')
    // The four occupancy facts are one nullable object, so a screen cannot read
    // a unit reference while treating the dates as absent.
    expect(found?.stay).toBeNull()
  })

  test('takes its place in creation order like any other booking', async () => {
    // It used to need a rule of its own: sorting by check-in put a row with no
    // dates at one end of the list by accident, and `nullsFirst: false` was
    // there to decide which end. Ordering by creation retires the question —
    // every booking has a creation time, whatever it occupies.
    const dayPass = await givenDayPassBooking()
    const stay = await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })

    expect((await listBookings()).bookings.map((booking) => booking.reference)).toEqual([
      stay.reference,
      dayPass.reference,
    ])
  })

  test('a date filter excludes it, because it has no dates to match', async () => {
    // The honest answer while a day pass carries no date of its own: the filter
    // asks which stays touch these days, and a row with no dates cannot answer.
    // The day-pass slice brings a date to filter on.
    await givenDayPassBooking()

    expect(
      (await listBookings({ overlaps: { start: TODAY, end: '2026-09-30' } })).bookings,
    ).toHaveLength(0)
  })
})

describe('countBookingsByStream', () => {
  test('counts each stream, and reports zero for the ones with no writer yet', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })
    await givenBooking({ unitRef: '3B-02', checkIn: TODAY, checkOut: '2026-08-30' })
    await givenDayPassBooking()

    expect(await countBookingsByStream()).toEqual({ short_stay: 2, day_pass: 1, tenancy: 0 })
  })

  test('narrows with the same filters as the list it summarises', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })
    const doomed = await givenBooking({ unitRef: '3B-02', checkIn: TODAY, checkOut: '2026-08-30' })

    await transitionBooking(doomed.id, 'cancel')

    const filter = { statuses: ['confirmed'] } as const

    expect((await countBookingsByStream(filter)).short_stay).toBe(1)
    expect((await listBookings(filter)).bookings).toHaveLength(1)
  })

  test('ignores the stream filter, so the tiles a staff member might switch to still read', async () => {
    // These figures are how a stream is chosen. Narrowing them to the stream
    // already chosen would zero the other two and make the strip a dead end.
    await givenBooking({ unitRef: '3B-01', checkIn: TODAY, checkOut: '2026-08-30' })
    await givenDayPassBooking()

    expect(await countBookingsByStream({ streams: ['day_pass'] })).toEqual({
      short_stay: 1,
      day_pass: 1,
      tenancy: 0,
    })
  })
})

/**
 * Vehicles (prd.md §2, §13 [C], §12.5).
 *
 * A registration is required for records and security, a family may arrive in
 * several cars, and the guard's lookup at the gate is an equality match on the
 * stored string — so what goes in has to be complete, ordered, and refused when
 * it is neither a plate nor a stated exception.
 */
describe('vehicles', () => {
  test('keeps every plate on the booking, in the order they were given', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: TODAY,
      checkOut: '2026-08-30',
      vehicles: ['BAA 1234', 'BB 5678', 'CC 9012'],
    })

    expect((await getBookingByReference(booking.reference))?.vehicles).toEqual([
      'BAA 1234',
      'BB 5678',
      'CC 9012',
    ])
  })

  test('records the no-vehicle exception as an assertion, not an absence', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: TODAY,
      checkOut: '2026-08-30',
      noVehicle: true,
    })

    const stored = await getBookingByReference(booking.reference)

    // The two are different facts: "no car" versus "nobody asked". Only the
    // flag distinguishes them, because both hold an empty list.
    expect(stored?.vehicles).toEqual([])
    expect(stored?.noVehicle).toBe(true)
  })

  test('refuses a booking that records neither a plate nor the exception', async () => {
    // The application checks this too, but the database is what makes it true
    // of every writer — including one added later that forgets.
    await expect(
      createWalkInBooking(
        await bookingInput({
          unitRef: '3B-01',
          checkIn: TODAY,
          checkOut: '2026-08-30',
          vehicles: [],
        }),
      ),
    ).rejects.toThrow(/vehicle registration/)
  })

  test('an amendment replaces the whole set rather than adding to it', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: TODAY,
      checkOut: '2026-08-30',
      vehicles: ['BAA 1234', 'BB 5678'],
    })

    const current = await getBookingByReference(booking.reference)

    const result = await amendBooking({
      bookingId: booking.id,
      expectedUpdatedAt: current!.updatedAt,
      unitId: current!.stay!.unitId,
      range: current!.stay!.range,
      guestName: current!.guestName,
      guestPhone: current!.guestPhone,
      discount: current!.discount,
      // The family turned up in one car, not two.
      vehicles: ['BB 5678'],
      noVehicle: false,
      chargeableGuests: current!.chargeableGuests,
      exemptGuests: current!.exemptGuests,
      lines: current!.lines.map((entry) => ({ ...entry })),
      total: current!.total,
      securityDeposit: current!.securityDeposit,
      reason: null,
      actorId: null,
    })

    expect(result.ok).toBe(true)
    expect((await getBookingByReference(booking.reference))?.vehicles).toEqual(['BB 5678'])
  })

  test('records the plates on the creation audit event', async () => {
    // prd.md §13 [C] makes these a record-keeping requirement, so a later
    // dispute about which car was declared has an answer in the trail.
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: TODAY,
      checkOut: '2026-08-30',
      vehicles: ['BAA 1234'],
    })

    const [created] = await auditEventsFor(booking.id)

    expect(created?.after).toMatchObject({ vehicles: ['BAA 1234'], no_vehicle: false })
  })
})

/**
 * Paging the register (capability B1).
 *
 * The list is fetched a page at a time rather than sliced in the browser, so
 * these pin the two things that separates it from the Staff tab's client-side
 * slice: only one page of rows crosses the wire, and `total` counts what the
 * filter matched rather than what the page returned.
 */
describe('listBookings pagination', () => {
  /** Five bookings, newest first, so a page boundary lands inside them. */
  async function givenFiveBookings(): Promise<readonly string[]> {
    const created: string[] = []

    for (const unitRef of ['3B-01', '3B-02', '3B-03', '3B-04', '3B-05']) {
      const booking = await givenBooking({ unitRef, checkIn: TODAY, checkOut: '2026-08-30' })

      created.push(booking.reference)
    }

    // Newest taken first is the register's order.
    return [...created].reverse()
  }

  test('returns only the rows on the page, and the total behind them', async () => {
    const newestFirst = await givenFiveBookings()

    const first = await listBookings({}, { page: 1, pageSize: 2 })

    expect(first.bookings.map((booking) => booking.reference)).toEqual(newestFirst.slice(0, 2))
    // The count is what the filter matched, not what came back — it is the
    // footer's denominator and what decides how many pages exist.
    expect(first.total).toBe(5)
  })

  test('walks pages without repeating or dropping a booking', async () => {
    const newestFirst = await givenFiveBookings()

    const pages = await Promise.all([
      listBookings({}, { page: 1, pageSize: 2 }),
      listBookings({}, { page: 2, pageSize: 2 }),
      listBookings({}, { page: 3, pageSize: 2 }),
    ])

    expect(pages.flatMap((page) => page.bookings.map((entry) => entry.reference))).toEqual(
      newestFirst,
    )
    // The last page is short rather than padded.
    expect(pages[2]?.bookings).toHaveLength(1)
  })

  test('counts what the filter matched, not the whole table', async () => {
    await givenFiveBookings()
    const doomed = await givenBooking({ unitRef: '3B-06', checkIn: TODAY, checkOut: '2026-08-30' })

    await transitionBooking(doomed.id, 'cancel')

    const page = await listBookings({ statuses: ['cancelled'] }, { page: 1, pageSize: 2 })

    expect(page.total).toBe(1)
    expect(page.bookings.map((booking) => booking.reference)).toEqual([doomed.reference])
  })

  test('a page past the end comes back empty rather than erroring', async () => {
    // What a bookmarked `?page=7` does once the rows beneath it are gone. The
    // screen clamps against `total` and re-reads; the query layer's job is
    // only to answer without throwing.
    await givenFiveBookings()

    const page = await listBookings({}, { page: 9, pageSize: 2 })

    expect(page.bookings).toEqual([])
    expect(page.total).toBe(5)
  })

  test('omitting the page returns everything, which is what the tests use', async () => {
    await givenFiveBookings()

    const all = await listBookings()

    expect(all.bookings).toHaveLength(5)
    expect(all.total).toBe(5)
  })
})

/**
 * The reference format, pinned at the boundary that broke it.
 *
 * `next_booking_reference()` used `lpad(v::text, 4, '0')`, which pads a short
 * value and **truncates a long one** — so from 10000 onward ten consecutive
 * counter values produced the same reference and the unique constraint refused
 * nine of every ten bookings. The migration that introduced it promised the
 * opposite in its own comment.
 *
 * These test the formatting directly rather than through a booking, which is
 * the point of it being a separate function: reaching 10000 through
 * `createWalkInBooking` would mean ten thousand bookings, and the harness
 * speaks PostgREST rather than SQL so it cannot move the sequence.
 */
describe('booking_reference_for', () => {
  async function referenceFor(value: number): Promise<string> {
    const { data, error } = await dataClient().rpc('booking_reference_for', { p_value: value })

    if (error) {
      throw new Error(`Could not format reference for ${value}: ${error.message}`)
    }

    return data as string
  }

  test('pads to four digits, the shape staff quote at the gate', async () => {
    expect(await referenceFor(1)).toBe('PV-0001')
    expect(await referenceFor(821)).toBe('PV-0821')
    expect(await referenceFor(4821)).toBe('PV-4821')
    expect(await referenceFor(9999)).toBe('PV-9999')
  })

  test('grows past four digits rather than truncating', async () => {
    // The bug: lpad('10000', 4, '0') is '1000'.
    expect(await referenceFor(10000)).toBe('PV-10000')
    expect(await referenceFor(99999)).toBe('PV-99999')
  })

  test('never gives two counter values the same reference', async () => {
    // The ten that used to collapse onto PV-1000, plus the value either side
    // of the boundary. A reference identifies exactly one booking, forever
    // (architecture.md §6.1), and the sequence is the only thing guaranteeing
    // it — so the formatting must not throw that guarantee away.
    const values = [9999, 10000, 10001, 10002, 10003, 10009, 10010]
    const references = await Promise.all(values.map(referenceFor))

    expect(new Set(references).size).toBe(values.length)
  })
})
