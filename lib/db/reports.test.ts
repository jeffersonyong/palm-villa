import { describe, expect, test } from 'vitest'

import { todayInBrunei } from '@/lib/domain/dates'
import { bnd } from '@/lib/domain/money'
import { clippedNights } from '@/lib/domain/reports/occupancy'
import { revenueInWindow } from '@/lib/domain/reports/revenue'

import { cancelBooking } from './close-booking'
import { verifyPayment } from './payments'
import { listOccupanciesOverlapping, listRevenuePayments } from './reports'
import {
  givenBooking,
  givenBookingInState,
  givenLease,
  givenTransferBooking,
  unitIdByRef,
} from './test/factory'

/**
 * The reporting reads against the real database (capability E5).
 *
 * The two things worth proving here are both about rows a naive query loses.
 * An open-ended lease has a null `end_date`, and a `>` comparison against null
 * is null rather than true — so the rows occupying the most nights are exactly
 * the ones a plain filter drops (architecture.md §5.2). And a payment's
 * revenue date depends on how the money arrived, so the query has to cast wide
 * enough for the domain to make that decision on real rows.
 */

const RANGE = { start: '2026-11-01', end: '2026-11-08' }
const WINDOW = { from: '2026-11-01', to: '2026-11-07' }

describe('listOccupanciesOverlapping', () => {
  test('returns a stay that touches the range', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-11-02',
      checkOut: '2026-11-05',
    })

    const rows = await listOccupanciesOverlapping(RANGE)
    const unitId = await unitIdByRef('3B-01')
    const mine = rows.filter((row) => row.unitId === unitId)

    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ status: 'confirmed', start: '2026-11-02', end: '2026-11-05' })
    expect(booking.reference).toBeTruthy()
  })

  test('returns an open-ended lease, which a plain end-date filter would drop', async () => {
    await givenLease({ unitRef: '3B-02', start: '2026-10-01', end: null })

    const unitId = await unitIdByRef('3B-02')
    const rows = await listOccupanciesOverlapping(RANGE)
    const lease = rows.find((row) => row.unitId === unitId)

    expect(lease).toMatchObject({ status: 'leased', end: null })
    // And it is counted for the whole range, having no last day of its own.
    expect(lease && clippedNights(lease, RANGE)).toBe(7)
  })

  test('excludes a stay that only touches the range at its boundary', async () => {
    await givenBooking({ unitRef: '3B-03', checkIn: '2026-10-28', checkOut: '2026-11-01' })

    const unitId = await unitIdByRef('3B-03')
    const rows = await listOccupanciesOverlapping(RANGE)

    expect(rows.some((row) => row.unitId === unitId)).toBe(false)
  })

  test('excludes a cancelled stay and a held one', async () => {
    const cancelled = await givenBooking({
      unitRef: '3B-04',
      checkIn: '2026-11-02',
      checkOut: '2026-11-05',
    })
    await cancelBooking({
      bookingId: cancelled.id,
      actorId: null,
      reason: null,
      depositOutcome: 'keep',
    })

    await givenBookingInState({ unitRef: '3B-05', checkIn: '2026-11-02', checkOut: '2026-11-05' }, [
      'hold',
    ])

    const rows = await listOccupanciesOverlapping(RANGE)
    const cancelledUnit = await unitIdByRef('3B-04')
    const heldUnit = await unitIdByRef('3B-05')

    // A hold is somebody's intention, not a night sold; a cancellation is not
    // occupancy at all (prd.md §14 [A]).
    expect(rows.some((row) => row.unitId === cancelledUnit)).toBe(false)
    expect(rows.some((row) => row.unitId === heldUnit)).toBe(false)
  })
})

describe('listRevenuePayments', () => {
  test('returns a cash payment with the stream it was taken for', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: '2026-11-02', checkOut: '2026-11-05' })

    const today = todayInBrunei()
    const payments = await listRevenuePayments({ from: today, to: today })

    // Cash is collected now, so it dates to today rather than to the stay.
    expect(payments.some((payment) => payment.stream === 'short_stay')).toBe(true)
    expect(payments.every((payment) => payment.status === 'verified')).toBe(true)
  })

  test('a verified transfer is dated by what was read off the bank', async () => {
    const { payment } = await givenTransferBooking({
      unitRef: '3B-06',
      checkIn: '2026-11-02',
      checkOut: '2026-11-05',
    })

    const verified = await verifyPayment({
      paymentId: payment.id,
      observedAmount: payment.due,
      match: 'reference',
      observedReference: payment.bookingReference,
      observedOn: '2026-11-03',
      actorId: null,
    })

    expect(verified.ok).toBe(true)

    const inWindow = await listRevenuePayments(WINDOW)

    expect(revenueInWindow(inWindow, WINDOW).map((row) => row.date)).toContain('2026-11-03')

    // And it falls out of a window the observed date is outside of, even
    // though it was verified just now.
    const elsewhere = await listRevenuePayments({ from: '2026-12-01', to: '2026-12-31' })

    expect(revenueInWindow(elsewhere, { from: '2026-12-01', to: '2026-12-31' })).toEqual([])
  })

  test('a transfer nobody has verified is not revenue', async () => {
    await givenTransferBooking({ unitRef: '3B-07', checkIn: '2026-11-02', checkOut: '2026-11-05' })

    const today = todayInBrunei()
    const payments = await listRevenuePayments({ from: today, to: today })

    expect(payments.every((payment) => payment.amount !== null)).toBe(true)
    expect(payments.some((payment) => payment.method === 'bank_transfer')).toBe(false)
  })

  test('amounts come back as cents, not as a widened sum', async () => {
    await givenBooking({ unitRef: '3B-08', checkIn: '2026-11-02', checkOut: '2026-11-05' })

    const today = todayInBrunei()
    const [payment] = await listRevenuePayments({ from: today, to: today })

    expect(payment?.amount).toBe(bnd(600))
  })
})
