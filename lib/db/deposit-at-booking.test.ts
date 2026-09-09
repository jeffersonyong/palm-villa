import { describe, expect, test } from 'vitest'

import { bnd, type Cents } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { listAuditEvents } from './audit'
import { getBookingById } from './bookings'
import {
  getDepositByBookingId,
  listHeldDeposits,
  listPendingDeposits,
  recordBookingDeposit,
} from './deposits'
import { currentPropertyId } from './property'
import { createPublicStayBooking, type CreatePublicStayInput } from './public-bookings'
import { givenBooking } from './test/factory'

/**
 * The security deposit taken at the desk (capability B16, staff half).
 *
 * ── What these exist to prove ─────────────────────────────────────────────
 *
 * Not that a row can be written — that much is a column. What is worth
 * asserting is the three things this path could plausibly get wrong, each of
 * which would be silent:
 *
 *   1. **Cash confirms a booking without paying for it.** prd.md §9.1's
 *      reversal makes the BND 100 what secures a unit while the stay stays
 *      fully owed, so a deposit that quietly moved the balance — or a
 *      confirmation that implied the stay was settled — would undo the
 *      distinction §10.7 spent a slice making legible.
 *   2. **A transfer is not money.** It goes to the queue and stays off the
 *      ledger until somebody reads the bank, exactly as the customer's own
 *      promise does. A property cannot owe back what it has not been given.
 *   3. **One deposit per booking, under concurrency.** Two clerks at two
 *      counters is the ordinary way a double deposit gets taken, and the
 *      count-then-insert in the function is only safe because the unique
 *      constraint is behind it.
 *
 * Dates and phone numbers are deliberately distinct from the other db suites:
 * these run against the same persistent database, and a shared range is a
 * flaky exclusion-constraint failure rather than a real one.
 */

const CHECK_IN = '2027-02-10'
const CHECK_OUT = '2027-02-13'
const DEPOSIT = bnd(100)
const STAY_TOTAL = bnd(750)

function heldStayInput(overrides: Partial<CreatePublicStayInput> = {}): CreatePublicStayInput {
  return {
    unitTypeSlug: 'four-bedroom',
    range: { start: CHECK_IN, end: CHECK_OUT },
    guestName: 'Desk Deposit',
    guestPhone: '+673 720 0001',
    guestEmail: null,
    vehicles: ['DD 1'],
    noVehicle: false,
    chargeableGuests: 2,
    exemptGuests: 0,
    total: STAY_TOTAL,
    securityDeposit: DEPOSIT,
    lines: [
      {
        type: 'accommodation',
        description: '4-bedroom × 3 nights',
        quantity: 3,
        unitPrice: bnd(250),
        amount: STAY_TOTAL,
      },
    ],
    ...overrides,
  }
}

/** A booking sitting exactly where a customer leaves one: held, nothing paid. */
async function givenHeldBooking(
  overrides: Partial<CreatePublicStayInput> = {},
): Promise<{ id: string; reference: string }> {
  const created = await createPublicStayBooking(heldStayInput(overrides))

  if (!created.ok) {
    throw new Error(`Test setup could not hold a unit: ${created.error.message}`)
  }

  return { id: created.data.bookingId, reference: created.data.reference }
}

async function actionsFor(entityType: string, entityId: string): Promise<readonly string[]> {
  const events = await listAuditEvents(entityType, entityId)

  return events.map((event) => event.action)
}

async function depositRowCount(bookingId: string): Promise<number> {
  const propertyId = await currentPropertyId()
  const { count, error } = await dataClient()
    .from('deposit')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('booking_id', bookingId)

  if (error) {
    throw new Error(`Could not count deposits: ${error.message}`)
  }

  return count ?? 0
}

describe('cash taken at the desk', () => {
  test('collects the deposit and confirms the booking', async () => {
    // Arrange
    const booking = await givenHeldBooking({ guestPhone: '+673 720 1001' })

    // Act
    const result = await recordBookingDeposit({
      bookingId: booking.id,
      method: 'cash',
      actorId: null,
    })

    // Assert
    expect(result).toMatchObject({
      ok: true,
      amount: DEPOSIT,
      status: 'confirmed',
      confirmedNow: true,
    })

    const deposit = await getDepositByBookingId(booking.id)

    expect(deposit?.method).toBe('cash')
    expect(deposit?.collectedAt).not.toBeNull()
    expect(deposit?.promisedAt).toBeNull()
  })

  test('leaves the stay owed in full', async () => {
    // The whole point of prd.md §9.1: a confirmed booking is secured, not
    // paid. A deposit that moved `paid` would make every deposit-secured
    // booking read as part-settled against its own total.
    const booking = await givenHeldBooking({ guestPhone: '+673 720 1002' })

    await recordBookingDeposit({ bookingId: booking.id, method: 'cash', actorId: null })

    const after = await getBookingById(booking.id)

    expect(after?.status).toBe('confirmed')
    expect(after?.paid).toBe(0 as Cents)
    expect(after?.total).toBe(STAY_TOTAL)
  })

  test('puts the money on the ledger the property owes back', async () => {
    const booking = await givenHeldBooking({ guestPhone: '+673 720 1003' })

    await recordBookingDeposit({ bookingId: booking.id, method: 'cash', actorId: null })

    const held = await listHeldDeposits()

    expect(held.some((deposit) => deposit.bookingId === booking.id)).toBe(true)
  })

  test('records the collection and the confirmation as separate events', async () => {
    // Two facts, two rows: what happened to the money, and what happened to
    // the booking. The trail says both rather than making a reader infer one.
    const booking = await givenHeldBooking({ guestPhone: '+673 720 1004' })

    await recordBookingDeposit({ bookingId: booking.id, method: 'cash', actorId: null })

    const deposit = await getDepositByBookingId(booking.id)

    expect(await actionsFor('deposit', deposit?.id ?? '')).toContain('deposit.collected')
    expect(await actionsFor('booking', booking.id)).toContain('booking.secure_with_deposit')
  })
})

