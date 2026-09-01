import { describe, expect, test } from 'vitest'

import { resolveDiscount, type Discount } from '@/lib/domain/discount'
import { totalOf } from '@/lib/domain/lines'
import { bnd } from '@/lib/domain/money'

import { amendBooking, createWalkInBooking, getBookingById } from './bookings'
import { listPaymentsForBooking } from './payments'
import { bookingInput, givenBooking, type BookingSpec } from './test/factory'
import { auditEventsFor } from './test/inspect'

/**
 * Staff discounts, against the real database.
 *
 * The arithmetic is `lib/domain/discount.ts`'s business and has its own
 * coverage. What has to be proved here is everything the pure functions cannot
 * see: that the negative line survives a `booking_line` table whose CHECK
 * constraints were written before negatives existed, that the *instruction* is
 * stored beside its effect, that the payment raised against a discounted
 * booking expects the discounted figure, and that an amendment reprices a
 * percentage rather than carrying forward the cents it produced last time.
 *
 * That last one is the case worth the file. The lines are replaced wholesale
 * on every amendment, so a discount that failed to come through would silently
 * put a guest back to full price with nobody told.
 */

const CHECK_IN = '2026-09-14'
const CHECK_OUT = '2026-09-17'

const REASON = 'Repeat guest, third stay this year'

/**
 * A booking input carrying a discount, assembled exactly the way `priceStay`
 * assembles one: the resolved line appended last, and the total re-summed from
 * the lines rather than adjusted.
 */
async function discountedInput(spec: BookingSpec, discount: Discount) {
  const base = await bookingInput(spec)
  const resolved = resolveDiscount(totalOf(base.lines), discount)

  if (!resolved.ok) {
    throw new Error(`Test setup could not resolve a discount: ${resolved.error.message}`)
  }

  const lines = [...base.lines, resolved.line]

  return { ...base, lines, total: totalOf(lines), discount }
}

describe('a discounted walk-in booking', () => {
  test('stores the discount as a negative line, and charges the sum of the lines', async () => {
    // Arrange — three nights at the factory's BND 200, less BND 40.
    const input = await discountedInput(
      { unitRef: '3B-01', checkIn: CHECK_IN, checkOut: CHECK_OUT },
      { kind: 'amount', value: bnd(40), reason: REASON },
    )

    // Act
    const result = await createWalkInBooking(input)

    // Assert
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const booking = await getBookingById(result.booking.id)

    expect(booking?.total).toBe(bnd(600) - bnd(40))
    expect(booking?.lines.at(-1)).toMatchObject({ type: 'discount', amount: -bnd(40) })
    // The invariant the whole design rests on: nothing subtracted the discount
    // from a stored total, the total IS the sum.
    expect(booking?.lines.reduce((sum, entry) => sum + entry.amount, 0)).toBe(booking?.total)
  })

  test('stores the instruction beside its effect, so an amendment can re-derive it', async () => {
    const input = await discountedInput(
      { unitRef: '3B-02', checkIn: CHECK_IN, checkOut: CHECK_OUT },
      { kind: 'percent', value: 10, reason: REASON },
    )

    const result = await createWalkInBooking(input)
    const booking = result.ok ? await getBookingById(result.booking.id) : null

    // A percentage comes back a percentage, not the BND 60 it happened to make.
    expect(booking?.discount).toEqual({ kind: 'percent', value: 10, reason: REASON })
  })

  test('an undiscounted booking carries no instruction and no line', async () => {
    const booking = await givenBooking({
      unitRef: '3B-03',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    })

    expect(booking.discount).toBeNull()
    expect(booking.lines.some((entry) => entry.type === 'discount')).toBe(false)
  })

  test('the payment expects the discounted figure, not the rate-card one', async () => {
    // Otherwise every discounted booking reaches the verification queue looking
    // short, and B5's "a short payment is flagged" would fire on the ordinary
    // case until it meant nothing.
    const input = await discountedInput(
      { unitRef: '3B-04', checkIn: CHECK_IN, checkOut: CHECK_OUT, paymentMethod: 'bank_transfer' },
      { kind: 'amount', value: bnd(100), reason: REASON },
    )

    const result = await createWalkInBooking(input)
    const payments = result.ok ? await listPaymentsForBooking(result.booking.id) : []

    expect(payments).toHaveLength(1)
    expect(payments[0]?.expected).toBe(bnd(500))
  })

  test('records a discount event of its own, alongside the creation event', async () => {
    const input = await discountedInput(
      { unitRef: '3B-05', checkIn: CHECK_IN, checkOut: CHECK_OUT },
      { kind: 'percent', value: 25, reason: REASON },
    )

    const result = await createWalkInBooking(input)
    const events = result.ok ? await auditEventsFor(result.booking.id) : []
    const discounted = events.find((event) => event.action === 'booking.discounted')

    expect(events.map((event) => event.action)).toContain('booking.created_walk_in')
    expect(discounted?.after).toMatchObject({ kind: 'percent', value: 25, reason: REASON })
  })
})

