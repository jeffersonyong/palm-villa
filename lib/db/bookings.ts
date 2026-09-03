import type { DateRange } from '@/lib/domain/availability'
import { transition, type BookingEvent, type BookingStatus } from '@/lib/domain/booking-state'
import type { PaymentMethod } from '@/lib/domain/payment'
import { palmVillaConfig, type PropertyConfig } from '@/lib/domain/config'
import { addDays, type StayDate } from '@/lib/domain/dates'
import type { Discount, DiscountKind } from '@/lib/domain/discount'
import { BOOKING_STREAMS, type BookingStream } from '@/lib/domain/stream'
import type { BookingLine } from '@/lib/domain/lines'
import type { Cents } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { type Unit } from './inventory'
import { currentPropertyId } from './property'

/**
 * Booking reads and writes.
 *
 * Every read here goes through the `booking_summary` view, which joins the
 * booking to its guest, occupancy and unit and aggregates its priced lines and
 * its vehicles — see supabase/migrations/20260901000100_stream_aware_bookings.sql
 * for its current shape. Assembling that in TypeScript would mean several round
 * trips per row on every list screen.
 *
 * Occupancy is joined LEFT, so the view carries every stream and not only the
 * ones that occupy a unit. That is why `Booking.stay` is nullable: a day pass
 * consumes facility capacity on a date and occupies nothing (prd.md §6.1).
 *
 * Availability goes through `available_units()`, which applies the same
 * half-open range semantics as the exclusion constraint. That is deliberate:
 * an availability list built on different semantics would offer a unit the
 * write then refuses.
 */

/**
 * The unit a booking occupies, and for how long.
 *
 * Nullable on `Booking` rather than four nullable fields beside each other,
 * because the four are one fact: prd.md §6.1 says "a day pass occupies no
 * unit", and it consequently has no unit reference, no unit type and no
 * dates from occupancy either. One check narrows all four, and no screen can
 * accidentally read a unit ref while treating the dates as absent.
 */
export interface BookingStay {
  unitId: string
  unitRef: string
  /**
   * The unit type's slug, which is also its id in `PropertyConfig.unitTypes` —
   * `priceStay` needs it to reprice an amendment.
   */
  unitTypeId: string
  range: DateRange
}

/** A booking as the portal's screens read it. */
export interface Booking {
  id: string
  /** Human-readable payment reference, `PV-` + 4 digits (architecture.md §6.1). */
  reference: string
  stream: BookingStream
  /** Null for a booking that occupies no unit — a day pass (prd.md §6.1). */
  stay: BookingStay | null
  status: BookingStatus
  guestName: string
  guestPhone: string
  /**
   * Every vehicle arriving on this booking, in the order they were given
   * (prd.md §2, §13 [C]). Empty with `noVehicle` false means *not recorded* —
   * a booking taken before the field was required — not a guest without a car.
   */
  vehicles: readonly string[]
  /** The guest asserted they are arriving without a vehicle. */
  noVehicle: boolean
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
  /**
   * The discount instruction, or null. Its EFFECT is already among `lines` as
   * a negative one; this is what a staff member actually asked for, which is
   * what an amendment has to re-derive from (see lib/domain/discount.ts).
   */
  discount: Discount | null
  /**
   * The sum of the payments actually VERIFIED against this booking — a
   * promised transfer counts for nothing (capability B13).
   *
   * Derived by `booking_summary` from the payment rows, never stored: a
   * stored figure is a second copy of one the payments already hold, and the
   * two disagree the first time something writes a payment without
   * maintaining it. What is *owed* is `balanceOf(total, paid)` in
   * lib/domain/balance.ts, which owns the subtraction.
   */
  paid: Cents
  createdAt: string
  /**
   * Optimistic-concurrency token for `amendBooking`, maintained by the
   * `booking_touch_updated_at` trigger.
   *
   * Carried as an opaque string and NEVER parsed into a `Date`: Postgres keeps
   * microseconds and a JavaScript `Date` does not, so a round trip through one
   * would silently stop matching the row it came from and every amendment
   * would be refused as stale.
   */
  updatedAt: string
}

