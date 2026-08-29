import type { DateRange } from '@/lib/domain/availability'
import { transition, type BookingEvent, type BookingStatus } from '@/lib/domain/booking-state'
import { palmVillaConfig, type PropertyConfig } from '@/lib/domain/config'
import { addDays, type StayDate } from '@/lib/domain/dates'
import type { BookingLine } from '@/lib/domain/lines'
import type { Cents } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { type Unit } from './inventory'
import { currentPropertyId } from './property'

/**
 * Booking reads and writes.
 *
 * Every read here goes through the `booking_summary` view, which joins the
 * booking to its guest, occupancy and unit and aggregates its priced lines —
 * see supabase/migrations/20260829000600_read_model.sql. Assembling that shape
 * in TypeScript would mean a round trip per row on every list screen.
 *
 * Availability goes through `available_units()`, which applies the same
 * half-open range semantics as the exclusion constraint. That is deliberate:
 * an availability list built on different semantics would offer a unit the
 * write then refuses.
 */

/** A booking as the portal's screens read it. */
export interface Booking {
  id: string
  /** Human-readable payment reference, `PV-` + 4 digits (architecture.md §6.1). */
  reference: string
  unitId: string
  unitRef: string
  range: DateRange
  status: BookingStatus
  guestName: string
  guestPhone: string
  vehicleRegistration: string | null
  chargeableGuests: number
  exemptGuests: number
  lines: readonly BookingLine[]
  total: Cents
  /**
   * The refundable BND 100 held against damage (prd.md §11) — never the
   * booking payment. prd.md §9.5 N5 requires the two to be named distinctly;
   * which of them is forfeited on cancellation is still open.
   */
  securityDeposit: Cents
  createdAt: string
}

interface BookingSummaryRow {
  id: string
  reference: string
  status: BookingStatus
  guest_name: string
  guest_phone: string
  vehicle_registration: string | null
  chargeable_guests: number
  exempt_guests: number
  total_cents: number
  security_deposit_cents: number
  created_at: string
  unit_id: string
  unit_ref: string
  check_in: StayDate
  check_out: StayDate
  lines: BookingLine[]
}

const SUMMARY_COLUMNS =
  'id, reference, status, guest_name, guest_phone, vehicle_registration, ' +
  'chargeable_guests, exempt_guests, total_cents, security_deposit_cents, ' +
  'created_at, unit_id, unit_ref, check_in, check_out, lines'

function toBooking(row: BookingSummaryRow): Booking {
  return {
    id: row.id,
    reference: row.reference,
    unitId: row.unit_id,
    unitRef: row.unit_ref,
    range: { start: row.check_in, end: row.check_out },
    status: row.status,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    vehicleRegistration: row.vehicle_registration,
    chargeableGuests: row.chargeable_guests,
    exemptGuests: row.exempt_guests,
    lines: row.lines,
    total: row.total_cents,
    securityDeposit: row.security_deposit_cents,
    createdAt: row.created_at,
  }
}

export interface AvailabilityQuery {
  range: DateRange
  unitTypeId?: string
}

/**
 * Units free for the whole range.
 *
 * Half-open, so a unit whose previous booking ends on the check-in date is
 * free — same semantics as the database constraint (architecture.md §5.2).
 */
export async function findAvailableUnits(query: AvailabilityQuery): Promise<readonly Unit[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('available_units', {
    p_property_id: propertyId,
    p_start: query.range.start,
    p_end: query.range.end,
    p_unit_type_slug: query.unitTypeId ?? null,
  })

  if (error) {
    throw new Error(`Could not read availability: ${error.message}`)
  }

  return (
    data as { id: string; ref: string; unit_type_slug: string; unit_type_name: string }[]
  ).map((row) => ({
    id: row.id,
    ref: row.ref,
    unitTypeId: row.unit_type_slug,
    unitTypeName: row.unit_type_name,
  }))
}

/** Availability counts per unit type, for the "3 of 36 free" summary. */
export async function countAvailableByType(range: DateRange): Promise<Record<string, number>> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('count_available_units_by_type', {
    p_property_id: propertyId,
    p_start: range.start,
    p_end: range.end,
  })

  if (error) {
    throw new Error(`Could not count availability: ${error.message}`)
  }

  return Object.fromEntries(
    (data as { unit_type_slug: string; available: number }[]).map((row) => [
      row.unit_type_slug,
      Number(row.available),
    ]),
  )
}

export interface BookingListFilter {
  status?: BookingStatus
  /** Stays touching this half-open range, matching availability semantics. */
  overlaps?: DateRange
}

/**
 * Bookings, most imminent first.
 *
 * Sorted by check-in and then reference so the order is stable — a list that
 * reshuffles between reads is unusable for a staff member scanning it.
 */
