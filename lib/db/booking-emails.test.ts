import { describe, expect, test } from 'vitest'

import { bnd } from '@/lib/domain/money'

import { buildBookingEmailMessage } from './booking-emails'
import { createWalkInBooking } from './bookings'
import { listPendingDeposits, verifyDeposit } from './deposits'
import { recordCashPayment } from './payments'
import {
  createPublicDayPassBooking,
  createPublicStayBooking,
  submitPublicTransfer,
  type CreatePublicDayPassInput,
  type CreatePublicStayInput,
} from './public-bookings'
import { bookingInput } from './test/factory'

/**
 * The email a real booking produces (capability A8).
 *
 * The wording is settled in lib/domain/booking-email.test.ts against literals;
 * what only a database can answer is whether the facts reaching the model are
 * the ones the application actually writes — and, in particular, what a
 * deposit-secured booking is told it owes. `booking.paid` is derived by
 * `booking_summary` from the payment rows, so the difference between "the
 * whole stay is owed" and "nothing is owed" is a join rather than a field, and
 * asserting it against a fixture would prove nothing.
 *
 * The send itself is not exercised. Everything up to the POST is.
 */

const ORIGIN = 'https://palmvilla.test'

const CHECK_IN = '2026-11-05'
const CHECK_OUT = '2026-11-08'
const PASS_DATE = '2026-11-05'

const STAY_TOTAL = bnd(750)
const DEPOSIT = bnd(100)

