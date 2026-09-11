import { describe, expect, test } from 'vitest'

import { bnd } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { listAuditEvents } from './audit'
import { getBookingById } from './bookings'
import {
  checkInBooking,
  getDepositByBookingId,
  listDepositCashArrivals,
  topUpBookingDeposit,
  verifyDeposit,
} from './deposits'
import { currentPropertyId } from './property'
import {
  createPublicStayBooking,
  submitPublicTransfer,
  type CreatePublicStayInput,
} from './public-bookings'

/**
 * A security deposit that arrived short, and the rest of it (capability B16;
 * prd.md §11).
 *
 * ── What these exist to prove ─────────────────────────────────────────────
 *
 * The gap these close was not a missing button. `verify_deposit()` overwrote
 * `amount_cents` with whatever the clerk typed and **confirmed the booking**,
 * so BND 50 against a BND 100 quote left a confirmed booking holding half a
 * deposit, every route back in refused, and nothing on any screen saying so.
 * Four things could plausibly go wrong here and every one of them is silent:
 *
 *   1. **A short deposit securing a booking.** The whole rule. It is enforced
 *      by `booking_deposit_is_secured()`, which `verify_payment()`,
 *      `record_cash_payment()` and `check_in_booking()` all ask — and by
 *      `verify_deposit()`, which does not ask it and had to be taught the
 *      same arithmetic directly.
 *   2. **A top-up overshooting.** More than the shortfall is not a top-up,
 *      and an over-held deposit is money to refund, which is still N5.
 *   3. **A partial top-up confirming anyway.** The status pair is derived in
 *      TypeScript before the lock is taken, so the function has to re-derive
 *      the arithmetic and decline to apply a pair it was wrongly offered.
 *   4. **The cash-up losing sight of the notes.** A top-up moves the amount
 *      but neither the row's method nor its date, so the day's drawer line
 *      has to be assembled from what arrived rather than from the row.
 *
 * Dates and phone numbers are deliberately distinct from the other db suites:
 * these run against the same persistent database, and a shared range is a
 * flaky exclusion-constraint failure rather than a real one.
 */

const CHECK_IN = '2027-05-08'
const CHECK_OUT = '2027-05-11'
const DEPOSIT = bnd(100)
const STAY_TOTAL = bnd(600)

function stayInput(overrides: Partial<CreatePublicStayInput> = {}): CreatePublicStayInput {
  return {
    unitTypeSlug: 'three-bedroom',
    range: { start: CHECK_IN, end: CHECK_OUT },
    guestName: 'Short Deposit',
    guestPhone: '+673 730 0001',
    guestEmail: null,
    vehicles: ['SD 1'],
    noVehicle: false,
    chargeableGuests: 2,
    exemptGuests: 0,
    total: STAY_TOTAL,
    securityDeposit: DEPOSIT,
    lines: [
      {
        type: 'accommodation',
        description: '3-bedroom × 3 nights',
        quantity: 3,
        unitPrice: bnd(200),
        amount: STAY_TOTAL,
      },
    ],
    ...overrides,
  }
}

/** A promised transfer, nobody has looked yet. */
async function givenPromisedDeposit(
  overrides: Partial<CreatePublicStayInput> = {},
): Promise<{ bookingId: string; depositId: string; reference: string }> {
  const created = await createPublicStayBooking(stayInput(overrides))

  if (!created.ok) {
    throw new Error(`Test setup could not hold a unit: ${created.error.message}`)
  }

  const submitted = await submitPublicTransfer(created.data.accessToken, 'deposit_only')

  if (!submitted.ok) {
    throw new Error(`Test setup could not promise a transfer: ${submitted.error.message}`)
  }

  const deposit = await getDepositByBookingId(created.data.bookingId)

  if (!deposit) {
    throw new Error('Test setup produced no deposit row')
  }

  return {
    bookingId: created.data.bookingId,
    depositId: deposit.id,
    reference: created.data.reference,
  }
}

