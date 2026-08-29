import { transition, type BookingEvent, type BookingStatus } from '@/lib/domain/booking-state'
import { nightsBetween, type StayDate } from '@/lib/domain/dates'
import { line, totalOf } from '@/lib/domain/lines'
import { bnd } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { createWalkInBooking, type Booking, type CreateWalkInBookingInput } from '../bookings'
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
  vehicleRegistration?: string | null
  chargeableGuests?: number
  exemptGuests?: number
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
    vehicleRegistration: spec.vehicleRegistration ?? null,
    chargeableGuests: spec.chargeableGuests ?? 2,
    exemptGuests: spec.exemptGuests ?? 0,
    lines,
    total: totalOf(lines),
    securityDeposit: bnd(100),
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
 * Creates a booking already sitting in a state the application cannot yet
 * produce, by writing its rows directly.
 *
 * `held` and `awaiting_payment_verification` are reached from `draft` through
 * the public booking flow, which is phase two — walk-ins go straight to
 * `confirmed` and never pass through either (prd.md §9.4). The daily snapshot
 * already counts both, so the behaviour needs pinning before the flow that
 * produces them exists.
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
      vehicle_registration: input.vehicleRegistration,
      total_cents: input.total,
      security_deposit_cents: input.securityDeposit,
    })
    .select('id')
    .single()

  if (booking.error) {
    throw new Error(`Test setup could not create a booking: ${booking.error.message}`)
  }

  const bookingId = (booking.data as { id: string }).id

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

/** Allocates a reference the same way the write path does. */
async function nextReference(): Promise<string> {
  const { data, error } = await dataClient().rpc('next_booking_reference')

  if (error) {
    throw new Error(`Could not allocate a booking reference: ${error.message}`)
  }

  return data as string
}
