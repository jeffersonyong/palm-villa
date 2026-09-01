import { transition, type BookingEvent, type BookingStatus } from '@/lib/domain/booking-state'
import { nightsBetween, type StayDate } from '@/lib/domain/dates'
import type { Discount } from '@/lib/domain/discount'
import { line, totalOf } from '@/lib/domain/lines'
import { bnd } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { createWalkInBooking, type Booking, type CreateWalkInBookingInput } from '../bookings'
import { listPaymentsForBooking, type Payment } from '../payments'
import { markUnitLeased, markUnitOutOfService } from '../units'
import type { PaymentMethod } from '@/lib/domain/payment'
import { currentPropertyId } from '../property'

/**
 * Test fixtures built through the real write path.
 *
 * `givenBooking` goes through `createWalkInBooking`, so every booking these
 * tests read went through `transition()` for its status and through the
 * exclusion constraint for its unit. Inserting rows directly would be faster
 * and would quietly let a test set up a state the application cannot actually
 * produce — which is how a suite ends up proving things about a system nobody
 * ships.
 *
 * `givenBookingInState` is the one exception, for the two states no code path
 * creates yet; its own note explains why it exists and what still constrains
 * it.
 */

const NIGHTLY_RATE = bnd(200)

/** The uuid of a seeded unit, by its human reference (e.g. `3B-01`). */
export async function unitIdByRef(ref: string): Promise<string> {
  const { data, error } = await dataClient().from('unit').select('id').eq('ref', ref).maybeSingle()

  if (error) {
    throw new Error(`Could not look up unit ${ref}: ${error.message}`)
  }

  if (!data) {
    throw new Error(`No seeded unit with reference ${ref}.`)
  }

  return (data as { id: string }).id
}

export interface BookingSpec {
  unitRef?: string
  unitId?: string
  checkIn: StayDate
  checkOut: StayDate
  guestName?: string
  guestPhone?: string
  /** Plates on the booking. Defaults to one, since prd.md §13 [C] requires it. */
  vehicles?: readonly string[]
  /** Set instead of `vehicles` to exercise the deliberate no-car exception. */
  noVehicle?: boolean
  chargeableGuests?: number
  exemptGuests?: number
  /**
   * Defaults to cash, which confirms the booking outright — so every test
   * written before payments existed keeps producing exactly the booking it
   * used to. A transfer booking is the payment tests' business; see
   * `givenTransferBooking`.
   */
  paymentMethod?: PaymentMethod
  /** Defaults to none — a discount is the exception, not the shape. */
  discount?: Discount | null
}

/**
 * Builds the input for a walk-in booking, priced as a plain accommodation line.
 *
 * The figure is not the point of these tests — the pricing engine has its own
 * coverage in lib/domain — but it still has to be a real line, because
 * `booking_line` refuses one whose amount disagrees with its quantity and rate.
 */
export async function bookingInput(spec: BookingSpec): Promise<CreateWalkInBookingInput> {
  const unitId = spec.unitId ?? (await unitIdByRef(spec.unitRef ?? '3B-01'))
  const nights = nightsBetween(spec.checkIn, spec.checkOut)
  const lines = [line('accommodation', `${nights} nights`, nights, NIGHTLY_RATE)]

  return {
    unitId,
    range: { start: spec.checkIn, end: spec.checkOut },
    guestName: spec.guestName ?? 'Test Guest',
    guestPhone: spec.guestPhone ?? '+673 000 0000',
    // A plate by default rather than none: the write path now refuses a
    // booking that records neither a vehicle nor the exception, so a fixture
    // with no opinion has to have a car like a real booking does.
    vehicles: spec.vehicles ?? (spec.noVehicle ? [] : ['BAA1234']),
    noVehicle: spec.noVehicle ?? false,
    chargeableGuests: spec.chargeableGuests ?? 2,
    exemptGuests: spec.exemptGuests ?? 0,
    lines,
    total: totalOf(lines),
    securityDeposit: bnd(100),
    discount: spec.discount ?? null,
    paymentMethod: spec.paymentMethod ?? 'cash',
    // Tests act as no one; the auth slice's own tests cover real actors.
    actorId: null,
  }
}

/** Creates a booking, failing the test rather than returning a refusal. */
export async function givenBooking(spec: BookingSpec): Promise<Booking> {
  const result = await createWalkInBooking(await bookingInput(spec))

  if (!result.ok) {
    throw new Error(`Test setup could not create a booking: ${result.error.message}`)
  }

  return result.booking
}

