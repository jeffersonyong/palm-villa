import { describe, expect, test } from 'vitest'

import { balanceOf } from '@/lib/domain/balance'
import { line, totalOf } from '@/lib/domain/lines'
import { bnd } from '@/lib/domain/money'

import { amendBooking, getBookingById } from './bookings'
import {
  listPaymentsForBooking,
  recordCashPayment,
  recordTransferPayment,
  verifyPayment,
} from './payments'
import { givenBooking, givenTransferBooking } from './test/factory'
import { auditEventsFor } from './test/inspect'

/**
 * Settling what an amendment leaves outstanding, against the real database
 * (capability B13).
 *
 * The scenario in full, because it is the one that exposed the gap: a guest
 * transfers for one night, the transfer is verified, they decide to stay a
 * second night, and the booking is repriced. Before this slice the difference
 * could be neither named nor collected — cash demanded a written override for
 * the ordinary case, and a second bank transfer had no write path at all.
 */

const CHECK_IN = '2026-10-12'
const ONE_NIGHT = '2026-10-13'
const TWO_NIGHTS = '2026-10-14'
const NIGHTLY_RATE = bnd(200)

/** Lines priced the way the factory prices them. */
function nightsOf(nights: number) {
  const lines = [line('accommodation', `${nights} nights`, nights, NIGHTLY_RATE)]

  return { lines, total: totalOf(lines) }
}

/** Stretches a booking to `checkOut`, repriced, through the real amend path. */
async function extend(bookingId: string, checkOut: string, nights: number) {
  const booking = await getBookingById(bookingId)

  if (!booking?.stay) {
    throw new Error(`Test setup lost booking ${bookingId}.`)
  }

  return amendBooking({
    bookingId,
    expectedUpdatedAt: booking.updatedAt,
    unitId: booking.stay.unitId,
    range: { start: booking.stay.range.start, end: checkOut },
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    vehicles: booking.vehicles,
    noVehicle: booking.noVehicle,
    chargeableGuests: booking.chargeableGuests,
    exemptGuests: booking.exemptGuests,
    securityDeposit: booking.securityDeposit,
    discount: booking.discount,
    reason: 'Guest extended by a night.',
    actorId: null,
    ...nightsOf(nights),
  })
}

/** A booking paid in full by transfer, then extended by a night. */
async function givenExtendedAfterPaying(unitRef: string) {
  const { booking, payment } = await givenTransferBooking({
    unitRef,
    checkIn: CHECK_IN,
    checkOut: ONE_NIGHT,
  })

  const verified = await verifyPayment({
    paymentId: payment.id,
    observedAmount: NIGHTLY_RATE,
    match: 'reference',
    actorId: null,
  })

  expect(verified.ok).toBe(true)

  const amended = await extend(booking.id, TWO_NIGHTS, 2)

  expect(amended.ok).toBe(true)

  return booking
}

describe('what a booking owes', () => {
  test('is nothing until something is verified', async () => {
    // Arrange — a transfer booking has a pending payment and nothing banked.
    const { booking } = await givenTransferBooking({
      unitRef: '3B-01',
      checkIn: CHECK_IN,
      checkOut: ONE_NIGHT,
    })

    // Act
    const read = await getBookingById(booking.id)

    // Assert — a promised transfer counts for nothing.
    expect(read?.paid).toBe(0)
    expect(balanceOf(read!.total, read!.paid).outstanding).toBe(NIGHTLY_RATE)
  })

  test('a cash walk-in is settled the moment it is created', async () => {
    const booking = await givenBooking({
      unitRef: '3B-02',
      checkIn: CHECK_IN,
      checkOut: ONE_NIGHT,
    })

    const read = await getBookingById(booking.id)

    expect(read?.paid).toBe(NIGHTLY_RATE)
    expect(balanceOf(read!.total, read!.paid).state).toBe('settled')
  })

  test('an amendment that adds a night leaves the difference outstanding', async () => {
    const booking = await givenExtendedAfterPaying('3B-03')

    const read = await getBookingById(booking.id)

    expect(read?.total).toBe(bnd(400))
    expect(read?.paid).toBe(bnd(200))
    expect(balanceOf(read!.total, read!.paid).outstanding).toBe(bnd(200))
    // The booking is still confirmed. Owing money is not a status.
    expect(read?.status).toBe('confirmed')
  })
})