/** The case that started all this: BND 50 of a BND 100 deposit, accepted with a reason. */
async function givenShortDeposit(
  overrides: Partial<CreatePublicStayInput> = {},
): Promise<{ bookingId: string; depositId: string; reference: string }> {
  const promised = await givenPromisedDeposit(overrides)

  const verified = await verifyDeposit({
    depositId: promised.depositId,
    observedAmount: bnd(50),
    match: 'reference',
    overrideReason: 'Guest is sending the other BND 50 on Friday.',
    actorId: null,
  })

  if (!verified.ok) {
    throw new Error(`Test setup could not verify short: ${verified.error.message}`)
  }

  return promised
}

async function actionsFor(entityType: string, entityId: string): Promise<readonly string[]> {
  const events = await listAuditEvents(entityType, entityId)

  return events.map((event) => event.action)
}

describe('a deposit verified short of its quote', () => {
  test('is collected, and secures nothing', async () => {
    // Arrange / Act
    const { bookingId, depositId } = await givenShortDeposit()

    // Assert
    const deposit = await getDepositByBookingId(bookingId)

    expect(deposit?.amount).toBe(bnd(50))
    expect(deposit?.quoted).toBe(DEPOSIT)
    expect(deposit?.shortfall).toBe(bnd(50))
    expect(deposit?.collectedAt).not.toBeNull()

    const booking = await getBookingById(bookingId)

    // The booking is where the customer left it. Before this rule the same
    // call reached `confirmed` and emailed the guest.
    expect(booking?.status).toBe('awaiting_payment_verification')
    expect(await actionsFor('booking', bookingId)).not.toContain('booking.verify_payment')

    // Collected, so it is on the ledger and out of the queue — the money did
    // arrive, and the property owes back what it holds.
    expect(deposit?.stage).toBe('secured')
    expect(await actionsFor('deposit', depositId)).toContain('deposit.collected')
  })

  test('cannot be checked in at all', async () => {
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0002' })

    const result = await checkInBooking({ bookingId, actorId: null })

    expect(result.ok).toBe(false)

    if (result.ok) return

    // The state machine answers first, and that is the right layer: the
    // booking never reached `confirmed`, so there is no legal move to the
    // door at all. `deposit_not_secured` is the second line of defence, for a
    // booking that *is* confirmed and whose deposit came up short since —
    // see the repricing suite below.
    expect(result.error.code).toBe('illegal_transition')
  })
})