export async function listBookings(filter: BookingListFilter = {}): Promise<readonly Booking[]> {
  const propertyId = await currentPropertyId()

  const query = dataClient()
    .from('booking_summary')
    .select(SUMMARY_COLUMNS)
    .eq('property_id', propertyId)
    .order('check_in')
    .order('reference')

  if (filter.status) {
    query.eq('status', filter.status)
  }

  // Half-open overlap: a stay ending on the day the filter range starts does
  // not touch it, and neither does one starting on the day it ends.
  if (filter.overlaps) {
    query.lt('check_in', filter.overlaps.end).gt('check_out', filter.overlaps.start)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Could not list bookings: ${error.message}`)
  }

  return (data as unknown as BookingSummaryRow[]).map(toBooking)
}

/**
 * One booking by its human reference.
 *
 * Normalised on the way in: staff read references off a bank transfer or a
 * printout, so leading spaces and lower case are typing, not a different
 * booking.
 */
export async function getBookingByReference(reference: string): Promise<Booking | null> {
  const propertyId = await currentPropertyId()
  const normalised = reference.trim().toUpperCase()

  const { data, error } = await dataClient()
    .from('booking_summary')
    .select(SUMMARY_COLUMNS)
    .eq('property_id', propertyId)
    .eq('reference', normalised)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read booking ${normalised}: ${error.message}`)
  }

  return data ? toBooking(data as unknown as BookingSummaryRow) : null
}

export interface DailySnapshot {
  /** Confirmed bookings whose stay starts today. */
  arrivals: readonly Booking[]
  /** Checked-in bookings whose stay ends today. */
  departures: readonly Booking[]
  awaitingVerificationCount: number
  occupiedTonightCount: number
  totalUnits: number
}

/**
 * Today at a glance: who is arriving, who is leaving, what is waiting on money.
 *
 * `today` is a parameter rather than a clock read, so the snapshot is testable
 * and the caller decides which day it is asking about.
 *
 * `occupiedTonightCount` is a display figure for this screen, not the occupancy
 * definition the reports will need (prd.md §14) — held units are excluded here
 * because a unit blocked by an unpaid hold is not occupied, but a reporting
 * definition has to be agreed with the client rather than assumed from this.
 */
export async function getDailySnapshot(today: StayDate): Promise<DailySnapshot> {
  const propertyId = await currentPropertyId()
  const db = dataClient()
  const tomorrow = addDays(today, 1)

  const summary = () =>
    db.from('booking_summary').select(SUMMARY_COLUMNS).eq('property_id', propertyId)

  const counter = () =>
    db
      .from('booking_summary')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)

  const [arrivals, departures, awaiting, occupied, units] = await Promise.all([
    summary().eq('status', 'confirmed').eq('check_in', today).order('unit_ref'),
    summary().eq('status', 'checked_in').eq('check_out', today).order('unit_ref'),
    counter().eq('status', 'awaiting_payment_verification'),
    // Tonight is the half-open range [today, tomorrow): a guest who left this
    // morning does not occupy it, and one arriving today does.
    counter()
      .in('status', ['confirmed', 'checked_in'])
      .lt('check_in', tomorrow)
      .gt('check_out', today),
    db.from('unit').select('id', { count: 'exact', head: true }).eq('property_id', propertyId),
  ])

  const failure = [arrivals, departures, awaiting, occupied, units].find((result) => result.error)

  if (failure?.error) {
    throw new Error(`Could not build today's snapshot: ${failure.error.message}`)
  }

  return {
    arrivals: (arrivals.data as unknown as BookingSummaryRow[]).map(toBooking),
    departures: (departures.data as unknown as BookingSummaryRow[]).map(toBooking),
    awaitingVerificationCount: awaiting.count ?? 0,
    occupiedTonightCount: occupied.count ?? 0,
    totalUnits: units.count ?? 0,
  }
}

export interface CreateWalkInBookingInput {
  unitId: string
  range: DateRange
  guestName: string
  guestPhone: string
  vehicleRegistration: string | null
  chargeableGuests: number
  exemptGuests: number
  lines: readonly BookingLine[]
  total: Cents
  securityDeposit: Cents
}

export type CreateBookingResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: { code: 'unit_not_found' | 'unit_unavailable'; message: string } }

/**
 * Creates a walk-in booking, already paid.
 *
 * prd.md §9.4 [C]: the guest is present and pays immediately, so the booking is
 * created and paid in a single action and never passes through `held`. The
 * status is derived by running the state machine rather than assigned, so this
 * path cannot drift from architecture.md §5.3's rule that no code sets status
 * directly.
 *
 * ── There is deliberately no availability check here ───────────────────────
 *
 * The fixture layer re-checked the range before writing, and said in its own
 * header that the check was a stand-in which loses a genuine race. It is gone.
 * The booking, its guest, its occupancy, its lines and its audit event are
 * written by `create_walk_in_booking()` in one transaction, and the exclusion
 * constraint is the only thing that decides who wins — which is what
 * scope-of-capabilities.md G1 promises the client. A losing race comes back as
 * `unit_unavailable` with nothing left behind.
 */