/**
 * Creates a booking paid by bank transfer, and hands back its pending payment.
 *
 * Goes through the real path, so what these tests act on is exactly what the
 * booking form produces: a booking in `awaiting_payment_verification` with one
 * `pending_verification` payment against it.
 */
export async function givenTransferBooking(
  spec: BookingSpec,
): Promise<{ booking: Booking; payment: Payment }> {
  const booking = await givenBooking({ ...spec, paymentMethod: 'bank_transfer' })
  const payments = await listPaymentsForBooking(booking.id)

  const [payment] = payments

  if (payments.length !== 1 || !payment) {
    throw new Error(`Expected one payment on ${booking.reference}, found ${payments.length}.`)
  }

  return { booking, payment }
}

/**
 * Creates a booking already sitting in a state the application cannot yet
 * produce, by writing its rows directly.
 *
 * `held` is reached from `draft` through the public booking flow, which is
 * phase two. `awaiting_payment_verification` is no longer among them — the
 * payments slice gave it a real creation path, so reach it with
 * `givenTransferBooking` above and leave this helper to the states nothing can
 * actually produce. A fixture that hand-writes a state the application can
 * reach properly pins the fixture's behaviour rather than the product's.
 *
 * The status is still **derived by walking the state machine**, never chosen:
 * a test booking sitting in a state `transition()` cannot actually reach would
 * pin behaviour the product will never exhibit. This is the same discipline the
 * deleted demo seed used for the same reason.
 *
 * This is the only write in the codebase that does not go through
 * `create_walk_in_booking`, and it is test-only. When the hold flow lands, its
 * real creation path replaces this helper.
 */
export async function givenBookingInState(
  spec: BookingSpec,
  events: readonly BookingEvent[],
): Promise<{ id: string; reference: string; status: BookingStatus }> {
  const status = events.reduce<BookingStatus>((current, event) => {
    const result = transition(current, event)

    if (!result.ok) {
      throw new Error(`Test setup has an illegal transition: ${result.error.message}`)
    }

    return result.status
  }, 'draft')

  const db = dataClient()
  const propertyId = await currentPropertyId()
  const input = await bookingInput(spec)

  const guest = await db
    .from('guest')
    .insert({ property_id: propertyId, name: input.guestName, phone: input.guestPhone })
    .select('id')
    .single()

  if (guest.error) {
    throw new Error(`Test setup could not create a guest: ${guest.error.message}`)
  }

  const reference = await nextReference()

  const booking = await db
    .from('booking')
    .insert({
      property_id: propertyId,
      reference,
      stream: 'short_stay',
      status,
      guest_id: (guest.data as { id: string }).id,
      chargeable_guests: input.chargeableGuests,
      exempt_guests: input.exemptGuests,
      no_vehicle: input.noVehicle,
      total_cents: input.total,
      security_deposit_cents: input.securityDeposit,
    })
    .select('id')
    .single()

  if (booking.error) {
    throw new Error(`Test setup could not create a booking: ${booking.error.message}`)
  }

  const bookingId = (booking.data as { id: string }).id

  // The real path writes these inside create_walk_in_booking(); a hand-written
  // fixture has to as well, or a booking in a state nothing can reach yet would
  // also be the only booking in the database with no plates on it — a second
  // difference from the product, on top of the one this helper exists for.
  if (input.vehicles.length > 0) {
    const plates = await db.from('booking_vehicle').insert(
      input.vehicles.map((registration, index) => ({
        property_id: propertyId,
        booking_id: bookingId,
        registration,
        sort_order: index,
      })),
    )

    if (plates.error) {
      throw new Error(`Test setup could not record a vehicle: ${plates.error.message}`)
    }
  }

  const occupancy = await db.from('occupancy').insert({
    property_id: propertyId,
    unit_id: input.unitId,
    booking_id: bookingId,
    occupancy_type: 'short_stay',
    status,
    start_date: input.range.start,
    end_date: input.range.end,
  })

  if (occupancy.error) {
    throw new Error(`Test setup could not create an occupancy: ${occupancy.error.message}`)
  }

  const lines = await db.from('booking_line').insert(
    input.lines.map((entry, index) => ({
      property_id: propertyId,
      booking_id: bookingId,
      line_type: entry.type,
      description: entry.description,
      quantity: entry.quantity,
      unit_price_cents: entry.unitPrice,
      amount_cents: entry.amount,
      sort_order: index,
    })),
  )

  if (lines.error) {
    throw new Error(`Test setup could not create booking lines: ${lines.error.message}`)
  }

  return { id: bookingId, reference, status }
}