describe('topping it up', () => {
  test('the rest of it confirms the booking', async () => {
    const { bookingId, depositId } = await givenShortDeposit({ guestPhone: '+673 730 0003' })

    const result = await topUpBookingDeposit({
      bookingId,
      amount: bnd(50),
      method: 'cash',
      actorId: null,
    })

    expect(result).toMatchObject({ ok: true, amount: DEPOSIT, shortfall: 0, confirmedNow: true })

    const deposit = await getDepositByBookingId(bookingId)

    expect(deposit?.amount).toBe(DEPOSIT)
    expect(deposit?.shortfall).toBe(0)
    // The row keeps how the deposit first arrived. Rewriting it would erase
    // that the customer ever promised a transfer.
    expect(deposit?.method).toBe('bank_transfer')
    expect(deposit?.promisedAt).not.toBeNull()

    const booking = await getBookingById(bookingId)

    expect(booking?.status).toBe('confirmed')
    // And it settles nothing: a BND 600 stay still owes BND 600 on arrival.
    expect(booking?.paid).toBe(0)

    expect(await actionsFor('deposit', depositId)).toContain('deposit.topped_up')
    expect(await actionsFor('booking', bookingId)).toContain('booking.secure_with_deposit')
  })

  test('then the guest can be checked in', async () => {
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0004' })

    await topUpBookingDeposit({ bookingId, amount: bnd(50), method: 'cash', actorId: null })

    expect(await checkInBooking({ bookingId, actorId: null })).toMatchObject({ ok: true })
  })

  test('part of the shortfall leaves the booking where it was', async () => {
    // A guest who owes BND 50 and brought 30 is a real afternoon at a desk.
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0005' })

    const result = await topUpBookingDeposit({
      bookingId,
      amount: bnd(30),
      method: 'cash',
      actorId: null,
    })

    expect(result).toMatchObject({
      ok: true,
      amount: bnd(80),
      shortfall: bnd(20),
      confirmedNow: false,
    })

    const booking = await getBookingById(bookingId)

    expect(booking?.status).toBe('awaiting_payment_verification')
    expect(await actionsFor('booking', bookingId)).not.toContain('booking.secure_with_deposit')
  })

  test('refuses more than the deposit is short', async () => {
    // A top-up exists to make a deposit whole. More than whole is money to
    // refund, and a refund is still N5 — so it is refused rather than
    // accepted with a reason.
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0006' })

    const result = await topUpBookingDeposit({
      bookingId,
      amount: bnd(60),
      method: 'cash',
      actorId: null,
    })

    expect(result.ok).toBe(false)

    if (result.ok) return

    expect(result.error.code).toBe('exceeds_shortfall')
    expect(result.error.message).toContain('50.00')
  })

  test('refuses a deposit that is already whole', async () => {
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0007' })

    await topUpBookingDeposit({ bookingId, amount: bnd(50), method: 'cash', actorId: null })

    const again = await topUpBookingDeposit({
      bookingId,
      amount: bnd(10),
      method: 'cash',
      actorId: null,
    })

    expect(again.ok).toBe(false)

    if (again.ok) return

    expect(again.error.code).toBe('nothing_short')
  })

  test('refuses an unverified promise, and sends it to the queue', async () => {
    // Adding to a promise would put money on the ledger nobody has seen,
    // which is the one thing `collected_at` exists to prevent.
    const { bookingId } = await givenPromisedDeposit({ guestPhone: '+673 730 0008' })

    const result = await topUpBookingDeposit({
      bookingId,
      amount: bnd(50),
      method: 'cash',
      actorId: null,
    })

    expect(result.ok).toBe(false)

    if (result.ok) return

    expect(result.error.code).toBe('not_collected')
    expect(result.error.message).toContain('payments queue')
  })

  test('refuses a zero or negative amount', async () => {
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0009' })

    expect(
      await topUpBookingDeposit({ bookingId, amount: 0, method: 'cash', actorId: null }),
    ).toMatchObject({ ok: false })
    expect(
      await topUpBookingDeposit({ bookingId, amount: bnd(-10), method: 'cash', actorId: null }),
    ).toMatchObject({ ok: false })
  })

  test('two clerks pressing at once add one top-up', async () => {
    // Two counters is the ordinary way a double collection happens. The
    // second blocks on the booking lock, then re-reads the deposit and finds
    // nothing short.
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0010' })

    const [first, second] = await Promise.all([
      topUpBookingDeposit({ bookingId, amount: bnd(50), method: 'cash', actorId: null }),
      topUpBookingDeposit({ bookingId, amount: bnd(50), method: 'cash', actorId: null }),
    ])

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1)

    const deposit = await getDepositByBookingId(bookingId)

    expect(deposit?.amount).toBe(DEPOSIT)
  })
})

describe('a quote repriced above what is held', () => {
  test('makes a whole deposit short, and check-in refuses until it is topped up', async () => {
    // prd.md §11 keeps the quote and what is held apart and reads the quote
    // live, so a booking repriced above what is in the safe genuinely is
    // short — the money is not all there, and the desk has one way to fix it.
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0011' })

    await topUpBookingDeposit({ bookingId, amount: bnd(50), method: 'cash', actorId: null })

    expect((await getDepositByBookingId(bookingId))?.shortfall).toBe(0)

    // The product path is an amendment, which reprices from the property's
    // current settings. Written straight here because what is under test is
    // the consequence of the quote moving, not the amend form's arithmetic —
    // the position `givenBookingInState` takes in the factory.
    await raiseQuotedDeposit(bookingId, bnd(150))

    const deposit = await getDepositByBookingId(bookingId)

    expect(deposit?.quoted).toBe(bnd(150))
    expect(deposit?.amount).toBe(DEPOSIT)
    expect(deposit?.shortfall).toBe(bnd(50))

    const refused = await checkInBooking({ bookingId, actorId: null })

    expect(refused.ok).toBe(false)

    if (!refused.ok) {
      // The deposit gate, on a booking the state machine is happy to move.
      expect(refused.error.code).toBe('deposit_not_secured')
      expect(refused.error.message).toContain('100.00')
      expect(refused.error.message).toContain('Top it up')
      // Never the payments queue: this transfer was verified, and sending a
      // clerk looking for a promise nobody made is how a shortfall goes
      // uncollected a second time.
      expect(refused.error.message).not.toContain('queue')
    }

    const fixed = await topUpBookingDeposit({
      bookingId,
      amount: bnd(50),
      method: 'cash',
      actorId: null,
    })

    expect(fixed).toMatchObject({ ok: true, amount: bnd(150), shortfall: 0 })
  })
})

