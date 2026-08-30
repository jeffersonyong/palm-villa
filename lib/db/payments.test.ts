import { describe, expect, test } from 'vitest'

import { bnd } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { amendBooking, getBookingById, transitionBooking } from './bookings'
import { listPayments, listPaymentsForBooking, recordCashPayment, verifyPayment } from './payments'
import { givenBooking, givenTransferBooking } from './test/factory'
import { auditEventsFor, paymentsFor } from './test/inspect'

/**
 * Payment verification and cash recording, against the real database.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * What this file exists to prove
 *
 * scope-of-capabilities.md B5 is a promise in writing to the client: "Confirm
 * payments by matching both reference and amount — a short payment is flagged,
 * never silently accepted." The tests that matter here are therefore the
 * refusals, and the one that matters most bypasses the application entirely
 * and checks the constraint refuses a mismatch written straight to the table.
 *
 * The races matter for the same reason G1's do. Two clerks working the same
 * queue row is the ordinary case in a front office, not an exotic one, and a
 * payment verified twice is money counted twice.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CHECK_IN = '2026-11-02'
const CHECK_OUT = '2026-11-05'

/** Three nights at the seeded rate, which `bookingInput` prices. */
async function transferBooking(unitRef = '3B-01') {
  return givenTransferBooking({ unitRef, checkIn: CHECK_IN, checkOut: CHECK_OUT })
}

describe('how a booking acquires a payment', () => {
  test('a cash walk-in is confirmed, with a verified payment against it', async () => {
    const booking = await givenBooking({
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      paymentMethod: 'cash',
    })

    expect(booking.status).toBe('confirmed')

    const [payment] = await paymentsFor(booking.id)

    expect(payment).toMatchObject({
      method: 'cash',
      status: 'verified',
      amount_cents: booking.total,
      expected_amount_cents: booking.total,
      // Cash is handed over, not matched against a statement.
      match_kind: null,
    })
    expect(payment?.collected_at).not.toBeNull()
  })

  test('a transfer walk-in waits for verification, with an unobserved payment', async () => {
    const { booking, payment } = await transferBooking()

    expect(booking.status).toBe('awaiting_payment_verification')
    expect(payment.status).toBe('pending_verification')
    expect(payment.expected).toBe(booking.total)
    // Nobody has looked at the bank yet, so the row asserts no amount.
    expect(payment.amount).toBeNull()
    expect(payment.matchKind).toBeNull()
  })

  test('a booking that loses the race leaves no payment behind', async () => {
    // The payment insert lives in the same transaction as the occupancy row,
    // so the exclusion constraint takes it back with everything else.
    const first = await transferBooking()

    await expect(transferBooking()).rejects.toThrow()

    const all = await listPayments()

    expect(all).toHaveLength(1)
    expect(all[0]?.bookingId).toBe(first.booking.id)
  })
})

