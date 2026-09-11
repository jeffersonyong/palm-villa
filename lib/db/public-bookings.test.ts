import { afterEach, describe, expect, test } from 'vitest'

import { hashPublicKey } from '@/lib/auth/access-token'
import { bnd } from '@/lib/domain/money'
import { PUBLIC_LIMITS } from '@/lib/domain/public-booking'
import { dataClient } from '@/lib/supabase/data'

import { createWalkInBooking, getBookingById } from './bookings'
import { listDayPassHeadroom } from './day-passes'
import { listPendingDeposits } from './deposits'
import { currentPropertyId } from './property'
import { listDocumentsForBooking } from './documents'
import {
  attachPublicDocument,
  createPublicDayPassBooking,
  createPublicStayBooking,
  getBookingByAccessToken,
  notePublicAttempt,
  submitPublicTransfer,
  type CreatePublicDayPassInput,
  type CreatePublicStayInput,
} from './public-bookings'
import { TEST_PNG, bookingInput } from './test/factory'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * The writes a customer makes for themselves (capabilities A1–A4).
 *
 * Two of these are concurrency tests, and they are the point of the file. G1
 * is already proved for units in no-double-booking.test.ts, but the public
 * stay path adds something that file does not cover: the writer picks the unit
 * *itself*, walking candidates until one is accepted. That loop could quietly
 * turn a lost race into a second booking on the same door, so it is fired at
 * every unit of a type at once and asked to produce exactly one booking per
 * door and no more.
 *
 * The day-pass check has no constraint behind it at all — a headcount against
 * a ceiling is a property of every row on a date, which no exclusion
 * constraint can express — so the advisory lock in
 * `create_public_day_pass_booking()` is the whole control, and this is its
 * evidence.
 *
 * ── How to see the day-pass one fail ───────────────────────────────────────
 *
 *   npm run db:start
 *   Edit create_public_day_pass_booking() in
 *     supabase/migrations/20260913000100_public_bookings_and_day_passes.sql,
 *     removing the `perform pg_advisory_xact_lock(...)` line.
 *   npm run db:reset
 *   npx vitest run --project integration lib/db/public-bookings.test.ts
 *
 * Several bookings then read the same headroom and all pass the check, so the
 * facility is oversold and the winner count exceeds the capacity.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CHECK_IN = '2026-10-05'
const CHECK_OUT = '2026-10-08'
const PASS_DATE = '2026-10-05'

