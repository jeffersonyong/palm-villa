import { newAccessToken } from '@/lib/auth/access-token'
import type { DateRange } from '@/lib/domain/availability'
import { transition } from '@/lib/domain/booking-state'
import type { StayDate } from '@/lib/domain/dates'
import type { DayPassPartyLine } from '@/lib/domain/day-pass-capacity'
import type { BookingLine } from '@/lib/domain/lines'
import type { Cents } from '@/lib/domain/money'
import { isAccessToken, PUBLIC_LIMITS } from '@/lib/domain/public-booking'
import { dataClient } from '@/lib/supabase/data'

import { getBookingById, type Booking } from './bookings'
import { currentPropertyId } from './property'

/**
 * Writes a customer makes for themselves (capabilities A1–A4).
 *
 * A separate module from `./bookings.ts` on purpose, and the boundary is
 * *who is calling* rather than what is written. Everything in that file runs
 * behind `requirePermission()` with a staff member's id threaded into every
 * audit event; nothing here has an actor at all. Keeping the two apart means
 * the unauthenticated write paths are a short list somebody can read in one
 * sitting, rather than four more exports among twenty.
 *
 * Three rules hold across all of it:
 *
 *   - **No actor.** `audit_event.actor_id` has been nullable since it was
 *     created, for exactly this. A public booking's history says nobody
 *     performed it, which is true and is what `booking.created_public` reads
 *     as on screen.
 *   - **The price is the server's.** Every writer takes already-priced lines,
 *     and the action above it re-runs the pricing engine on the submitted
 *     inputs — the discipline the walk-in form set, and it matters more here
 *     because the submitter is a stranger.
 *   - **The status comes from the machine.** `transition()` decides; these
 *     functions pass what it derived. architecture.md §5.3 keeps the
 *     transition table in one place, and this is a second caller of it rather
 *     than a second copy.
 */

/** Why a public write was refused, in the customer's terms. */
export type PublicWriteErrorCode =
  | 'unit_unavailable'
  | 'capacity_exceeded'
  | 'too_many_open_bookings'
  | 'token_collision'
  | 'not_found'
  | 'already_submitted'
  | 'status_changed'

export interface PublicWriteError {
  code: PublicWriteErrorCode
  message: string
  /** Places left on the date, when capacity was the refusal. */
  remaining?: number
}

export type PublicWriteResult<T> = { ok: true; data: T } | { ok: false; error: PublicWriteError }

export interface PublicBookingCreated {
  bookingId: string
  reference: string
  accessToken: string
  /** The unit the system assigned, for a stay. Absent for a day pass. */
  unitRef?: string
}

const MESSAGES: Readonly<Record<PublicWriteErrorCode, string>> = {
  unit_unavailable:
    'Those dates have just been taken. Please pick other dates, or another type of unit.',
  capacity_exceeded: 'There are not enough places left for that date.',
  too_many_open_bookings:
    'There are already several unpaid bookings against this number. Please complete or cancel one first, or call us.',
  token_collision: 'Something went wrong creating your booking. Please try again.',
  not_found: 'We could not find that booking.',
  already_submitted: 'We have already been told about this transfer.',
  status_changed: 'This booking has moved on since this page was opened. Refresh to see where.',
}

function refuse(
  code: PublicWriteErrorCode,
  remaining?: number,
): { ok: false; error: PublicWriteError } {
  return { ok: false, error: { code, message: MESSAGES[code], remaining } }
}

/**
 * Records one attempt by an anonymous caller and says whether it is allowed.
 *
 * Fails **open** when the counter itself errors, which is the deliberate
 * direction: this is a rate limit rather than an authorisation check, and a
 * database hiccup should not take the booking site down. The controls that
 * protect inventory — the open-holds cap and the exclusion constraint — are
 * inside the write transaction and cannot be skipped this way.
 */