/**
 * The view's row shape. Everything occupancy contributes is nullable, because
 * the view left-joins it — see 20260901000100_stream_aware_bookings.sql.
 */
interface BookingSummaryRow {
  id: string
  reference: string
  status: BookingStatus
  stream: BookingStream
  guest_name: string
  guest_phone: string
  vehicles: string[]
  no_vehicle: boolean
  chargeable_guests: number
  exempt_guests: number
  total_cents: number
  security_deposit_cents: number
  created_at: string
  unit_id: string | null
  unit_ref: string | null
  unit_type_slug: string | null
  check_in: StayDate | null
  check_out: StayDate | null
  lines: BookingLine[]
  updated_at: string
  discount_kind: DiscountKind | null
  discount_value: number | null
  discount_reason: string | null
  paid_cents: number
}

const SUMMARY_COLUMNS =
  'id, reference, status, stream, guest_name, guest_phone, vehicles, no_vehicle, ' +
  'chargeable_guests, exempt_guests, total_cents, security_deposit_cents, ' +
  'created_at, updated_at, unit_id, unit_ref, unit_type_slug, check_in, check_out, lines, ' +
  'discount_kind, discount_value, discount_reason, paid_cents'

/**
 * The five occupancy columns are read as one fact.
 *
 * They are null together or present together — the view joins them from a
 * single occupancy row — so this collapses them into one nullable object
 * rather than leaving five independent nullable fields for every call site to
 * check in some order of its own. A partial row would mean the view is broken,
 * so it is treated as absence rather than assembled into half a stay.
 */
function toStay(row: BookingSummaryRow): BookingStay | null {
  if (!row.unit_id || !row.unit_ref || !row.unit_type_slug || !row.check_in || !row.check_out) {
    return null
  }

  return {
    unitId: row.unit_id,
    unitRef: row.unit_ref,
    unitTypeId: row.unit_type_slug,
    range: { start: row.check_in, end: row.check_out },
  }
}

/**
 * The three discount columns as one fact.
 *
 * Null together or present together — a database constraint says so
 * (`booking_discount_is_whole`) — so they collapse into one nullable object
 * rather than three nullable fields every call site has to check in an order
 * of its own. Same treatment, and same reasoning, as `toStay` above.
 */
function toDiscount(row: BookingSummaryRow): Discount | null {
  if (!row.discount_kind || row.discount_value === null || !row.discount_reason) {
    return null
  }

  return { kind: row.discount_kind, value: row.discount_value, reason: row.discount_reason }
}