describe('a transfer promised to the desk', () => {
  test('joins the verification queue and holds the unit', async () => {
    // Arrange
    const booking = await givenHeldBooking({ guestPhone: '+673 720 2001' })

    // Act
    const result = await recordBookingDeposit({
      bookingId: booking.id,
      method: 'bank_transfer',
      actorId: null,
    })

    // Assert
    expect(result).toMatchObject({
      ok: true,
      status: 'awaiting_payment_verification',
      confirmedNow: false,
    })

    const pending = await listPendingDeposits()

    expect(pending.some((deposit) => deposit.bookingId === booking.id)).toBe(true)
  })

  test('is not money until somebody has looked', async () => {
    // The one state in which a deposit row is not a liability. A ledger that
    // counted it would overstate what the property holds by every transfer
    // nobody ever sent.
    const booking = await givenHeldBooking({ guestPhone: '+673 720 2002' })

    await recordBookingDeposit({
      bookingId: booking.id,
      method: 'bank_transfer',
      actorId: null,
    })

    const deposit = await getDepositByBookingId(booking.id)
    const held = await listHeldDeposits()

    expect(deposit?.collectedAt).toBeNull()
    expect(deposit?.promisedAt).not.toBeNull()
    expect(deposit?.stage).toBe('awaiting_verification')
    expect(held.some((entry) => entry.bookingId === booking.id)).toBe(false)
  })

  test('is recorded as awaited rather than collected', async () => {
    const booking = await givenHeldBooking({ guestPhone: '+673 720 2003' })

    await recordBookingDeposit({
      bookingId: booking.id,
      method: 'bank_transfer',
      actorId: null,
    })

    const deposit = await getDepositByBookingId(booking.id)

    expect(await actionsFor('deposit', deposit?.id ?? '')).toContain('deposit.promised')
    expect(await actionsFor('booking', booking.id)).toContain('booking.submit_payment')
  })
})

describe('what it refuses', () => {
  test('a second deposit against the same booking', async () => {
    const booking = await givenHeldBooking({ guestPhone: '+673 720 3001' })

    await recordBookingDeposit({ bookingId: booking.id, method: 'cash', actorId: null })
    const second = await recordBookingDeposit({
      bookingId: booking.id,
      method: 'cash',
      actorId: null,
    })

    expect(second).toMatchObject({ ok: false })
    if (second.ok) return

    expect(second.error.code).toBe('already_recorded')
    expect(await depositRowCount(booking.id)).toBe(1)
  })

  test('exactly one row survives four clerks pressing at once', async () => {
    // Two counters and one guest is how a double deposit actually gets taken.
    // The count-then-insert in the function is only safe because the unique
    // constraint is behind it, and this is that claim under load.
    const booking = await givenHeldBooking({ guestPhone: '+673 720 3002' })

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        recordBookingDeposit({ bookingId: booking.id, method: 'cash', actorId: null }),
      ),
    )

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(await depositRowCount(booking.id)).toBe(1)
  })

  test('a booking that quotes no deposit', async () => {
    // A waiver, or a stream that never carried one. Writing a row for nothing
    // would put a liability on the ledger against a decision somebody made not
    // to have one.
    const booking = await givenHeldBooking({
      guestPhone: '+673 720 3003',
      securityDeposit: 0 as Cents,
    })

    const result = await recordBookingDeposit({
      bookingId: booking.id,
      method: 'cash',
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false })
    if (result.ok) return

    expect(result.error.code).toBe('no_deposit_quoted')
    expect(await depositRowCount(booking.id)).toBe(0)
  })
})