describe('amending a discounted booking', () => {
  /** Creates a discounted booking and returns it read back from the database. */
  async function givenDiscounted(unitRef: string, discount: Discount) {
    const result = await createWalkInBooking(
      await discountedInput({ unitRef, checkIn: CHECK_IN, checkOut: CHECK_OUT }, discount),
    )

    if (!result.ok) {
      throw new Error(`Test setup could not create a booking: ${result.error.message}`)
    }

    const booking = await getBookingById(result.booking.id)

    if (!booking?.stay) {
      throw new Error('Test setup produced a booking with no stay.')
    }

    return booking
  }

  /**
   * The amendment the form would submit for a longer stay, with the discount
   * carried through as the instruction it is.
   *
   * The lines are built the way the action builds them — the base priced by
   * the factory's rate, the discount resolved against that new subtotal — so
   * this exercises the re-derivation rather than asserting it by construction.
   */
  async function extendTo(
    booking: Awaited<ReturnType<typeof givenDiscounted>>,
    checkOut: string,
    discount: Discount | null,
  ) {
    const base = await bookingInput({
      unitId: booking.stay!.unitId,
      checkIn: booking.stay!.range.start,
      checkOut,
    })

    let lines = base.lines

    if (discount) {
      const resolved = resolveDiscount(totalOf(base.lines), discount)

      if (!resolved.ok) {
        throw new Error(resolved.error.message)
      }

      lines = [...base.lines, resolved.line]
    }

    return amendBooking({
      bookingId: booking.id,
      expectedUpdatedAt: booking.updatedAt,
      unitId: booking.stay!.unitId,
      range: { start: booking.stay!.range.start, end: checkOut },
      guestName: booking.guestName,
      guestPhone: booking.guestPhone,
      vehicles: booking.vehicles,
      noVehicle: booking.noVehicle,
      chargeableGuests: booking.chargeableGuests,
      exemptGuests: booking.exemptGuests,
      lines,
      total: totalOf(lines),
      securityDeposit: booking.securityDeposit,
      discount,
      reason: null,
      actorId: null,
    })
  }

  test('a percentage is re-derived against the new, longer stay', async () => {
    // Three nights at 200 discounted 10% is 540. Extended to five nights, the
    // guest still has ten percent off: 1000 less 100. Carrying the BND 60 the
    // shorter stay produced would have charged 940, which is the bug this
    // whole "store the instruction, not its effect" design exists to prevent.
    const booking = await givenDiscounted('3B-06', {
      kind: 'percent',
      value: 10,
      reason: REASON,
    })

    expect(booking.total).toBe(bnd(540))

    const result = await extendTo(booking, '2026-09-19', booking.discount)

    expect(result.ok).toBe(true)

    const after = await getBookingById(booking.id)

    expect(after?.total).toBe(bnd(1000) - bnd(100))
    expect(after?.discount).toEqual({ kind: 'percent', value: 10, reason: REASON })
  })

  test('removing the discount reprices the stay to the rate card', async () => {
    const booking = await givenDiscounted('3B-07', {
      kind: 'amount',
      value: bnd(60),
      reason: REASON,
    })

    const result = await extendTo(booking, CHECK_OUT, null)

    expect(result.ok).toBe(true)

    const after = await getBookingById(booking.id)

    expect(after?.total).toBe(bnd(600))
    expect(after?.discount).toBeNull()
    expect(after?.lines.some((entry) => entry.type === 'discount')).toBe(false)
  })

  test('a discount that changes records its own event, with both sides', async () => {
    const booking = await givenDiscounted('3B-08', {
      kind: 'amount',
      value: bnd(60),
      reason: REASON,
    })

    await extendTo(booking, CHECK_OUT, {
      kind: 'amount',
      value: bnd(90),
      reason: 'Owner authorised',
    })

    const events = await auditEventsFor(booking.id)
    const discountEvents = events.filter((event) => event.action === 'booking.discounted')

    // One from creation, one from the amendment.
    expect(discountEvents).toHaveLength(2)
    expect(discountEvents[1]?.before).toMatchObject({ value: bnd(60), reason: REASON })
    expect(discountEvents[1]?.after).toMatchObject({ value: bnd(90), reason: 'Owner authorised' })
  })

  test('an amendment that leaves the discount alone records no discount event', async () => {
    const booking = await givenDiscounted('3B-09', {
      kind: 'amount',
      value: bnd(60),
      reason: REASON,
    })

    await extendTo(booking, CHECK_OUT, booking.discount)

    const events = await auditEventsFor(booking.id)

    expect(events.filter((event) => event.action === 'booking.discounted')).toHaveLength(1)
  })
})