describe('settling the difference in cash', () => {
  test('takes the outstanding figure without asking for a reason', async () => {
    // The whole point. Before the balance existed this was compared against
    // the booking total, so settling BND 200 of a BND 400 booking demanded a
    // written override — B5's short-payment flag firing on the ordinary case.
    const booking = await givenExtendedAfterPaying('3B-04')

    const result = await recordCashPayment({
      bookingId: booking.id,
      amount: bnd(200),
      actorId: null,
    })

    expect(result.ok).toBe(true)

    const read = await getBookingById(booking.id)

    expect(balanceOf(read!.total, read!.paid).state).toBe('settled')
  })

  test('still asks why when the notes do not add up to what is owed', async () => {
    const booking = await givenExtendedAfterPaying('3B-05')

    const short = await recordCashPayment({
      bookingId: booking.id,
      amount: bnd(150),
      actorId: null,
    })

    expect(short.ok).toBe(false)
    if (short.ok) return
    expect(short.error.code).toBe('reason_required')
    // The figure it quotes back is the balance, not the booking total.
    expect(short.error.dueCents).toBe(bnd(200))
  })

  test('records the payment against what was outstanding, not the whole booking', async () => {
    const booking = await givenExtendedAfterPaying('3B-06')

    await recordCashPayment({ bookingId: booking.id, amount: bnd(200), actorId: null })

    const payments = await listPaymentsForBooking(booking.id)
    const settlement = payments.find((payment) => payment.method === 'cash')

    expect(settlement?.expected).toBe(bnd(200))
    expect(settlement?.amount).toBe(bnd(200))
  })
})

describe('settling the difference by bank transfer', () => {
  test('raises a pending payment for the outstanding figure, and moves nothing yet', async () => {
    const booking = await givenExtendedAfterPaying('3B-07')

    const raised = await recordTransferPayment({ bookingId: booking.id, actorId: null })

    expect(raised.ok).toBe(true)
    if (!raised.ok) return

    expect(raised.payment.status).toBe('pending_verification')
    expect(raised.payment.method).toBe('bank_transfer')
    // Promised, not seen: no amount until somebody checks the bank.
    expect(raised.payment.amount).toBeNull()
    expect(raised.payment.expected).toBe(bnd(200))

    const read = await getBookingById(booking.id)

    expect(read?.paid).toBe(bnd(200))
  })

  test('verifying it settles the booking and leaves the status alone', async () => {
    const booking = await givenExtendedAfterPaying('3B-08')

    const raised = await recordTransferPayment({ bookingId: booking.id, actorId: null })

    expect(raised.ok).toBe(true)
    if (!raised.ok) return

    const verified = await verifyPayment({
      paymentId: raised.payment.id,
      observedAmount: bnd(200),
      match: 'reference',
      actorId: null,
    })

    expect(verified.ok).toBe(true)

    const read = await getBookingById(booking.id)

    expect(balanceOf(read!.total, read!.paid).state).toBe('settled')
    expect(read?.status).toBe('confirmed')
  })

  test('verifying a top-up writes no second "booking confirmed" event', async () => {
    // The booking was already confirmed and did not move. A history line
    // saying otherwise would be the trail describing an event that never
    // happened.
    const booking = await givenExtendedAfterPaying('3B-09')
    const raised = await recordTransferPayment({ bookingId: booking.id, actorId: null })

    expect(raised.ok).toBe(true)
    if (!raised.ok) return

    await verifyPayment({
      paymentId: raised.payment.id,
      observedAmount: bnd(200),
      match: 'reference',
      actorId: null,
    })

    const events = await auditEventsFor(booking.id)

    expect(events.filter((event) => event.action === 'booking.verify_payment')).toHaveLength(1)
  })

  test('the top-up is matched against the balance, so paying it is not "short"', async () => {
    // Against the booking total this would have been BND 200 short and refused
    // without a written reason.
    const booking = await givenExtendedAfterPaying('3B-10')
    const raised = await recordTransferPayment({ bookingId: booking.id, actorId: null })

    expect(raised.ok).toBe(true)
    if (!raised.ok) return

    const verified = await verifyPayment({
      paymentId: raised.payment.id,
      observedAmount: bnd(200),
      match: 'reference',
      actorId: null,
    })

    expect(verified.ok).toBe(true)
    if (!verified.ok) return

    expect(verified.payment.amountOverrideReason).toBeNull()
  })

  test('refuses a second transfer while one is still awaiting verification', async () => {
    const booking = await givenExtendedAfterPaying('3B-11')

    await recordTransferPayment({ bookingId: booking.id, actorId: null })
    const second = await recordTransferPayment({ bookingId: booking.id, actorId: null })

    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('already_pending')
  })

  test('refuses a transfer against a booking that owes nothing', async () => {
    const booking = await givenBooking({
      unitRef: '3B-12',
      checkIn: CHECK_IN,
      checkOut: ONE_NIGHT,
    })

    const result = await recordTransferPayment({ bookingId: booking.id, actorId: null })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('nothing_outstanding')
  })
})

describe('the first transfer on an amended booking', () => {
  test('is still matched against the whole total when nothing has been paid', async () => {
    // The single-payment case, which must not have changed: a booking with
    // nothing verified against it owes all of itself, amended or not.
    const { booking, payment } = await givenTransferBooking({
      unitRef: '3B-13',
      checkIn: CHECK_IN,
      checkOut: ONE_NIGHT,
    })

    await extend(booking.id, TWO_NIGHTS, 2)

    const short = await verifyPayment({
      paymentId: payment.id,
      observedAmount: NIGHTLY_RATE,
      match: 'reference',
      actorId: null,
    })

    expect(short.ok).toBe(false)
    if (short.ok) return
    expect(short.error.code).toBe('reason_required')
    expect(short.error.dueCents).toBe(bnd(400))
  })
})