describe('a promise settled in cash', () => {
  test('fulfils the standing row and confirms the booking', async () => {
    // The sequence that stranded a clerk before 20260914000200: the customer
    // says they transferred, the transfer never lands, and they walk in with
    // the notes. prd.md §11 makes this judgement at the door already.
    const booking = await givenHeldBooking({ guestPhone: '+673 720 5001' })

    await recordBookingDeposit({
      bookingId: booking.id,
      method: 'bank_transfer',
      actorId: null,
    })

    const promised = await getDepositByBookingId(booking.id)

    // Act
    const settled = await recordBookingDeposit({
      bookingId: booking.id,
      method: 'cash',
      actorId: null,
    })

    // Assert
    expect(settled).toMatchObject({ ok: true, status: 'confirmed', confirmedNow: true })

    const deposit = await getDepositByBookingId(booking.id)

    // The same row, corrected to how the money actually arrived.
    expect(deposit?.id).toBe(promised?.id)
    expect(deposit?.method).toBe('cash')
    expect(deposit?.collectedAt).not.toBeNull()
    expect(await depositRowCount(booking.id)).toBe(1)
  })

  test('keeps the promise as the record of what the customer claimed', async () => {
    // The question asked afterwards is whether they ever said they had sent
    // it, so correcting the method must not erase the claim.
    const booking = await givenHeldBooking({ guestPhone: '+673 720 5002' })

    await recordBookingDeposit({
      bookingId: booking.id,
      method: 'bank_transfer',
      actorId: null,
    })
    await recordBookingDeposit({ bookingId: booking.id, method: 'cash', actorId: null })

    const deposit = await getDepositByBookingId(booking.id)

    expect(deposit?.promisedAt).not.toBeNull()
  })

  test('leaves the queue, and the stay still owed', async () => {
    const booking = await givenHeldBooking({ guestPhone: '+673 720 5003' })

    await recordBookingDeposit({
      bookingId: booking.id,
      method: 'bank_transfer',
      actorId: null,
    })
    await recordBookingDeposit({ bookingId: booking.id, method: 'cash', actorId: null })

    const pending = await listPendingDeposits()
    const held = await listHeldDeposits()
    const after = await getBookingById(booking.id)

    expect(pending.some((entry) => entry.bookingId === booking.id)).toBe(false)
    expect(held.some((entry) => entry.bookingId === booking.id)).toBe(true)
    expect(after?.paid).toBe(0 as Cents)
  })

  test('refuses a second transfer against a standing promise', async () => {
    // Replacing one awaited transfer with another says nothing new and clears
    // nothing, so it is refused with the sentence that names the way out.
    const booking = await givenHeldBooking({ guestPhone: '+673 720 5004' })

    await recordBookingDeposit({
      bookingId: booking.id,
      method: 'bank_transfer',
      actorId: null,
    })

    const second = await recordBookingDeposit({
      bookingId: booking.id,
      method: 'bank_transfer',
      actorId: null,
    })

    expect(second).toMatchObject({ ok: false })
    if (second.ok) return

    expect(second.error.code).toBe('already_promised')
    expect(await depositRowCount(booking.id)).toBe(1)
  })

  test('refuses cash against a deposit already in the safe', async () => {
    const booking = await givenHeldBooking({ guestPhone: '+673 720 5005' })

    await recordBookingDeposit({ bookingId: booking.id, method: 'cash', actorId: null })

    const second = await recordBookingDeposit({
      bookingId: booking.id,
      method: 'cash',
      actorId: null,
    })

    expect(second).toMatchObject({ ok: false })
    if (second.ok) return

    expect(second.error.code).toBe('already_recorded')
  })
})

describe('a booking that is already confirmed', () => {
  test('takes the deposit without confirming it twice', async () => {
    // The catch-up case: a walk-in paid the stay in cash and the deposit is
    // collected afterwards. Writing `confirmed → confirmed` would put a second
    // confirmation in a history for a booking that never moved.
    const booking = await givenBooking({
      unitRef: '3B-11',
      checkIn: '2027-03-04',
      checkOut: '2027-03-06',
    })

    expect(booking.status).toBe('confirmed')

    const result = await recordBookingDeposit({
      bookingId: booking.id,
      method: 'cash',
      actorId: null,
    })

    expect(result).toMatchObject({ ok: true, status: 'confirmed', confirmedNow: false })

    const actions = await actionsFor('booking', booking.id)

    expect(actions).not.toContain('booking.secure_with_deposit')
    expect(actions).not.toContain('booking.submit_payment')
  })
})

describe('the amount', () => {
  test('is the figure the booking quoted, never one a caller chose', async () => {
    // prd.md §11: what is held must not move when an amendment reprices the
    // stay, so the function reads it under the row lock and the signature has
    // nowhere to pass one.
    const booking = await givenHeldBooking({
      guestPhone: '+673 720 4001',
      securityDeposit: bnd(250),
    })

    const result = await recordBookingDeposit({
      bookingId: booking.id,
      method: 'cash',
      actorId: null,
    })

    expect(result).toMatchObject({ ok: true, amount: bnd(250) })

    const deposit = await getDepositByBookingId(booking.id)

    expect(deposit?.amount).toBe(bnd(250))
  })
})