describe('verifying a payment', () => {
  test('an exact amount confirms the booking and records who and when', async () => {
    const { booking, payment } = await transferBooking()

    const result = await verifyPayment({
      paymentId: payment.id,
      observedAmount: booking.total,
      match: 'reference',
      observedReference: booking.reference,
      actorId: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.payment.status).toBe('verified')
    expect(result.payment.amount).toBe(booking.total)
    expect(result.payment.verifiedAt).not.toBeNull()

    const after = await getBookingById(booking.id)
    expect(after?.status).toBe('confirmed')

    const paymentEvents = (await auditEventsFor(payment.id)).map((event) => event.action)
    expect(paymentEvents).toEqual(['payment.recorded', 'payment.verified'])
    // No override was needed, so none is claimed.
    expect(paymentEvents).not.toContain('payment.amount_overridden')

    const bookingEvents = (await auditEventsFor(booking.id)).map((event) => event.action)
    expect(bookingEvents).toContain('booking.verify_payment')
  })

  /**
   * The headline refusal. If this test ever passes for the wrong reason, the
   * client's B5 promise is broken and nothing else in the system would say so.
   */
  test('REFUSES a short payment with no reason, and moves nothing at all', async () => {
    const { booking, payment } = await transferBooking()
    const before = (await auditEventsFor(payment.id)).length

    const result = await verifyPayment({
      paymentId: payment.id,
      observedAmount: booking.total - bnd(50),
      match: 'reference',
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('reason_required')

    const [stored] = await paymentsFor(booking.id)
    expect(stored?.status).toBe('pending_verification')
    expect(stored?.amount_cents).toBeNull()
    expect(stored?.verified_at).toBeNull()

    const unmoved = await getBookingById(booking.id)
    expect(unmoved?.status).toBe('awaiting_payment_verification')

    // A refusal is not an event. Nothing happened, so nothing is recorded.
    expect(await auditEventsFor(payment.id)).toHaveLength(before)
  })

  test('confirms a short payment once a reason is given, and records the variance', async () => {
    const { booking, payment } = await transferBooking()

    const result = await verifyPayment({
      paymentId: payment.id,
      observedAmount: booking.total - bnd(50),
      match: 'reference',
      amountOverrideReason: 'Guest is settling the balance in cash on arrival.',
      actorId: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.payment.amount).toBe(booking.total - bnd(50))
    expect(result.payment.amountOverrideReason).toContain('balance in cash')
    expect((await getBookingById(booking.id))?.status).toBe('confirmed')

    const override = (await auditEventsFor(payment.id)).find(
      (event) => event.action === 'payment.amount_overridden',
    )

    expect(override).toBeDefined()
    expect(override?.after).toMatchObject({ variance_cents: -bnd(50) })
  })

  test('refuses an over-payment with no reason', async () => {
    // An overpayment is a refund conversation, and refunds are N5 — open.
    const { booking, payment } = await transferBooking()

    const result = await verifyPayment({
      paymentId: payment.id,
      observedAmount: booking.total + bnd(20),
      match: 'reference',
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('reason_required')
  })

  test('refuses a payment already verified', async () => {
    const { booking, payment } = await transferBooking()

    await verifyPayment({
      paymentId: payment.id,
      observedAmount: booking.total,
      match: 'reference',
      actorId: null,
    })

    const second = await verifyPayment({
      paymentId: payment.id,
      observedAmount: booking.total,
      match: 'reference',
      actorId: null,
    })

    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('already_verified')
  })

  /**
   * The application refuses first, with a sentence a clerk can act on. This
   * asserts the second line of defence: the constraint, which no code path,
   * no RPC and no direct client can get round.
   *
   * To watch it fail, drop `payment_mismatch_needs_reason` and re-run.
   */
  test('the DATABASE refuses a mismatch written straight to the table', async () => {
    const { booking, payment } = await transferBooking()

    const { error } = await dataClient()
      .from('payment')
      .update({
        status: 'verified',
        amount_cents: booking.total - bnd(100),
        match_kind: 'reference',
        verified_at: new Date().toISOString(),
      })
      .eq('id', payment.id)

    expect(error).not.toBeNull()
    expect(error?.message).toContain('payment_mismatch_needs_reason')
  })

  test('the DATABASE refuses a manual match with no reason', async () => {
    const { booking, payment } = await transferBooking()

    const { error } = await dataClient()
      .from('payment')
      .update({
        status: 'verified',
        amount_cents: booking.total,
        match_kind: 'manual',
        verified_at: new Date().toISOString(),
      })
      .eq('id', payment.id)

    expect(error).not.toBeNull()
    expect(error?.message).toContain('payment_manual_match_needs_reason')
  })
})

describe('a booking repriced after the guest was quoted', () => {
  /**
   * The interaction the amend path creates, and the reason
   * `expected_amount_cents` is refreshed under the lock rather than trusted
   * from when the payment was raised. Without that refresh this whole test
   * passes for the wrong reason: the old quote matches, and a booking is
   * confirmed short with nobody told.
   */
  test('is matched against what is due now, not what was quoted', async () => {
    const { booking, payment } = await transferBooking()
    const quoted = booking.total

    // Reprice by stretching the stay, through the real amend path.
    const current = await getBookingById(booking.id)
    const amended = await amendBooking({
      bookingId: booking.id,
      expectedUpdatedAt: current!.updatedAt,
      unitId: current!.unitId,
      range: { start: CHECK_IN, end: '2026-11-07' },
      guestName: current!.guestName,
      guestPhone: current!.guestPhone,
      vehicleRegistration: current!.vehicleRegistration,
      chargeableGuests: current!.chargeableGuests,
      exemptGuests: current!.exemptGuests,
      lines: current!.lines.map((entry) => ({ ...entry })),
      total: quoted + bnd(200),
      securityDeposit: current!.securityDeposit,
      reason: 'Guest extended the stay by two nights.',
      actorId: null,
    })

    expect(amended.ok).toBe(true)

    // Paying the originally quoted figure is now short.
    const refused = await verifyPayment({
      paymentId: payment.id,
      observedAmount: quoted,
      match: 'reference',
      actorId: null,
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.error.code).toBe('reason_required')

    const confirmed = await verifyPayment({
      paymentId: payment.id,
      observedAmount: quoted,
      match: 'reference',
      amountOverrideReason: 'Guest transferred before the stay was extended.',
      actorId: null,
    })

    expect(confirmed.ok).toBe(true)
    if (!confirmed.ok) return

    // The expectation is refreshed to the new price...
    expect(confirmed.payment.expected).toBe(quoted + bnd(200))
    // ...and the figure the guest was originally given survives in the trail.
    const verified = (await auditEventsFor(payment.id)).find(
      (event) => event.action === 'payment.verified',
    )
    expect(verified?.before).toMatchObject({ expected_amount_cents: quoted })
  })
})

describe('the manual match escape hatch (B6)', () => {
  test('attaches an observed payment without touching the booking reference', async () => {
    const { booking, payment } = await transferBooking()

    const result = await verifyPayment({
      paymentId: payment.id,
      observedAmount: booking.total,
      match: 'manual',
      observedReference: null,
      observedSender: 'SITI BINTI ABDULLAH',
      observedOn: '2026-10-30',
      matchReason: 'No reference quoted; sender name matches the guest.',
      actorId: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.payment.matchKind).toBe('manual')
    expect(result.payment.observedSender).toBe('SITI BINTI ABDULLAH')
    // The booking's own reference is a fact about the booking, never rewritten
    // by what someone typed into a bank app.
    expect(result.payment.bookingReference).toBe(booking.reference)

    const matched = (await auditEventsFor(payment.id)).find(
      (event) => event.action === 'payment.matched_manually',
    )
    expect(matched?.after).toMatchObject({ observed_sender: 'SITI BINTI ABDULLAH' })
  })

  test('refuses a manual match with no reason', async () => {
    const { booking, payment } = await transferBooking()

    const result = await verifyPayment({
      paymentId: payment.id,
      observedAmount: booking.total,
      match: 'manual',
      observedSender: 'SOMEONE',
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('reason_required')
  })
})

describe('two people working the same queue row', () => {
  /**
   * Six clerks hit Confirm at once. Exactly one wins.
   *
   * To watch it fail, drop the `for update` from verify_payment(): every
   * caller reads `pending_verification`, every caller passes the guard, and
   * the same money is verified six times over.
   */
  test('lets exactly one of six simultaneous verifications through', async () => {
    const { booking, payment } = await transferBooking()

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        verifyPayment({
          paymentId: payment.id,
          observedAmount: booking.total,
          match: 'reference',
          actorId: null,
        }),
      ),
    )

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(
      results.filter((result) => !result.ok && result.error.code === 'already_verified'),
    ).toHaveLength(5)

    const events = (await auditEventsFor(payment.id)).map((event) => event.action)
    expect(events.filter((action) => action === 'payment.verified')).toHaveLength(1)

    const bookingEvents = (await auditEventsFor(booking.id)).map((event) => event.action)
    expect(bookingEvents.filter((action) => action === 'booking.verify_payment')).toHaveLength(1)
  })

  /**
   * A payment marked verified against a cancelled booking is the corruption
   * the lock ordering exists to prevent, so both halves are asserted: one
   * side wins, and if it was the cancellation the payment is still pending.
   */
  test('a verification racing a cancellation cannot both happen', async () => {
    const { booking, payment } = await transferBooking()

    const [verified, cancelled] = await Promise.all([
      verifyPayment({
        paymentId: payment.id,
        observedAmount: booking.total,
        match: 'reference',
        actorId: null,
      }),
      transitionBooking(booking.id, 'cancel', null, 'Guest changed their mind.'),
    ])

    expect([verified.ok, cancelled.ok].filter(Boolean)).toHaveLength(1)

    const [stored] = await paymentsFor(booking.id)
    const after = await getBookingById(booking.id)

    if (cancelled.ok) {
      expect(after?.status).toBe('cancelled')
      expect(stored?.status).toBe('pending_verification')
    } else {
      expect(after?.status).toBe('confirmed')
      expect(stored?.status).toBe('verified')
    }
  })
})

describe('recording cash (B7)', () => {
  test('settles a booking that was waiting on a transfer', async () => {
    const { booking } = await transferBooking()

    const result = await recordCashPayment({
      bookingId: booking.id,
      amount: booking.total,
      actorId: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.bookingStatus).toBe('confirmed')
    expect(result.payment.method).toBe('cash')
    expect(result.payment.collectedAt).not.toBeNull()
  })

  test('records against an already-confirmed booking without moving it', async () => {
    const booking = await givenBooking({ checkIn: CHECK_IN, checkOut: CHECK_OUT })

    const result = await recordCashPayment({
      bookingId: booking.id,
      amount: bnd(50),
      amountOverrideReason: 'Late check-out collected at the desk.',
      actorId: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.bookingStatus).toBe('confirmed')
    expect((await auditEventsFor(booking.id)).map((event) => event.action)).not.toContain(
      'booking.verify_payment',
    )
  })

  test('refuses cash against a closed booking', async () => {
    const booking = await givenBooking({ checkIn: CHECK_IN, checkOut: CHECK_OUT })
    // Creation already recorded the cash this walk-in paid with; the refusal
    // below must leave that one row alone rather than add a second.
    const before = await paymentsFor(booking.id)
    await transitionBooking(booking.id, 'cancel', null, 'Cancelled.')

    const result = await recordCashPayment({
      bookingId: booking.id,
      amount: booking.total,
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('booking_closed')
    // Refused in TypeScript by isTerminal(), before the database is touched.
    expect(await paymentsFor(booking.id)).toHaveLength(before.length)
  })

  test('demands a reason when the notes do not match the total', async () => {
    // Cash gets the same amount rule as a transfer. record_cash_payment()
    // could have written its own reason and satisfied the constraint quietly;
    // a machine-written justification is what B5 exists to prevent.
    const { booking } = await transferBooking()

    const result = await recordCashPayment({
      bookingId: booking.id,
      amount: booking.total - bnd(10),
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('reason_required')
    expect(result.error.dueCents).toBe(booking.total)
  })

  test('records two simultaneous cash payments as two facts, moving the booking once', async () => {
    // Two clerks both take money for the same booking. That is two things that
    // genuinely happened, or one mistake — either way the system records both
    // and nets nothing off. prd.md §9.6: money is not moved by this system.
    const { booking } = await transferBooking()

    const results = await Promise.all([
      recordCashPayment({ bookingId: booking.id, amount: booking.total, actorId: null }),
      recordCashPayment({ bookingId: booking.id, amount: booking.total, actorId: null }),
    ])

    const winners = results.filter((result) => result.ok)

    // Exactly one may move the booking, so the loser is refused outright and
    // writes nothing — the guard sits before the insert, under the row lock.
    expect(winners).toHaveLength(1)
    expect(
      results.filter((result) => !result.ok && result.error.code === 'status_changed'),
    ).toHaveLength(1)

    // The transfer's own pending payment, plus the cash that settled it.
    const stored = await paymentsFor(booking.id)
    expect(stored).toHaveLength(2)
    expect(stored.filter((row) => row.method === 'cash')).toHaveLength(1)

    const bookingEvents = (await auditEventsFor(booking.id)).map((event) => event.action)
    expect(bookingEvents.filter((action) => action === 'booking.verify_payment')).toHaveLength(1)
  })
})

describe('listing payments', () => {
  test('returns the queue oldest first, and filters by status', async () => {
    const waiting = await transferBooking('3B-01')
    const settled = await givenBooking({
      unitRef: '3B-02',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      paymentMethod: 'cash',
    })

    const pending = await listPayments({ statuses: ['pending_verification'] })

    expect(pending.map((payment) => payment.bookingId)).toEqual([waiting.booking.id])

    const everything = await listPayments()
    expect(everything).toHaveLength(2)
    // Oldest first: a queue is worked from the top.
    expect(everything[0]?.bookingId).toBe(waiting.booking.id)
    expect(everything[1]?.bookingId).toBe(settled.id)

    // An empty filter is no filter, matching listBookings.
    expect(await listPayments({ statuses: [] })).toHaveLength(2)
  })

  test('carries the guest and the live total for the queue to render', async () => {
    const { booking } = await transferBooking()
    const [payment] = await listPaymentsForBooking(booking.id)

    expect(payment).toMatchObject({
      bookingReference: booking.reference,
      guestName: booking.guestName,
      due: booking.total,
      unitRef: '3B-01',
      slipDocumentId: null,
    })
  })
})