function stayInput(overrides: Partial<CreatePublicStayInput> = {}): CreatePublicStayInput {
  return {
    unitTypeSlug: 'four-bedroom',
    range: { start: CHECK_IN, end: CHECK_OUT },
    guestName: 'Public Guest',
    guestPhone: '+673 700 0001',
    guestEmail: 'guest@example.test',
    vehicles: ['PV 1'],
    noVehicle: false,
    chargeableGuests: 2,
    exemptGuests: 0,
    total: bnd(750),
    securityDeposit: bnd(100),
    lines: [
      {
        type: 'accommodation',
        description: '4-bedroom × 3 nights',
        quantity: 3,
        unitPrice: bnd(250),
        amount: bnd(750),
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
    guestPhone: '+673 700 0002',
    guestEmail: null,
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

/**
 * Sets a capacity on the pool and puts it back afterwards.
 *
 * The settings tables are not cleared between tests — they are configuration
 * rather than transactional data — so a test that changes one has to restore
 * it or every later test runs against a building somebody quietly resized.
 */
async function withPoolCapacity(capacity: number | null): Promise<void> {
  const propertyId = await currentPropertyId()

  const { error } = await dataClient()
    .from('facility')
    .update({ day_pass_capacity: capacity })
    .eq('property_id', propertyId)
    .eq('slug', 'swimming-pool')

  if (error) {
    throw new Error(`Could not set the pool capacity: ${error.message}`)
  }
}

afterEach(async () => {
  await withPoolCapacity(null)
})

describe('holding a unit from the public site', () => {
  test('creates a held booking with no payment and no deposit against it', async () => {
    const created = await createPublicStayBooking(stayInput())

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const booking = await getBookingById(created.data.bookingId)

    expect(booking?.status).toBe('held')
    expect(booking?.stream).toBe('short_stay')
    // Nothing has been paid and nothing is being held: the customer has made a
    // booking, not a payment (prd.md §9.3). The money is asked for next.
    expect(booking?.paid).toBe(0)
    expect(booking?.securityDeposit).toBe(bnd(100))
    expect(await listPendingDeposits()).toHaveLength(0)
  })

  test('records the email, which no booking has ever carried before', async () => {
    const created = await createPublicStayBooking(stayInput())

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const booking = await getBookingById(created.data.bookingId)

    expect(booking?.guestEmail).toBe('guest@example.test')
  })

  test('the held unit is no longer available to the desk', async () => {
    // The whole reason the booking is `held` rather than `draft`: its occupancy
    // row counts against the exclusion constraint, so a walk-in cannot be sold
    // the same door for the same nights.
    const created = await createPublicStayBooking(
      stayInput({ unitTypeSlug: 'semi-detached', guestPhone: '+673 700 0003' }),
    )

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const clash = await createWalkInBooking(
      await bookingInput({
        unitRef: created.data.unitRef as string,
        checkIn: CHECK_IN,
        checkOut: CHECK_OUT,
      }),
    )

    expect(clash.ok).toBe(false)

    if (clash.ok) return

    expect(clash.error.code).toBe('unit_unavailable')
  })

  test('assigns the lowest free door, and steps past one that is taken', async () => {
    // N9 [A]: staff assign units, so the customer names a type and the system
    // picks. Lowest ref first makes it predictable rather than arbitrary.
    const first = await createPublicStayBooking(stayInput({ unitTypeSlug: 'four-bedroom' }))

    expect(first.ok).toBe(true)

    if (!first.ok) return

    const second = await createPublicStayBooking(
      stayInput({ unitTypeSlug: 'four-bedroom', guestPhone: '+673 700 0004' }),
    )

    expect(second.ok).toBe(true)

    if (!second.ok) return

    expect(first.data.unitRef).toBeDefined()
    expect(second.data.unitRef).toBeDefined()
    expect(second.data.unitRef).not.toBe(first.data.unitRef)
    expect([first.data.unitRef, second.data.unitRef].sort()).toEqual(
      [first.data.unitRef, second.data.unitRef].sort(),
    )
  })

  test('refuses when every unit of the type is taken, and leaves no guest behind', async () => {
    // The 2-bedroom type exists and has zero units until N1 is answered, which
    // makes it the honest way to ask for a type with nothing free.
    const refused = await createPublicStayBooking(
      stayInput({ unitTypeSlug: 'two-bedroom', guestName: 'Rolled Back' }),
    )

    expect(refused.ok).toBe(false)

    if (refused.ok) return

    expect(refused.error.code).toBe('unit_unavailable')

    const { data } = await dataClient().from('guest').select('name').eq('name', 'Rolled Back')

    expect(data).toEqual([])
  })

  test('lets exactly one booking take each door when eight arrive at once', async () => {
    // Six semi-detached units are seeded, so six of the eight should win — each
    // on a different door — and two should be refused. The candidate loop is
    // what makes a lost race into a different room; the exclusion constraint is
    // what makes it a refusal once there are no rooms left.
    const attempts = Array.from({ length: 8 }, (_unused, index) =>
      stayInput({
        unitTypeSlug: 'semi-detached',
        guestName: `Racer ${index + 1}`,
        guestPhone: `+673 800 ${String(index).padStart(4, '0')}`,
      }),
    )

    const results = await Promise.all(attempts.map((input) => createPublicStayBooking(input)))

    const winners = results.filter((result) => result.ok)
    const losers = results.filter((result) => !result.ok)

    expect(winners).toHaveLength(6)
    expect(losers).toHaveLength(2)

    // The part a single-winner test would not catch: two bookings on one door.
    const doors = winners.map((result) => (result.ok ? result.data.unitRef : null))

    expect(new Set(doors).size).toBe(6)
  })
})

describe('the cap on unpaid bookings per phone', () => {
  test('refuses once a number is holding its limit, and says so', async () => {
    const phone = '+673 900 0001'

    for (let index = 0; index < PUBLIC_LIMITS.openBookingsPerPhone; index += 1) {
      const created = await createPublicStayBooking(
        stayInput({ unitTypeSlug: 'three-bedroom', guestPhone: phone }),
      )

      expect(created.ok).toBe(true)
    }

    const refused = await createPublicStayBooking(
      stayInput({ unitTypeSlug: 'three-bedroom', guestPhone: phone }),
    )

    expect(refused.ok).toBe(false)

    if (refused.ok) return

    expect(refused.error.code).toBe('too_many_open_bookings')
  })

  test('counts only the bookings a customer made themselves', async () => {
    // A desk taking four advance bookings for one regular is doing its job.
    // The cap keys on `created_by is null`, which is what tells the two apart.
    const phone = '+673 900 0002'

    for (let index = 0; index < 4; index += 1) {
      const walkIn = await createWalkInBooking(
        await bookingInput({
          unitRef: `3B-${String(index + 20).padStart(2, '0')}`,
          checkIn: CHECK_IN,
          checkOut: CHECK_OUT,
          guestPhone: phone,
        }),
      )

      expect(walkIn.ok).toBe(true)
    }

    const created = await createPublicStayBooking(
      stayInput({ unitTypeSlug: 'three-bedroom', guestPhone: phone }),
    )

    expect(created.ok).toBe(true)
  })
})

describe('selling a day pass', () => {
  test('creates a held booking with a date and a headcount, and no unit', async () => {
    const created = await createPublicDayPassBooking(dayPassInput())

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const booking = await getBookingById(created.data.bookingId)

    expect(booking?.stream).toBe('day_pass')
    expect(booking?.status).toBe('held')
    // prd.md §6.1: a day pass occupies no unit. Its date lives on the pass.
    expect(booking?.stay).toBeNull()
    expect(booking?.dayPass).toEqual({ date: PASS_DATE, headcount: 1 })
    expect(booking?.securityDeposit).toBe(0)
  })

  test('counts against the headroom for its date and no other', async () => {
    await createPublicDayPassBooking(dayPassInput({ headcount: 4, party: [] }))

    const headroom = await listDayPassHeadroom({ from: PASS_DATE, to: '2026-10-06' })

    expect(headroom[0]).toMatchObject({ date: PASS_DATE, taken: 4 })
    expect(headroom[1]).toMatchObject({ date: '2026-10-06', taken: 0 })
  })

  test('is unlimited while no capacity has been agreed', async () => {
    // prd.md C2: every capacity ships null, so this is the path production
    // actually runs until the owner types a number.
    const created = await createPublicDayPassBooking(dayPassInput({ headcount: 500, party: [] }))

    expect(created.ok).toBe(true)

    const headroom = await listDayPassHeadroom({ from: PASS_DATE, to: PASS_DATE })

    expect(headroom[0]?.capacity).toBeNull()
  })

  test('refuses a party that will not fit, and says how many places are left', async () => {
    await withPoolCapacity(5)
    await createPublicDayPassBooking(dayPassInput({ headcount: 3, party: [] }))

    const refused = await createPublicDayPassBooking(
      dayPassInput({ headcount: 3, party: [], guestPhone: '+673 700 0009' }),
    )

    expect(refused.ok).toBe(false)

    if (refused.ok) return

    expect(refused.error.code).toBe('capacity_exceeded')
    expect(refused.error.remaining).toBe(2)
  })

  test('admits exactly the capacity when eight buyers arrive at once', async () => {
    // No constraint can express this rule, so the advisory lock is the whole
    // control. Eight parties of one against a ceiling of three.
    await withPoolCapacity(3)

    const attempts = Array.from({ length: 8 }, (_unused, index) =>
      dayPassInput({
        guestName: `Swimmer ${index + 1}`,
        guestPhone: `+673 850 ${String(index).padStart(4, '0')}`,
      }),
    )

    const results = await Promise.all(attempts.map((input) => createPublicDayPassBooking(input)))

    expect(results.filter((result) => result.ok)).toHaveLength(3)
    expect(results.filter((result) => !result.ok)).toHaveLength(5)

    const headroom = await listDayPassHeadroom({ from: PASS_DATE, to: PASS_DATE })

    expect(headroom[0]?.taken).toBe(3)
  })

  test('a cancelled pass gives its places back', async () => {
    await withPoolCapacity(2)

    const created = await createPublicDayPassBooking(dayPassInput({ headcount: 2, party: [] }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const full = await createPublicDayPassBooking(
      dayPassInput({ headcount: 1, party: [], guestPhone: '+673 700 0011' }),
    )

    expect(full.ok).toBe(false)

    // The same status rule the exclusion constraint uses: cancelled releases.
    const { error } = await dataClient()
      .from('booking')
      .update({ status: 'cancelled' })
      .eq('id', created.data.bookingId)

    expect(error).toBeNull()

    const afterCancel = await createPublicDayPassBooking(
      dayPassInput({ headcount: 1, party: [], guestPhone: '+673 700 0012' }),
    )

    expect(afterCancel.ok).toBe(true)
  })
})

describe('the private link', () => {
  test('finds the booking it was minted for', async () => {
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const found = await getBookingByAccessToken(created.data.accessToken)

    expect(found?.id).toBe(created.data.bookingId)
    expect(found?.accessToken).toBe(created.data.accessToken)
  })

  test('finds nothing for a token of the wrong shape, without querying', async () => {
    expect(await getBookingByAccessToken('nope')).toBeNull()
    expect(await getBookingByAccessToken('')).toBeNull()
  })

  test('finds nothing for a well-formed token nobody holds', async () => {
    expect(await getBookingByAccessToken('AAAAAAAAAAAAAAAAAAAAAA')).toBeNull()
  })
})

describe('saying the transfer has been made', () => {
  test('raises a pending deposit for a stay, and no payment', async () => {
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const submitted = await submitPublicTransfer(created.data.accessToken)

    expect(submitted.ok).toBe(true)

    if (!submitted.ok) return

    expect(submitted.data.raised).toBe('deposit')
    expect(submitted.data.amount).toBe(bnd(100))

    const booking = await getBookingById(created.data.bookingId)

    expect(booking?.status).toBe('awaiting_payment_verification')

    // The invariant prd.md §9.1 spends a paragraph on: the deposit is not a
    // payment, so the stay is still owed in full and nothing reads as short.
    expect(booking?.paid).toBe(0)

    const pending = await listPendingDeposits()

    expect(pending).toHaveLength(1)
    expect(pending[0]?.amount).toBe(bnd(100))
    expect(pending[0]?.collectedAt).toBeNull()
    expect(pending[0]?.promisedAt).not.toBeNull()
    expect(pending[0]?.stage).toBe('awaiting_verification')
  })

  test('raises both rows when the customer settles the stay up front', async () => {
    // The second of the two cases the client named on 10 September 2026: "the
    // deposit only, or the full amount with the deposit". One transfer, two
    // rows, because a refundable liability and revenue are different money.
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const submitted = await submitPublicTransfer(created.data.accessToken, 'everything')

    expect(submitted.ok).toBe(true)

    if (!submitted.ok) return

    expect(submitted.data.raised).toBe('deposit_and_payment')
    // What the customer sends in one go: the deposit plus the stay.
    expect(submitted.data.amount).toBe(bnd(100) + bnd(750))

    const pending = await listPendingDeposits()

    expect(pending).toHaveLength(1)
    expect(pending[0]?.amount).toBe(bnd(100))

    const { data } = await dataClient()
      .from('payment')
      .select('expected_amount_cents, amount_cents, status')
      .eq('booking_id', created.data.bookingId)

    expect(data).toHaveLength(1)
    expect(data?.[0]).toMatchObject({
      expected_amount_cents: bnd(750),
      amount_cents: null,
      status: 'pending_verification',
    })

    // Still nothing paid: both rows are promises until somebody looks.
    const booking = await getBookingById(created.data.bookingId)

    expect(booking?.paid).toBe(0)
  })

  test('a day pass ignores the choice, because there is nothing to defer', async () => {
    // The form never offers it; a hand-written request could still send it.
    const created = await createPublicDayPassBooking(dayPassInput())

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const submitted = await submitPublicTransfer(created.data.accessToken, 'everything')

    expect(submitted.ok).toBe(true)

    if (!submitted.ok) return

    expect(submitted.data.raised).toBe('payment')
    expect(submitted.data.amount).toBe(bnd(10))
    expect(await listPendingDeposits()).toHaveLength(0)
  })

  test('raises a payment for a day pass, because there is no unit to secure', async () => {
    const created = await createPublicDayPassBooking(dayPassInput())

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const submitted = await submitPublicTransfer(created.data.accessToken)

    expect(submitted.ok).toBe(true)

    if (!submitted.ok) return

    expect(submitted.data.raised).toBe('payment')
    expect(submitted.data.amount).toBe(bnd(10))
    expect(await listPendingDeposits()).toHaveLength(0)
  })

  test('a promised deposit is not on the held ledger', async () => {
    // E1 answers what the property owes back right now. Money nobody has seen
    // is not part of that answer.
    const { listHeldDeposits } = await import('./deposits')

    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    await submitPublicTransfer(created.data.accessToken)

    expect(await listHeldDeposits()).toHaveLength(0)
    expect(await listPendingDeposits()).toHaveLength(1)
  })

  test('refuses a second press, rather than raising a second row', async () => {
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    await submitPublicTransfer(created.data.accessToken)

    const again = await submitPublicTransfer(created.data.accessToken)

    expect(again.ok).toBe(false)

    if (again.ok) return

    expect(again.error.code).toBe('status_changed')
    expect(await listPendingDeposits()).toHaveLength(1)
  })

  test('two simultaneous presses raise one row between them', async () => {
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const [first, second] = await Promise.all([
      submitPublicTransfer(created.data.accessToken),
      submitPublicTransfer(created.data.accessToken),
    ])

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1)
    expect(await listPendingDeposits()).toHaveLength(1)
  })

  test('says nothing useful about a token nobody holds', async () => {
    const submitted = await submitPublicTransfer('AAAAAAAAAAAAAAAAAAAAAA')

    expect(submitted.ok).toBe(false)

    if (submitted.ok) return

    expect(submitted.error.code).toBe('not_found')
  })
})

describe('the attempt counter', () => {
  test('allows up to the limit and refuses past it', async () => {
    const keyHash = hashPublicKey('203.0.113.50')

    for (let index = 0; index < 3; index += 1) {
      expect(
        await notePublicAttempt({ kind: 'booking:ip', keyHash, windowSeconds: 3600, limit: 3 }),
      ).toBe(true)
    }

    expect(
      await notePublicAttempt({ kind: 'booking:ip', keyHash, windowSeconds: 3600, limit: 3 }),
    ).toBe(false)
  })

  test('counts each caller separately', async () => {
    const one = hashPublicKey('203.0.113.51')
    const two = hashPublicKey('203.0.113.52')

    await notePublicAttempt({ kind: 'booking:ip', keyHash: one, windowSeconds: 3600, limit: 1 })

    expect(
      await notePublicAttempt({ kind: 'booking:ip', keyHash: two, windowSeconds: 3600, limit: 1 }),
    ).toBe(true)
  })

  test('counts each kind separately', async () => {
    // Booking and pressing "I have transferred" are different acts with
    // different limits, and one must not exhaust the other.
    const keyHash = hashPublicKey('203.0.113.53')

    await notePublicAttempt({ kind: 'booking:ip', keyHash, windowSeconds: 3600, limit: 1 })

    expect(
      await notePublicAttempt({ kind: 'submit:ip', keyHash, windowSeconds: 3600, limit: 1 }),
    ).toBe(true)
  })

  test('starts again in the next window', async () => {
    // A one-second window, so the boundary is reachable in a test. The counter
    // keys on the floor of now/window, so the next second is a new row.
    const keyHash = hashPublicKey('203.0.113.54')

    expect(
      await notePublicAttempt({ kind: 'booking:ip', keyHash, windowSeconds: 1, limit: 1 }),
    ).toBe(true)
    expect(
      await notePublicAttempt({ kind: 'booking:ip', keyHash, windowSeconds: 1, limit: 1 }),
    ).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 1100))

    expect(
      await notePublicAttempt({ kind: 'booking:ip', keyHash, windowSeconds: 1, limit: 1 }),
    ).toBe(true)
  })
})

/* ── What the customer sends us (capabilities A6, A7) ─────────────────────── */

/**
 * The upload path, from the token inwards.
 *
 * What these prove is the half `documents.test.ts` cannot: that the right rows
 * are found from a token alone. The filing rule is the interesting one, and it
 * is prd.md §10.3's — a customer who settles everything up front makes ONE
 * transfer against TWO rows, so one screenshot has to reach both or one of the
 * two accounting packs is assembled without its evidence.
 */
describe('a file the customer sends through their own link', () => {
  test('files an identity document against the booking', async () => {
    // Arrange
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    // Act
    const result = await attachPublicDocument({
      token: created.data.accessToken,
      kind: 'identity',
      bytes: TEST_PNG,
      filename: 'ic.png',
    })

    // Assert
    expect(result.ok).toBe(true)

    const held = await listDocumentsForBooking(created.data.bookingId, 'identity')

    expect(held).toHaveLength(1)
    // Nobody performed it, which is what every public write records.
    expect(held[0]?.uploadedBy).toBeNull()
  })

  test('files one slip against the deposit for the ordinary online stay', async () => {
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    await submitPublicTransfer(created.data.accessToken)

    const result = await attachPublicDocument({
      token: created.data.accessToken,
      kind: 'payment_slip',
      bytes: TEST_PNG,
      filename: 'transfer.png',
    })

    expect(result.ok).toBe(true)

    const slips = await listDocumentsForBooking(created.data.bookingId, 'payment_slip')

    expect(slips).toHaveLength(1)
    expect(slips[0]?.depositId).not.toBeNull()
    expect(slips[0]?.paymentId).toBeNull()
  })

  test('files the same slip against both rows when the stay was settled up front', async () => {
    // One transfer, two rows, and they stay two (prd.md §10.3). Each carries
    // its own seven-year clock and its own pack, so they cannot share one row.
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    await submitPublicTransfer(created.data.accessToken, 'everything')

    const result = await attachPublicDocument({
      token: created.data.accessToken,
      kind: 'payment_slip',
      bytes: TEST_PNG,
      filename: 'transfer.png',
    })

    expect(result.ok).toBe(true)

    const slips = await listDocumentsForBooking(created.data.bookingId, 'payment_slip')

    expect(slips).toHaveLength(2)
    expect(slips.filter((slip) => slip.depositId !== null)).toHaveLength(1)
    expect(slips.filter((slip) => slip.paymentId !== null)).toHaveLength(1)
  })

  test('files one slip against the payment for a day pass, which has no deposit', async () => {
    const created = await createPublicDayPassBooking(dayPassInput())

    expect(created.ok).toBe(true)

    if (!created.ok) return

    await submitPublicTransfer(created.data.accessToken)

    const result = await attachPublicDocument({
      token: created.data.accessToken,
      kind: 'payment_slip',
      bytes: TEST_PNG,
      filename: 'transfer.png',
    })

    expect(result.ok).toBe(true)

    const slips = await listDocumentsForBooking(created.data.bookingId, 'payment_slip')

    expect(slips).toHaveLength(1)
    expect(slips[0]?.paymentId).not.toBeNull()
    expect(slips[0]?.depositId).toBeNull()
  })

  test('refuses a slip before the customer has said they transferred', async () => {
    // There is no deposit and no payment row yet, so there is nothing for the
    // slip to be evidence OF. A sequence to explain, not an error to log.
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    const result = await attachPublicDocument({
      token: created.data.accessToken,
      kind: 'payment_slip',
      bytes: TEST_PNG,
      filename: 'early.png',
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe('nothing_to_evidence')
  })

  test('refuses a token nobody holds', async () => {
    const result = await attachPublicDocument({
      token: 'AAAAAAAAAAAAAAAAAAAAAA',
      kind: 'identity',
      bytes: TEST_PNG,
      filename: 'ic.png',
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe('not_found')
  })

  test('refuses once the booking is closed', async () => {
    // A cancelled booking is not a place to file new records, and a link that
    // outlives its booking should stop doing anything.
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    await dataClient()
      .from('booking')
      .update({ status: 'cancelled' })
      .eq('id', created.data.bookingId)

    const result = await attachPublicDocument({
      token: created.data.accessToken,
      kind: 'identity',
      bytes: TEST_PNG,
      filename: 'ic.png',
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe('booking_closed')
  })

  test('a second identity document replaces the first, rather than piling up', async () => {
    const created = await createPublicStayBooking(stayInput({ unitTypeSlug: 'three-bedroom' }))

    expect(created.ok).toBe(true)

    if (!created.ok) return

    await attachPublicDocument({
      token: created.data.accessToken,
      kind: 'identity',
      bytes: TEST_PNG,
      filename: 'dark.png',
    })

    await attachPublicDocument({
      token: created.data.accessToken,
      kind: 'identity',
      bytes: TEST_PNG,
      filename: 'better.png',
    })

    const held = await listDocumentsForBooking(created.data.bookingId, 'identity')

    expect(held).toHaveLength(1)
    expect(held[0]?.filename).toBe('better.png')
  })
})