describe('what the cash-up sees', () => {
  test('cash topped up today is in today s drawer, whatever the deposit first was', async () => {
    // The regression this closes: the deposit's row says `bank_transfer` and
    // carries the day it was verified, so a cash top-up went into the drawer
    // and into no figure on the cash-up. A clerk counting found notes they
    // could not explain.
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0012' })

    const before = await listDepositCashArrivals(todayBounds())

    await topUpBookingDeposit({ bookingId, amount: bnd(50), method: 'cash', actorId: null })

    const after = await listDepositCashArrivals(todayBounds())
    const added = sum(after) - sum(before)

    expect(added).toBe(bnd(50))
  })

  test('a topped-up deposit is not counted twice on its own day', async () => {
    // The other half of the same fix. A deposit collected in cash reports what
    // arrived on its day — its figure less everything added since — so the
    // top-up is counted once, as a top-up, rather than again inside the row's
    // grown total. Without the subtraction this day reads BND 50 heavy.
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0014' })

    await topUpBookingDeposit({ bookingId, amount: bnd(50), method: 'cash', actorId: null })

    // A cash deposit can only become short by being repriced, since recording
    // one always writes the quoted figure.
    await raiseQuotedDeposit(bookingId, bnd(150))
    await markCollectedInCash(bookingId)

    const before = await listDepositCashArrivals(todayBounds())

    await topUpBookingDeposit({ bookingId, amount: bnd(50), method: 'cash', actorId: null })

    const after = await listDepositCashArrivals(todayBounds())

    expect(sum(after) - sum(before)).toBe(bnd(50))
  })

  test('a transfer top-up stays out of the drawer', async () => {
    const { bookingId } = await givenShortDeposit({ guestPhone: '+673 730 0013' })

    const before = await listDepositCashArrivals(todayBounds())

    await topUpBookingDeposit({
      bookingId,
      amount: bnd(50),
      method: 'bank_transfer',
      actorId: null,
    })

    const after = await listDepositCashArrivals(todayBounds())

    expect(sum(after)).toBe(sum(before))
  })
})

/** A window wide enough to hold anything these tests wrote. */
function todayBounds(): { start: string; end: string } {
  const now = Date.now()

  return {
    start: new Date(now - 60 * 60 * 1000).toISOString(),
    end: new Date(now + 60 * 60 * 1000).toISOString(),
  }
}

function sum(arrivals: readonly { amount: number }[]): number {
  return arrivals.reduce((total, arrival) => total + arrival.amount, 0)
}

/** The quote moved, the way an amendment moves it. */
async function raiseQuotedDeposit(bookingId: string, quoted: number): Promise<void> {
  const propertyId = await currentPropertyId()

  const { error } = await dataClient()
    .from('booking')
    .update({ security_deposit_cents: quoted })
    .eq('property_id', propertyId)
    .eq('id', bookingId)

  if (error) {
    throw new Error(`Test setup could not reprice the deposit: ${error.message}`)
  }
}

/** The deposit reads as cash in the drawer, the way one taken at the desk does. */
async function markCollectedInCash(bookingId: string): Promise<void> {
  const propertyId = await currentPropertyId()

  const { error } = await dataClient()
    .from('deposit')
    .update({ method: 'cash' })
    .eq('property_id', propertyId)
    .eq('booking_id', bookingId)

  if (error) {
    throw new Error(`Test setup could not mark the deposit cash: ${error.message}`)
  }
}