function stayInput(overrides: Partial<CreatePublicStayInput> = {}): CreatePublicStayInput {
  return {
    unitTypeSlug: 'four-bedroom',
    range: { start: CHECK_IN, end: CHECK_OUT },
    guestName: 'Email Guest',
    guestPhone: '+673 700 0101',
    guestEmail: 'guest@example.test',
    vehicles: ['PV 1'],
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

function dayPassInput(overrides: Partial<CreatePublicDayPassInput> = {}): CreatePublicDayPassInput {
  return {
    date: PASS_DATE,
    party: [{ bandId: 'adult', label: 'Adult', count: 1 }],
    headcount: 1,
    chargeableGuests: 1,
    exemptGuests: 0,
    guestName: 'Pass Guest',
    guestPhone: '+673 700 0102',
    guestEmail: 'pass@example.test',
    vehicles: [],
    noVehicle: true,
    total: bnd(10),
    lines: [
      {
        type: 'day_pass',
        description: 'Adult × 1',
        quantity: 1,
        unitPrice: bnd(10),
        amount: bnd(10),
      },
    ],
    ...overrides,
  }
}

async function givenPublicStay(overrides: Partial<CreatePublicStayInput> = {}) {
  const created = await createPublicStayBooking(stayInput(overrides))

  if (!created.ok) {
    throw new Error(`Test setup could not create a public booking: ${created.error.message}`)
  }

  return created.data
}

async function message(kind: 'booking_created' | 'booking_confirmed', bookingId: string) {
  const built = await buildBookingEmailMessage({ kind, bookingId, origin: ORIGIN })

  if (!built.ok) {
    throw new Error(`Expected a message, got ${built.reason}`)
  }

  return built.message
}

describe('the email a created booking produces', () => {
  test('is addressed to the guest and carries their own link', async () => {
    const created = await givenPublicStay()
    const built = await message('booking_created', created.bookingId)

    expect(built.to).toBe('guest@example.test')
    expect(built.subject).toContain(created.reference)
    expect(built.html).toContain(`${ORIGIN}/booking/${created.accessToken}`)
    expect(built.text).toContain(created.reference)
  })

  test('states both amounts, and the deposit apart from the stay', async () => {
    const created = await givenPublicStay()
    const built = await message('booking_created', created.bookingId)

    // Deposit only, everything, and the stay itself — three figures the
    // customer is choosing between.
    expect(built.text).toContain('BND 100.00')
    expect(built.text).toContain('BND 850.00')
    expect(built.text).toContain('BND 750.00')
  })

  test('names the unit type the settings hold, never the door it was assigned', async () => {
    const created = await givenPublicStay()
    const built = await message('booking_created', created.bookingId)

    expect(built.html).toContain('4-bedroom')
    expect(created.unitRef).toBeDefined()
    expect(built.html).not.toContain(created.unitRef ?? 'no unit reference')
  })

  test('a day pass carries no unit and no deposit', async () => {
    const created = await createPublicDayPassBooking(dayPassInput())

    if (!created.ok) {
      throw new Error(`Test setup could not create a day pass: ${created.error.message}`)
    }

    const built = await message('booking_created', created.data.bookingId)

    expect(built.text).not.toContain('security deposit')
    expect(built.text).not.toContain('Unit:')
    expect(built.text).toContain('Day pass:')
  })
})

describe('a booking with nowhere to send', () => {
  test('a booking taken at the desk has no address, so nothing is built', async () => {
    const walkIn = await createWalkInBooking(
      await bookingInput({ checkIn: CHECK_IN, checkOut: CHECK_OUT, unitRef: '3B-01' }),
    )

    if (!walkIn.ok) {
      throw new Error(`Test setup could not create a walk-in: ${walkIn.error.message}`)
    }

    await expect(
      buildBookingEmailMessage({
        kind: 'booking_created',
        bookingId: walkIn.booking.id,
        origin: ORIGIN,
      }),
    ).resolves.toEqual({ ok: false, reason: 'no_address' })
  })

  test('a booking that is gone is not an error', async () => {
    await expect(
      buildBookingEmailMessage({
        kind: 'booking_created',
        bookingId: '00000000-0000-0000-0000-000000000000',
        origin: ORIGIN,
      }),
    ).resolves.toEqual({ ok: false, reason: 'booking_missing' })
  })
})

describe('what a confirmed booking is told it owes', () => {
  /** Books online, promises the deposit, and has the desk verify it. */
  async function givenDepositSecuredBooking() {
    const created = await givenPublicStay()

    const submitted = await submitPublicTransfer(created.accessToken, 'deposit_only')

    if (!submitted.ok) {
      throw new Error(`Test setup could not submit the transfer: ${submitted.error.message}`)
    }

    const pending = await listPendingDeposits()
    const deposit = pending.find((row) => row.bookingId === created.bookingId)

    if (!deposit) {
      throw new Error('Test setup expected a promised deposit on the queue.')
    }

    const verified = await verifyDeposit({
      depositId: deposit.id,
      observedAmount: DEPOSIT,
      match: 'reference',
      actorId: null,
    })

    if (!verified.ok) {
      throw new Error(`Test setup could not verify the deposit: ${verified.error.message}`)
    }

    return { created, verified }
  }

  test('the deposit confirms the booking, and says so about the booking it confirmed', async () => {
    const { created, verified } = await givenDepositSecuredBooking()

    expect(verified.bookingId).toBe(created.bookingId)
    expect(verified.confirmedNow).toBe(true)
  })

  test('the whole stay is still owed, because a deposit is not a payment', async () => {
    const { created } = await givenDepositSecuredBooking()
    const built = await message('booking_confirmed', created.bookingId)

    expect(built.text).toContain('BND 750.00 for the stay is settled when you arrive.')
    expect(built.text).toContain('BND 100.00 security deposit is with us')
  })

  test('once the stay is paid, nothing is owed on arrival', async () => {
    const { created } = await givenDepositSecuredBooking()

    const cash = await recordCashPayment({
      bookingId: created.bookingId,
      amount: STAY_TOTAL,
      actorId: null,
    })

    if (!cash.ok) {
      throw new Error(`Test setup could not record the cash: ${cash.error.message}`)
    }

    // The booking was already confirmed by the deposit, so this settles money
    // and moves nothing — which is exactly the case that must not re-send.
    expect(cash.confirmedNow).toBe(false)

    const built = await message('booking_confirmed', created.bookingId)

    expect(built.text).toContain('Everything is settled')
    expect(built.text).not.toContain('settled when you arrive')
  })
})
