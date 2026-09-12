import { describe, expect, test } from 'vitest'

import { bnd } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { amendBooking, getBookingById, transitionBooking } from './bookings'
import { getDepositByBookingId, verifyDeposit } from './deposits'
import {
  listPaymentPage,
  listPayments,
  listPaymentsForBooking,
  recordCashPayment,
  sumPaymentAmounts,
  verifyPayment,
} from './payments'
import { currentPropertyId } from './property'
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

/**
 * Three nights at the seeded rate, which `bookingInput` prices, paid by
 * transfer with the deposit promised alongside — the shape a customer who
 * chose "everything now" leaves, and the desk's transfer booking too.
 */
async function transferBooking(unitRef = '3B-01') {
  return givenTransferBooking({ unitRef, checkIn: CHECK_IN, checkOut: CHECK_OUT })
}

/**
 * The same, quoting no deposit — so the stay's money is the only thing that
 * can confirm the booking. Used where a test is about the payment machinery
 * itself rather than about what confirms a booking.
 */
async function undepositedTransferBooking(unitRef = '3B-01') {
  return givenTransferBooking({
    unitRef,
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
    securityDeposit: 0,
  })
}

describe('how a booking acquires a payment', () => {
  test('a cash walk-in is confirmed, with a verified payment and a held deposit', async () => {
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

    // The deposit is the other kind of money, on its own ledger, and never a
    // second payment row.
    expect(await paymentsFor(booking.id)).toHaveLength(1)
    expect(await getDepositByBookingId(booking.id)).toMatchObject({
      method: 'cash',
      stage: 'secured',
    })
    expect((await auditEventsFor(booking.id)).map((event) => event.action)).toContain(
      'booking.created_walk_in',
    )
  })

  test('a transfer walk-in waits for verification, with an unobserved payment', async () => {
    const { booking, payment, deposit } = await transferBooking()

    expect(booking.status).toBe('awaiting_payment_verification')
    expect(payment.status).toBe('pending_verification')
    expect(payment.expected).toBe(booking.total)
    // Nobody has looked at the bank yet, so the row asserts no amount.
    expect(payment.amount).toBeNull()
    expect(payment.matchKind).toBeNull()
    // And the deposit is a promise in the same queue.
    expect(deposit).toMatchObject({ method: 'bank_transfer', stage: 'awaiting_verification' })
    expect(deposit?.collectedAt).toBeNull()
  })

  test('a desk booking secured by the deposit alone owes the whole stay', async () => {
    // The regular ringing ahead (prd.md §9.4): the BND 100 in cash secures
    // the unit, nothing is written for the stay, and the balance says so.
    const booking = await givenBooking({
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      paymentMethod: 'cash',
      payStayNow: false,
    })

    expect(booking.status).toBe('confirmed')
    expect(booking.paid).toBe(0)
    expect(await paymentsFor(booking.id)).toHaveLength(0)
    expect(await getDepositByBookingId(booking.id)).toMatchObject({ stage: 'secured' })

    const events = (await auditEventsFor(booking.id)).map((event) => event.action)

    expect(events).toContain('booking.created_walk_in')
    expect(events).not.toContain('payment.cash_recorded')
  })

  test('a booking quoting no deposit always takes the stay, whatever was asked', async () => {
    const booking = await givenBooking({
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      securityDeposit: 0,
      payStayNow: false,
    })

    expect(booking.status).toBe('confirmed')
    expect(booking.paid).toBe(booking.total)
    expect(await getDepositByBookingId(booking.id)).toBeNull()
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
  test('an exact amount confirms a booking with nothing else to secure it', async () => {
    const { booking, payment } = await undepositedTransferBooking()

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
    expect(result.confirmedNow).toBe(true)
    expect(result.awaitingDeposit).toBe(false)

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
   * The rule the whole slice turns on (prd.md §9.1, §11): a booking quoting a
   * deposit is confirmed by that deposit and by nothing else. The stay's
   * money is verified — it settles the balance — and the booking waits.
   */
  test('does NOT confirm a booking whose deposit is still a promise', async () => {
    const { booking, payment, deposit } = await transferBooking()

    const result = await verifyPayment({
      paymentId: payment.id,
      observedAmount: booking.total,
      match: 'reference',
      actorId: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The money is recorded...
    expect(result.payment.status).toBe('verified')
    expect((await getBookingById(booking.id))?.paid).toBe(booking.total)
    // ...and the booking is not confirmed by it.
    expect(result.confirmedNow).toBe(false)
    expect(result.awaitingDeposit).toBe(true)
    expect((await getBookingById(booking.id))?.status).toBe('awaiting_payment_verification')
    expect((await auditEventsFor(booking.id)).map((event) => event.action)).not.toContain(
      'booking.verify_payment',
    )

    // The deposit's own verification is what confirms it, and once, so a
    // customer who sent everything in one transfer hears once.
    const secured = await verifyDeposit({
      depositId: deposit!.id,
      observedAmount: deposit!.amount,
      match: 'reference',
      actorId: null,
    })

    expect(secured).toMatchObject({ ok: true, confirmedNow: true })
    expect((await getBookingById(booking.id))?.status).toBe('confirmed')
  })

  test('verifying the deposit first confirms it, and the stay then settles a confirmed booking', async () => {
    const { booking, payment, deposit } = await transferBooking()

    const secured = await verifyDeposit({
      depositId: deposit!.id,
      observedAmount: deposit!.amount,
      match: 'reference',
      actorId: null,
    })

    expect(secured).toMatchObject({ ok: true, confirmedNow: true })
    expect((await getBookingById(booking.id))?.status).toBe('confirmed')
    // The deposit settles nothing: the stay is still owed in full.
    expect((await getBookingById(booking.id))?.paid).toBe(0)

    const result = await verifyPayment({
      paymentId: payment.id,
      observedAmount: booking.total,
      match: 'reference',
      actorId: null,
    })

    expect(result).toMatchObject({ ok: true, confirmedNow: false, awaitingDeposit: false })
    expect((await getBookingById(booking.id))?.paid).toBe(booking.total)
    // One confirmation in the trail, on the deposit's verification.
    expect(
      (await auditEventsFor(booking.id)).filter(
        (event) => event.action === 'booking.verify_payment',
      ),
    ).toHaveLength(1)
  })

  test('the DATABASE refuses to confirm past an unsecured deposit, whatever the caller says', async () => {
    // The guard in verify_payment() itself, reached by handing it the status
    // pair lib/db would never pass. A caller that forgets the rule is refused
    // with a sentence rather than trusted.
    const { booking, payment } = await transferBooking()
    const propertyId = await currentPropertyId()

    const { data } = await dataClient().rpc('verify_payment', {
      p_property_id: propertyId,
      p_payment_id: payment.id,
      p_from_status: 'awaiting_payment_verification',
      p_to_status: 'confirmed',
      p_observed_amount_cents: booking.total,
      p_match_kind: 'reference',
      p_actor_id: null,
    })

    expect(data).toMatchObject({ ok: false, error: 'deposit_not_secured' })

    const [stored] = await paymentsFor(booking.id)
    expect(stored?.status).toBe('pending_verification')
    expect((await getBookingById(booking.id))?.status).toBe('awaiting_payment_verification')
  })

  /**
   * The headline refusal. If this test ever passes for the wrong reason, the
   * client's B5 promise is broken and nothing else in the system would say so.
   */
  test('REFUSES a short payment with no reason, and moves nothing at all', async () => {
    const { booking, payment } = await undepositedTransferBooking()
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
    const { booking, payment } = await undepositedTransferBooking()

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
      unitId: current!.stay!.unitId,
      range: { start: CHECK_IN, end: '2026-11-07' },
      guestName: current!.guestName,
      guestPhone: current!.guestPhone,
      discount: current!.discount,
      vehicles: current!.vehicles,
      noVehicle: current!.noVehicle,
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
    const { booking, payment } = await undepositedTransferBooking()

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
    const { booking, payment } = await undepositedTransferBooking()

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
  test('settles a booking that was waiting on a transfer, where nothing else secures it', async () => {
    const { booking } = await undepositedTransferBooking()

    const result = await recordCashPayment({
      bookingId: booking.id,
      amount: booking.total,
      actorId: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.bookingStatus).toBe('confirmed')
    expect(result.confirmedNow).toBe(true)
    expect(result.awaitingDeposit).toBe(false)
    expect(result.payment.method).toBe('cash')
    expect(result.payment.collectedAt).not.toBeNull()
  })

  test('settles the stay without confirming a booking whose deposit is owed', async () => {
    // Cash for the stay is counted and recorded; the deposit is what confirms
    // the booking, and this is not the way to take it (prd.md §9.1, §11).
    const { booking, deposit } = await transferBooking()

    const result = await recordCashPayment({
      bookingId: booking.id,
      amount: booking.total,
      actorId: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.bookingStatus).toBe('awaiting_payment_verification')
    expect(result.confirmedNow).toBe(false)
    expect(result.awaitingDeposit).toBe(true)
    expect((await getBookingById(booking.id))?.paid).toBe(booking.total)

    // The deposit's own verification then confirms it.
    await verifyDeposit({
      depositId: deposit!.id,
      observedAmount: deposit!.amount,
      match: 'reference',
      actorId: null,
    })

    expect((await getBookingById(booking.id))?.status).toBe('confirmed')
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
    const { booking } = await undepositedTransferBooking()

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
    const { booking } = await undepositedTransferBooking()

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

describe('reading the payment list without losing rows', () => {
  /**
   * PostgREST is configured with `max_rows = 1000` and **truncates rather than
   * failing**, so a list that outgrew it came back short with a 200 and
   * nothing to say so. The cash log's total was summed from whatever arrived,
   * which made it a money figure that was quietly wrong.
   *
   * These do not seed a thousand bookings. What they pin is the contract that
   * makes the size irrelevant: a page states the total it was drawn from, the
   * pages partition the list, a page past the end is empty rather than an
   * error, and the money is summed over everything matched rather than over
   * the rows in hand. The chunking loop itself is proved at a boundary of two
   * in export.test.ts.
   */

  /**
   * Three cash bookings, each in its own unit — the fixture defaults every
   * booking to 3B-01, and three of those over one set of dates is the
   * exclusion constraint doing its job rather than a fixture worth forcing.
   */
  async function threeCashBookings() {
    const first = await givenBooking({
      unitRef: '3B-01',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      paymentMethod: 'cash',
    })
    const second = await givenBooking({
      unitRef: '3B-02',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      paymentMethod: 'cash',
    })
    const third = await givenBooking({
      unitRef: '3B-03',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      paymentMethod: 'cash',
    })

    return [first, second, third]
  }

  test('a page carries the total it was drawn from, not its own length', async () => {
    await threeCashBookings()

    const page = await listPaymentPage({ methods: ['cash'] }, { page: 1, pageSize: 2 })

    expect(page.payments).toHaveLength(2)
    expect(page.total).toBe(3)
  })

  test('the pages partition the list, with nothing repeated or skipped', async () => {
    await threeCashBookings()

    const all = await listPayments({ methods: ['cash'] })
    const first = await listPaymentPage({ methods: ['cash'] }, { page: 1, pageSize: 2 })
    const second = await listPaymentPage({ methods: ['cash'] }, { page: 2, pageSize: 2 })

    expect([...first.payments, ...second.payments].map((payment) => payment.id)).toEqual(
      all.map((payment) => payment.id),
    )
  })

  test('a page past the end is empty and still states the real total', async () => {
    await threeCashBookings()

    // What a bookmarked `?page=9` asks for once the rows beneath it are gone.
    // PostgREST answers that with a 416, which must read as an empty page
    // rather than as a fault, or the screen shows an error instead of
    // clamping back to a page that exists.
    const page = await listPaymentPage({ methods: ['cash'] }, { page: 9, pageSize: 2 })

    expect(page.payments).toHaveLength(0)
    expect(page.total).toBe(3)
  })

  test('the total is summed over every match, never over the page', async () => {
    const bookings = await threeCashBookings()
    const expected = bookings.reduce((sum, booking) => sum + booking.total, 0)

    const total = await sumPaymentAmounts({ methods: ['cash'] })
    const page = await listPaymentPage({ methods: ['cash'] }, { page: 1, pageSize: 1 })
    const sumOfPage = page.payments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)

    expect(total).toBe(expected)
    // The bug this replaces: a total that followed the page.
    expect(sumOfPage).toBeLessThan(total)
  })

  test('the sum is filtered by the same predicates as the rows', async () => {
    await threeCashBookings()
    await givenTransferBooking({ unitRef: '3B-04', checkIn: CHECK_IN, checkOut: CHECK_OUT })

    // A total counted over a different set from the rows above it is the
    // failure `applyPaymentFilter` exists to make impossible, so the two are
    // asked the same question and compared.
    const rows = await listPayments({ methods: ['cash'] })
    const total = await sumPaymentAmounts({ methods: ['cash'] })

    expect(total).toBe(rows.reduce((sum, payment) => sum + (payment.amount ?? 0), 0))
  })
})