export async function notePublicAttempt(input: {
  kind: string
  keyHash: string
  windowSeconds: number
  limit: number
}): Promise<boolean> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('note_public_attempt', {
    p_property_id: propertyId,
    p_kind: input.kind,
    p_key_hash: input.keyHash,
    p_window_seconds: input.windowSeconds,
    p_limit: input.limit,
  })

  if (error) {
    return true
  }

  return data as boolean
}

export interface CreatePublicStayInput {
  unitTypeSlug: string
  range: DateRange
  guestName: string
  guestPhone: string
  guestEmail: string | null
  vehicles: readonly string[]
  noVehicle: boolean
  chargeableGuests: number
  exemptGuests: number
  total: Cents
  securityDeposit: Cents
  lines: readonly BookingLine[]
}

/**
 * Holds a unit of the requested type for a customer (capability A4).
 *
 * The unit is chosen by the database function rather than by the customer or
 * by this layer — see the migration's own note. What that buys here is that
 * there is no availability read to go stale: this call either comes back with
 * the door it got, or with `unit_unavailable` because every door of that type
 * was taken while it tried.
 */
export async function createPublicStayBooking(
  input: CreatePublicStayInput,
): Promise<PublicWriteResult<PublicBookingCreated>> {
  const propertyId = await currentPropertyId()

  // `held` is the first status this product has ever persisted. A walk-in goes
  // straight to `awaiting_payment_verification` or `confirmed` because the
  // guest has paid; a customer online has not, and the unit is held while they
  // go to their banking app (prd.md §9.3).
  const created = transition('draft', 'hold')

  if (!created.ok) {
    throw new Error(`Public hold transition rejected: ${created.error.message}`)
  }

  const accessToken = newAccessToken()

  const { data, error } = await dataClient().rpc('create_public_stay_booking', {
    p_property_id: propertyId,
    p_unit_type_slug: input.unitTypeSlug,
    p_status: created.status,
    p_check_in: input.range.start,
    p_check_out: input.range.end,
    p_guest_name: input.guestName,
    p_guest_phone: input.guestPhone,
    p_guest_email: input.guestEmail,
    p_vehicles: input.vehicles,
    p_no_vehicle: input.noVehicle,
    p_chargeable_guests: input.chargeableGuests,
    p_exempt_guests: input.exemptGuests,
    p_total_cents: input.total,
    p_security_deposit_cents: input.securityDeposit,
    p_lines: input.lines,
    p_access_token: accessToken,
    p_max_open_per_phone: PUBLIC_LIMITS.openBookingsPerPhone,
  })

  if (error) {
    throw new Error(`Could not create the booking: ${error.message}`)
  }

  const result = data as
    | { ok: true; booking_id: string; reference: string; unit_ref: string; access_token: string }
    | { ok: false; error: PublicWriteErrorCode }

  if (!result.ok) {
    return refuse(result.error)
  }

  return {
    ok: true,
    data: {
      bookingId: result.booking_id,
      reference: result.reference,
      accessToken: result.access_token,
      unitRef: result.unit_ref,
    },
  }
}

export interface CreatePublicDayPassInput {
  date: StayDate
  party: readonly DayPassPartyLine[]
  headcount: number
  chargeableGuests: number
  exemptGuests: number
  guestName: string
  guestPhone: string
  guestEmail: string | null
  vehicles: readonly string[]
  noVehicle: boolean
  total: Cents
  lines: readonly BookingLine[]
}

/**
 * Sells a day pass (capability A3) — the first writer of one anywhere.
 *
 * Held rather than confirmed, exactly like a stay: the pass is paid for by
 * transfer, and a pass issued before the money is seen is a QR code at a gate
 * with nothing behind it. What it holds is a place rather than a unit, which
 * the capacity check inside the transaction is what enforces.
 */