function toBooking(row: BookingSummaryRow): Booking {
  return {
    id: row.id,
    reference: row.reference,
    stream: row.stream,
    stay: toStay(row),
    status: row.status,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    vehicles: row.vehicles,
    noVehicle: row.no_vehicle,
    chargeableGuests: row.chargeable_guests,
    exemptGuests: row.exempt_guests,
    lines: row.lines,
    total: row.total_cents,
    securityDeposit: row.security_deposit_cents,
    discount: toDiscount(row),
    paid: row.paid_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface AvailabilityQuery {
  range: DateRange
  unitTypeId?: string
  /**
   * The booking being amended, whose own occupancy should not count against
   * it. Without this an amend form offers every unit except the one the guest
   * is already in, and saving the form unchanged becomes impossible.
   */
  excludeBookingId?: string
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
    p_exclude_booking_id: query.excludeBookingId ?? null,
  })

  if (error) {
    throw new Error(`Could not read availability: ${error.message}`)
  }

  return (
    data as { id: string; ref: string; unit_type_slug: string; unit_type_name: string }[]
  ).map((row) => ({
    id: row.id,
    ref: row.ref,
    // Always null here, and not a lie: available_units() filters out-of-service
    // units out entirely (20260904000100 part 3), so every row this returns is
    // a unit that can take a guest.
    outOfServiceSince: null,
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
  /**
   * Any of these statuses. An empty or absent list is no status filter at all
   * — "all of them" and "none chosen" are the same question, and treating an
   * empty list as "match nothing" would turn clearing a filter into an empty
   * screen.
   */
  statuses?: readonly BookingStatus[]
  /** Any of these streams. Empty or absent is no stream filter, as above. */
  streams?: readonly BookingStream[]
  /** Stays touching this half-open range, matching availability semantics. */
  overlaps?: DateRange
}

/**
 * Applies a list filter to a `booking_summary` query.
 *
 * Extracted so the list and its per-stream counts are filtered by exactly the
 * same predicates. Two copies of this would be two chances for the stat strip
 * to disagree with the table underneath it, which is the one thing a summary
 * of a list must never do.
 */
function applyListFilter<Query extends FilterableQuery<Query>>(
  query: Query,
  filter: BookingListFilter,
): Query {
  if (filter.statuses && filter.statuses.length > 0) {
    query.in('status', [...filter.statuses])
  }

  if (filter.streams && filter.streams.length > 0) {
    query.in('stream', [...filter.streams])
  }

  // Half-open overlap: a stay ending on the day the filter range starts does
  // not touch it, and neither does one starting on the day it ends.
  //
  // A booking with no occupancy — a day pass — has null dates, and a null fails
  // both comparisons, so a date filter excludes it. That is the honest answer
  // while day passes carry no date of their own: the filter asks "which stays
  // touch these days", and a row with no dates cannot answer. The day-pass
  // slice brings a date to filter on.
  if (filter.overlaps) {
    query.lt('check_in', filter.overlaps.end).gt('check_out', filter.overlaps.start)
  }

  return query
}

/**
 * The three predicates `applyListFilter` uses, structurally.
 *
 * Named against the builder's shape rather than imported from
 * `@supabase/postgrest-js`: the data client is untyped (no generated schema
 * types — see lib/supabase/data.ts), so importing the concrete builder would
 * mean naming five generic parameters that carry no information here.
 */
interface FilterableQuery<Self> {
  in(column: string, values: unknown[]): Self
  lt(column: string, value: unknown): Self
  gt(column: string, value: unknown): Self
}

/** One page of a list. 1-based, because a page number is read by people. */
export interface PageRequest {
  page: number
  pageSize: number
}

export interface BookingPage {
  bookings: readonly Booking[]
  /**
   * How many bookings match the filter, **ignoring the page** — the footer's
   * denominator, and what decides how many pages there are.
   */
  total: number
}

/**
 * Bookings, newest booking taken first.
 *
 * ── Why `created_at` and not `check_in` ────────────────────────────────────
 *
 * This sorted by check-in ascending while the list was unpaginated, where the
 * order was a detail. Paginated it is the screen's front door, and check-in
 * ascending would have made page 1 *the oldest bookings on record* — after a
 * year of trading, last September. Newest-taken-first means the booking a
 * clerk just made is always on page 1, which is the one most likely to need
 * checking or correcting. Who is arriving is the dashboard's question, and it
 * has its own screen.
 *
 * `reference` breaks the tie, descending to match, so the order is total and
 * stable. That matters more under pagination than it did without it: two rows
 * with an equal sort key can swap between requests, and a row that swaps
 * across a page boundary is a row that appears twice or not at all.
 *
 * ── Pagination is optional here and mandatory on the screen ────────────────
 *
 * `page` omitted returns every match, which is what the tests want and what
 * nothing user-facing should do — an unbounded query against a table that
 * grows forever is the thing web/performance.md names. The register always
 * passes one.
 */
export async function listBookings(
  filter: BookingListFilter = {},
  page?: PageRequest,
): Promise<BookingPage> {
  const propertyId = await currentPropertyId()

  // `count: 'exact'` rides along on the same request, so the footer's total
  // costs no extra round trip. It counts what the filter matched, not what the
  // page returned — PostgREST applies the range after the count.
  const query = dataClient()
    .from('booking_summary')
    .select(SUMMARY_COLUMNS, { count: 'exact' })
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .order('reference', { ascending: false })

  applyListFilter(query, filter)

  if (page) {
    const from = (page.page - 1) * page.pageSize

    query.range(from, from + page.pageSize - 1)
  }

  const { data, error, count } = await query

  if (error) {
    // A range past the last row is a 416 from PostgREST, not a fault in the
    // system: it is exactly what a bookmarked `?page=7` asks for once the rows
    // beneath it are gone. Answered as an empty page carrying the real total,
    // so the caller can clamp to a page that exists and read again — the same
    // treatment a losing write race gets, a value rather than a throw.
    if (page && isRangeNotSatisfiable(error)) {
      return { bookings: [], total: await countBookings(propertyId, filter) }
    }

    throw new Error(`Could not list bookings: ${error.message}`)
  }

  return { bookings: (data as unknown as BookingSummaryRow[]).map(toBooking), total: count ?? 0 }
}

/**
 * PostgREST's "Requested range not satisfiable".
 *
 * Matched on the code, with the message as a fallback: the code is the stable
 * contract, and the message is what a version that stopped setting one would
 * still say.
 *
 * Exported because every paged list needs the same answer to a bookmarked page
 * past the end — ./deposits.ts is the second — and two copies of a PostgREST
 * error code is one copy that stops being updated.
 */
export function isRangeNotSatisfiable(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST103' || /range not satisfiable/i.test(error.message ?? '')
}

/**
 * How many bookings match a filter, without fetching any.
 *
 * Only on the out-of-range path, so the ordinary read stays one round trip —
 * `count: 'exact'` rides along with the rows there.
 */
async function countBookings(propertyId: string, filter: BookingListFilter): Promise<number> {
  const query = dataClient()
    .from('booking_summary')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)

  applyListFilter(query, filter)

  const { count, error } = await query

  if (error) {
    throw new Error(`Could not count bookings: ${error.message}`)
  }

  return count ?? 0
}

/** How many bookings of each stream match a filter. Every stream is present. */
export type BookingStreamCounts = Record<BookingStream, number>

/**
 * The per-stream breakdown of a filtered list.
 *
 * One head-count per stream rather than a `group by`, which PostgREST does not
 * expose: three counting round trips in parallel is cheaper than a bespoke RPC
 * and keeps the predicates identical to the list's by construction.
 *
 * The **stream filter itself is deliberately not applied.** These figures are
 * how a staff member chooses a stream, so narrowing them to the stream already
 * chosen would zero the two tiles they might want to switch to.
 */
export async function countBookingsByStream(
  filter: BookingListFilter = {},
): Promise<BookingStreamCounts> {
  const propertyId = await currentPropertyId()
  const db = dataClient()
  const withoutStream: BookingListFilter = { ...filter, streams: undefined }

  const results = await Promise.all(
    BOOKING_STREAMS.map((stream) => {
      const query = db
        .from('booking_summary')
        .select('id', { count: 'exact', head: true })
        .eq('property_id', propertyId)
        .eq('stream', stream)

      applyListFilter(query, withoutStream)

      return query
    }),
  )

  const failure = results.find((result) => result.error)

  if (failure?.error) {
    throw new Error(`Could not count bookings by stream: ${failure.error.message}`)
  }

  return Object.fromEntries(
    BOOKING_STREAMS.map((stream, index) => [stream, results[index]?.count ?? 0]),
  ) as BookingStreamCounts
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

/**
 * One booking by its id.
 *
 * The reference is what staff type and what the detail route is keyed on; the
 * id is what actions carry, because a reference could in principle be
 * reallocated and an id never is.
 */
export async function getBookingById(id: string): Promise<Booking | null> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('booking_summary')
    .select(SUMMARY_COLUMNS)
    .eq('property_id', propertyId)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read booking ${id}: ${error.message}`)
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
  /**
   * Normalised and de-duplicated by the caller
   * (`normaliseVehicleRegistrations`). Empty is only legal with `noVehicle`:
   * prd.md §13 [C] requires a registration, and `create_walk_in_booking()`
   * raises rather than writing a booking that records neither a car nor the
   * decision that there isn't one.
   */
  vehicles: readonly string[]
  /** The guest arrives without a vehicle, asserted rather than left blank. */
  noVehicle: boolean
  chargeableGuests: number
  exemptGuests: number
  lines: readonly BookingLine[]
  total: Cents
  securityDeposit: Cents
  /**
   * The discount a staff member asked for, or null.
   *
   * The instruction only. Its resolved cents must ALREADY be among `lines` as
   * a negative one — `priceStay` puts it there — because the total is the sum
   * of the lines and nothing downstream is allowed to subtract anything.
   */
  discount: Discount | null
  /**
   * How the guest is paying, which decides where the booking lands.
   *
   * Required, not defaulted, for the same reason `actorId` is: whether a
   * booking is paid or merely promised is the most consequential fact about
   * it, and a caller with no opinion should have to say so out loud.
   */
  paymentMethod: PaymentMethod
  /**
   * auth.users.id of the staff member acting, from requirePermission()'s
   * Actor — lands on the audit event. Required, not defaulted: a caller that
   * has no actor should have to say `null` out loud (tests do).
   */
  actorId: string | null
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
 * "Pays immediately" covers both methods the property takes (prd.md §10.1
 * [C]). Cash is counted at the desk and the booking is confirmed. A transfer
 * is sent from the guest's phone while they stand there, which is payment made
 * but not yet payment seen, so the booking lands in the verification queue and
 * someone checks the bank (§10.4). Neither is the booked-ahead, pay-on-arrival
 * case §9.4 excludes: in both, the guest has actually paid.
 *
 * ── A transfer booking holds its unit before the money lands ───────────────
 *
 * Its occupancy row is neither expired nor cancelled, so the exclusion
 * constraint counts it, which sits awkwardly beside §9.1 [C] "unpaid bookings
 * do not hold inventory". §9.3 [A] sanctions exactly this window as a checkout
 * timer — but the duration is §18 N7, open, and the expiry job in
 * architecture.md §6.3 does not exist yet. So nothing expires a pending
 * transfer today: it holds the unit until it is verified or a staff member
 * cancels it. The queue sorts oldest-first and shows the wait so this is
 * visible rather than silent.
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

  // Cash settles the booking in the same action; a transfer has been sent but
  // not seen, so it goes to the verification queue instead. Both statuses come
  // out of the machine rather than being written down here — architecture.md
  // §5.3 keeps the transition table in exactly one place.
  const event: BookingEvent = input.paymentMethod === 'cash' ? 'pay_in_full' : 'submit_payment'
  const created = transition('draft', event)

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
    p_vehicles: input.vehicles,
    p_no_vehicle: input.noVehicle,
    p_chargeable_guests: input.chargeableGuests,
    p_exempt_guests: input.exemptGuests,
    p_total_cents: input.total,
    p_security_deposit_cents: input.securityDeposit ?? config.securityDeposit,
    p_lines: input.lines,
    p_payment_method: input.paymentMethod,
    p_discount_kind: input.discount?.kind ?? null,
    p_discount_value: input.discount?.value ?? null,
    p_discount_reason: input.discount?.reason ?? null,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not create the booking: ${error.message}`)
  }

  const result = data as
    | { ok: true; booking_id: string; reference: string; payment_id: string }
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
 *
 * `reason` lands in the audit event's `after` payload. It is required by the
 * cancel screen and unused by everything else: prd.md §9.5 forfeits a payment
 * on cancellation, and the first question in a dispute about that is what the
 * booking was cancelled for.
 */
export async function transitionBooking(
  bookingId: string,
  event: BookingEvent,
  actorId: string | null = null,
  reason: string | null = null,
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
    p_actor_id: actorId,
    p_reason: reason,
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

export interface AmendBookingInput {
  bookingId: string
  /**
   * The `updatedAt` the form was opened against — passed straight through as
   * the string it arrived as. See the note on `Booking.updatedAt`.
   */
  expectedUpdatedAt: string
  unitId: string
  range: DateRange
  guestName: string
  guestPhone: string
  /** Replaces the booking's whole set of plates — see `amend_booking()`. */
  vehicles: readonly string[]
  noVehicle: boolean
  chargeableGuests: number
  exemptGuests: number
  lines: readonly BookingLine[]
  total: Cents
  securityDeposit: Cents
  /**
   * The discount a staff member asked for, or null.
   *
   * The instruction only. Its resolved cents must ALREADY be among `lines` as
   * a negative one — `priceStay` puts it there — because the total is the sum
   * of the lines and nothing downstream is allowed to subtract anything.
   */
  discount: Discount | null
  /** Optional free text, recorded on the audit event. */
  reason: string | null
  /** From requirePermission()'s Actor. Required, not defaulted. */
  actorId: string | null
}

export interface AmendBookingError {
  code: 'not_found' | 'changed' | 'unit_unavailable' | 'unit_not_found'
  /** Written for a staff member to read on screen, not for a log. */
  message: string
}

export type AmendBookingResult =
  { ok: true; booking: Booking } | { ok: false; error: AmendBookingError }

/**
 * Applies an amendment to a booking.
 *
 * An amendment is not a state transition — the status does not move when the
 * dates do — so this does not go through `transitionBooking`. What it shares
 * with the walk-in path is the transaction boundary: the guest row, the booking
 * row, the occupancy row, the priced lines and the audit event are moved
 * together by `amend_booking()` or not at all, because a booking whose
 * occupancy moved but whose lines did not is a guest charged for a stay they
 * are not having.
 *
 * ── There is deliberately no availability check here ────────────────────────
 *
 * As with `createWalkInBooking`, the exclusion constraint is the only thing
 * that decides whether the new dates are free. A losing race comes back as
 * `unit_unavailable` with the booking exactly as it was.
 *
 * Whether the booking's *status* may be amended at all is `canAmend()` in
 * lib/domain/booking-state.ts, checked by the caller before it gets here.
 */
export async function amendBooking(input: AmendBookingInput): Promise<AmendBookingResult> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('amend_booking', {
    p_property_id: propertyId,
    p_booking_id: input.bookingId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_unit_id: input.unitId,
    p_check_in: input.range.start,
    p_check_out: input.range.end,
    p_guest_name: input.guestName,
    p_guest_phone: input.guestPhone,
    p_vehicles: input.vehicles,
    p_no_vehicle: input.noVehicle,
    p_chargeable_guests: input.chargeableGuests,
    p_exempt_guests: input.exemptGuests,
    p_total_cents: input.total,
    p_security_deposit_cents: input.securityDeposit,
    p_lines: input.lines,
    p_discount_kind: input.discount?.kind ?? null,
    p_discount_value: input.discount?.value ?? null,
    p_discount_reason: input.discount?.reason ?? null,
    p_reason: input.reason,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not amend the booking: ${error.message}`)
  }

  const result = data as
    | { ok: true }
    | { ok: false; error: 'not_found' | 'changed' | 'unit_unavailable' | 'unit_not_found' }

  if (!result.ok) {
    return { ok: false, error: await describeAmendFailure(result.error, input.unitId) }
  }

  const booking = await getBookingById(input.bookingId)

  if (!booking) {
    // Not reachable: the function committed against this id. Guarded rather
    // than asserted, because a null here would reach the detail screen as a
    // blank booking immediately after a successful save.
    throw new Error(`Booking ${input.bookingId} was amended but could not be read back.`)
  }

  return { ok: true, booking }
}

/** Turns an amendment refusal into something a staff member can act on. */
async function describeAmendFailure(
  code: AmendBookingError['code'],
  unitId: string,
): Promise<AmendBookingError> {
  if (code === 'not_found') {
    return { code, message: 'That booking no longer exists.' }
  }

  if (code === 'changed') {
    return {
      code,
      message: 'Someone else changed this booking while you were working on it. Reload and retry.',
    }
  }

  return describeWriteFailure(code, unitId)
}