/**
 * Creates a booking that occupies no unit — a day pass (prd.md §6.1).
 *
 * Written directly, for the same reason `givenBookingInState` is: **nothing in
 * the application creates one yet.** The day-pass flow is phase two. What the
 * bookings register promises today is that its read model *carries* such a
 * booking rather than joining it away, and that promise needs a row to be true
 * about — otherwise the left join in `booking_summary` is untested until the
 * slice that depends on it lands.
 *
 * Deliberately minimal: a booking and its guest, no occupancy, no unit, no
 * lines. That is exactly the shape §6.1 describes, and inventing a facility
 * table or a day-pass date here would be guessing at a schema the day-pass
 * slice has to design. This helper is replaced by that slice's real path.
 */
export async function givenDayPassBooking(
  spec: { guestName?: string; chargeableGuests?: number; exemptGuests?: number } = {},
): Promise<{ id: string; reference: string }> {
  const db = dataClient()
  const propertyId = await currentPropertyId()

  const guest = await db
    .from('guest')
    .insert({
      property_id: propertyId,
      name: spec.guestName ?? 'Test Day Guest',
      phone: '+673 000 0000',
    })
    .select('id')
    .single()

  if (guest.error) {
    throw new Error(`Test setup could not create a guest: ${guest.error.message}`)
  }

  const reference = await nextReference()

  const booking = await db
    .from('booking')
    .insert({
      property_id: propertyId,
      reference,
      stream: 'day_pass',
      // Reached by draft --pay_in_full--> confirmed, the same move a cash
      // walk-in makes. Not chosen freely: architecture.md §5.3.
      status: transition('draft', 'pay_in_full').ok ? 'confirmed' : 'draft',
      guest_id: (guest.data as { id: string }).id,
      chargeable_guests: spec.chargeableGuests ?? 2,
      exempt_guests: spec.exemptGuests ?? 1,
      // A day pass visitor parks too, but nothing collects the plate until the
      // day-pass form exists — so the exception, which is the honest value.
      no_vehicle: true,
      total_cents: bnd(20),
      security_deposit_cents: 0,
    })
    .select('id')
    .single()

  if (booking.error) {
    throw new Error(`Test setup could not create a day pass: ${booking.error.message}`)
  }

  return { id: (booking.data as { id: string }).id, reference }
}

/** Allocates a reference the same way the write path does. */
async function nextReference(): Promise<string> {
  const { data, error } = await dataClient().rpc('next_booking_reference')

  if (error) {
    throw new Error(`Could not allocate a booking reference: ${error.message}`)
  }

  return data as string
}

/**
 * Puts a long lease on a unit (capability B9).
 *
 * Goes through `markUnitLeased`, so what a test acts on is the row the product
 * writes: an occupancy with no booking, `occupancy_type = 'tenancy'` and
 * `status = 'leased'`, participating in the exclusion constraint exactly like
 * a booking's.
 */
export async function givenLease(spec: {
  unitRef?: string
  unitId?: string
  occupantName?: string
  start: StayDate
  end: StayDate
}): Promise<{ occupancyId: string; unitId: string }> {
  const unitId = spec.unitId ?? (await unitIdByRef(spec.unitRef ?? '3B-01'))

  const result = await markUnitLeased({
    unitId,
    occupantName: spec.occupantName ?? 'Test Tenant',
    start: spec.start,
    end: spec.end,
    actorId: null,
  })

  if (!result.ok) {
    throw new Error(`Test setup could not record a lease: ${result.error.message}`)
  }

  return { occupancyId: result.occupancyId, unitId }
}

/** Takes a unit out of service, failing the test rather than returning a refusal. */
export async function givenUnitOutOfService(
  unitRef: string,
  reason = 'Test maintenance',
): Promise<string> {
  const unitId = await unitIdByRef(unitRef)
  const result = await markUnitOutOfService({ unitId, reason, actorId: null })

  if (!result.ok) {
    throw new Error(`Test setup could not take ${unitRef} out of service: ${result.error.message}`)
  }

  return unitId
}