export async function createWalkInBooking(
  input: CreateWalkInBookingInput,
  config: PropertyConfig = palmVillaConfig,
): Promise<CreateBookingResult> {
  const propertyId = await currentPropertyId()
  const created = transition('draft', 'pay_in_full')

  if (!created.ok) {
    throw new Error(`Walk-in transition rejected: ${created.error.message}`)
  }

  const { data, error } = await dataClient().rpc('create_walk_in_booking', {
    p_property_id: propertyId,
    p_unit_id: input.unitId,
    p_status: created.status,
    p_check_in: input.range.start,
    p_check_out: input.range.end,
    p_guest_name: input.guestName,
    p_guest_phone: input.guestPhone,
    p_vehicle_registration: input.vehicleRegistration,
    p_chargeable_guests: input.chargeableGuests,
    p_exempt_guests: input.exemptGuests,
    p_total_cents: input.total,
    p_security_deposit_cents: input.securityDeposit ?? config.securityDeposit,
    p_lines: input.lines,
  })

  if (error) {
    throw new Error(`Could not create the booking: ${error.message}`)
  }

  const result = data as
    | { ok: true; booking_id: string; reference: string }
    | { ok: false; error: 'unit_unavailable' | 'unit_not_found' }

  if (!result.ok) {
    return { ok: false, error: await describeWriteFailure(result.error, input.unitId) }
  }

  const booking = await getBookingByReference(result.reference)

  if (!booking) {
    // Not reachable: the function returned this reference from a committed
    // insert. Guarded rather than asserted, because a `null` here would reach
    // the confirmation panel as a blank reference the guest is asked to quote
    // on a bank transfer.
    throw new Error(`Booking ${result.reference} was created but could not be read back.`)
  }

  return { ok: true, booking }
}

/**
 * Turns a refusal from the write path into something a staff member can act on.
 *
 * The unit reference is fetched here rather than carried through the happy
 * path, so a successful booking costs one round trip and only the losing racer
 * pays for the friendlier sentence.
 */
async function describeWriteFailure(
  code: 'unit_unavailable' | 'unit_not_found',
  unitId: string,
): Promise<{ code: 'unit_unavailable' | 'unit_not_found'; message: string }> {
  if (code === 'unit_not_found') {
    return { code, message: 'That unit does not exist.' }
  }

  const { data } = await dataClient().from('unit').select('ref').eq('id', unitId).maybeSingle()
  const ref = (data as { ref: string } | null)?.ref ?? 'That unit'

  return { code, message: `${ref} was booked for those dates while this form was open.` }
}

export type TransitionBookingResult =
  | { ok: true; status: BookingStatus }
  | {
      ok: false
      error: {
        code: 'not_found' | 'illegal_transition' | 'terminal_state' | 'status_changed'
        message: string
      }
    }

/**
 * Moves a booking to its next status.
 *
 * This is the only way a booking's status changes. Legality is decided by
 * `transition()` in lib/domain/booking-state.ts — the single place the state
 * machine exists (architecture.md §5.3) — and the write and its audit event are
 * made atomic by `transition_booking()`.
 *
 * Every failure is returned rather than thrown, because none of them is a fault
 * in the system: an illegal move, a terminal booking, or a booking that moved
 * underneath the caller are all two staff members working at once, which is a
 * sentence on screen.
 */
export async function transitionBooking(
  bookingId: string,
  event: BookingEvent,
): Promise<TransitionBookingResult> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('booking')
    .select('status')
    .eq('property_id', propertyId)
    .eq('id', bookingId)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read booking ${bookingId}: ${error.message}`)
  }

  if (!data) {
    return { ok: false, error: { code: 'not_found', message: 'That booking no longer exists.' } }
  }

  const from = (data as { status: BookingStatus }).status
  const next = transition(from, event)

  if (!next.ok) {
    return { ok: false, error: next.error }
  }

  const { data: applied, error: applyError } = await dataClient().rpc('transition_booking', {
    p_property_id: propertyId,
    p_booking_id: bookingId,
    p_from_status: from,
    p_to_status: next.status,
    p_event: event,
  })

  if (applyError) {
    throw new Error(`Could not apply the transition: ${applyError.message}`)
  }

  const result = applied as { ok: true; status: BookingStatus } | { ok: false; error: string }

  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: 'status_changed',
        message:
          'Someone else changed this booking while you were working on it. Reload and retry.',
      },
    }
  }

  return { ok: true, status: result.status }
}