export async function createPublicDayPassBooking(
  input: CreatePublicDayPassInput,
): Promise<PublicWriteResult<PublicBookingCreated>> {
  const propertyId = await currentPropertyId()

  const created = transition('draft', 'hold')

  if (!created.ok) {
    throw new Error(`Public hold transition rejected: ${created.error.message}`)
  }

  const accessToken = newAccessToken()

  const { data, error } = await dataClient().rpc('create_public_day_pass_booking', {
    p_property_id: propertyId,
    p_status: created.status,
    p_pass_date: input.date,
    p_party: input.party,
    p_headcount: input.headcount,
    p_chargeable_guests: input.chargeableGuests,
    p_exempt_guests: input.exemptGuests,
    p_guest_name: input.guestName,
    p_guest_phone: input.guestPhone,
    p_guest_email: input.guestEmail,
    p_vehicles: input.vehicles,
    p_no_vehicle: input.noVehicle,
    p_total_cents: input.total,
    p_lines: input.lines,
    p_access_token: accessToken,
    p_max_open_per_phone: PUBLIC_LIMITS.openBookingsPerPhone,
  })

  if (error) {
    throw new Error(`Could not create the day pass: ${error.message}`)
  }

  const result = data as
    | { ok: true; booking_id: string; reference: string; access_token: string }
    | { ok: false; error: PublicWriteErrorCode; remaining?: number }

  if (!result.ok) {
    return refuse(result.error, result.remaining)
  }

  return {
    ok: true,
    data: {
      bookingId: result.booking_id,
      reference: result.reference,
      accessToken: result.access_token,
    },
  }
}

/**
 * One booking, by the private link.
 *
 * The token is checked for shape before it reaches a query — a malformed one
 * is a 404 rather than a round trip, and the page renders `notFound()` for
 * both, so a guesser learns nothing from the difference.
 */
export async function getBookingByAccessToken(token: string): Promise<Booking | null> {
  if (!isAccessToken(token)) {
    return null
  }

  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('booking')
    .select('id')
    .eq('property_id', propertyId)
    .eq('access_token', token)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read that booking: ${error.message}`)
  }

  if (!data) {
    return null
  }

  return getBookingById((data as { id: string }).id)
}

export interface PublicTransferSubmitted {
  reference: string
  /** Which row the queue will show — a deposit for a stay, a payment otherwise. */
  raised: 'deposit' | 'payment'
  amount: Cents
}

/**
 * The customer says they have transferred (prd.md §10.3, corrected).
 *
 * This is the moment the wait in the verification queue starts, which is what
 * `payment.created_at`'s own comment predicted a slice ago: the clock measures
 * how long staff have left somebody hanging, not how long the customer spent
 * filling in a form.
 *
 * What it raises is decided in the database from the booking's own stream and
 * quote, not passed in — a caller that could choose would be a caller that
 * could ask for a BND 100 deposit against a day pass.
 */
export async function submitPublicTransfer(
  token: string,
): Promise<PublicWriteResult<PublicTransferSubmitted>> {
  const booking = await getBookingByAccessToken(token)

  if (!booking) {
    return refuse('not_found')
  }

  const next = transition(booking.status, 'submit_payment')

  if (!next.ok) {
    // Legality is the machine's answer, and it is checked here so the page can
    // say something useful. The database re-checks it under the row lock,
    // which is what settles a double-click.
    return refuse('status_changed')
  }

  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('submit_public_payment', {
    p_property_id: propertyId,
    p_access_token: token,
    p_from_status: booking.status,
    p_to_status: next.status,
  })

  if (error) {
    throw new Error(`Could not record the transfer: ${error.message}`)
  }

  const result = data as
    | { ok: true; reference: string; raised: 'deposit' | 'payment'; amount_cents: number }
    | { ok: false; error: PublicWriteErrorCode }

  if (!result.ok) {
    return refuse(result.error)
  }

  return {
    ok: true,
    data: {
      reference: result.reference,
      raised: result.raised,
      amount: result.amount_cents,
    },
  }
}
