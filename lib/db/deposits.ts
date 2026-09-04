import {
  depositFiguresOf,
  depositStageOf,
  describeReleaseFailure,
  type DepositFigures,
  type DepositStage,
} from '@/lib/domain/deposit'
import { transition, type BookingStatus } from '@/lib/domain/booking-state'
import type { DateRange } from '@/lib/domain/availability'
import type { StayDate } from '@/lib/domain/dates'
import type { Cents } from '@/lib/domain/money'
import type { PaymentMethod } from '@/lib/domain/payment'
import { dataClient } from '@/lib/supabase/data'

import { isRangeNotSatisfiable, type PageRequest } from './bookings'
import { currentPropertyId } from './property'
import { applySearch } from './search'

/**
 * The deposit ledger (capabilities E1, E2, E3).
 *
 * architecture.md §2: all database access lives in `lib/db`. Reads come off
 * `deposit_summary`, which carries the facts — the deposit, its booking, the
 * stay, the inspection and the live charge total — and deliberately no stage.
 * The stage is `depositStageOf()`, applied here at mapping time exactly as
 * `deriveUnitStatus()` is in ./units.ts, so a screen never sees a deposit
 * without one and the rule stays in one place.
 *
 * Two figures that look alike are named apart on purpose. `charges` is what is
 * standing against the deposit right now; `release.chargesTotal` is what was
 * signed off. They are the same number today, because charges close at
 * approval — and they are separate columns so that stays a fact somebody can
 * read rather than an assumption.
 */

export interface DepositInspection {
  id: string
  outcome: string
  notes: string | null
  inspectedBy: string | null
  inspectedAt: string
}

export interface DepositRelease {
  at: string
  by: string | null
  note: string | null
  /** What went back to the guest. */
  releasedAmount: Cents
  /** The charges as they stood when this was approved. */
  chargesTotal: Cents
  /** What the guest still owed beyond the deposit. */
  owed: Cents
}

export interface DepositSettlement {
  at: string
  by: string | null
  method: PaymentMethod
}

export interface Deposit {
  id: string
  bookingId: string
  bookingReference: string
  bookingStatus: BookingStatus
  guestName: string
  guestPhone: string
  /**
   * The stay this deposit was taken against — null only for a booking that
   * occupies no unit.
   *
   * One object rather than four nullable fields, for the reason
   * architecture.md §5.3a gives about `Booking.stay`: one check narrows all of
   * them, so no screen reads a unit reference while treating the dates as
   * absent. Today nothing without a unit can have a deposit (a day pass quotes
   * none), and the shape is honest rather than convenient — the read model
   * LEFT joins occupancy like every other view here.
   */
  stay: { occupancyId: string; unitId: string; unitRef: string; range: DateRange } | null
  amount: Cents
  method: PaymentMethod
  collectedBy: string | null
  collectedAt: string
  inspection: DepositInspection | null
  /** Unwaived charges standing against the deposit now. */
  charges: Cents
  chargeCount: number
  release: DepositRelease | null
  settlement: DepositSettlement | null
  /** Derived, never stored. See lib/domain/deposit.ts. */
  stage: DepositStage
  /**
   * What goes back and what is owed. Computed from the approved charges once a
   * release exists, so a released deposit keeps showing the figures somebody
   * signed rather than a recomputation.
   */
  figures: DepositFigures
}

interface DepositSummaryRow {
  id: string
  booking_id: string
  booking_reference: string
  booking_status: string
  guest_name: string
  guest_phone: string
  occupancy_id: string | null
  unit_id: string | null
  unit_ref: string | null
  check_in: string | null
  check_out: string | null
  amount_cents: number
  method: string
  collected_by: string | null
  collected_at: string
  inspection_id: string | null
  inspection_outcome: string | null
  inspection_notes: string | null
  inspected_by: string | null
  inspected_at: string | null
  charges_total_cents: number
  charge_count: number
  released_at: string | null
  released_by: string | null
  release_note: string | null
  released_amount_cents: number | null
  approved_charges_total_cents: number | null
  owed_cents: number | null
  owed_settled_at: string | null
  owed_settled_by: string | null
  owed_settled_method: string | null
}

/** Hand-maintained, like SUMMARY_COLUMNS in ./bookings.ts — there is no codegen. */
const SUMMARY_COLUMNS = [
  'id',
  'booking_id',
  'booking_reference',
  'booking_status',
  'guest_name',
  'guest_phone',
  'occupancy_id',
  'unit_id',
  'unit_ref',
  'check_in',
  'check_out',
  'amount_cents',
  'method',
  'collected_by',
  'collected_at',
  'inspection_id',
  'inspection_outcome',
  'inspection_notes',
  'inspected_by',
  'inspected_at',
  'charges_total_cents',
  'charge_count',
  'released_at',
  'released_by',
  'release_note',
  'released_amount_cents',
  'approved_charges_total_cents',
  'owed_cents',
  'owed_settled_at',
  'owed_settled_by',
  'owed_settled_method',
].join(', ')

function toDeposit(row: DepositSummaryRow): Deposit {
  const bookingStatus = row.booking_status as BookingStatus

  const release: DepositRelease | null =
    row.released_at === null
      ? null
      : {
          at: row.released_at,
          by: row.released_by,
          note: row.release_note,
          releasedAmount: row.released_amount_cents ?? 0,
          chargesTotal: row.approved_charges_total_cents ?? 0,
          owed: row.owed_cents ?? 0,
        }

  return {
    id: row.id,
    bookingId: row.booking_id,
    bookingReference: row.booking_reference,
    bookingStatus,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    // A deposit's stay always has both dates: only a lease may be open-ended
    // (N19), and a lease is not a booking. Narrowed on all four fields so the
    // object is present or absent as one fact, per architecture.md §5.3a.
    stay:
      row.occupancy_id && row.unit_id && row.unit_ref && row.check_in && row.check_out
        ? {
            occupancyId: row.occupancy_id,
            unitId: row.unit_id,
            unitRef: row.unit_ref,
            range: { start: row.check_in as StayDate, end: row.check_out as StayDate },
          }
        : null,
    amount: row.amount_cents,
    method: row.method as PaymentMethod,
    collectedBy: row.collected_by,
    collectedAt: row.collected_at,
    inspection:
      row.inspection_id === null || row.inspection_outcome === null || row.inspected_at === null
        ? null
        : {
            id: row.inspection_id,
            outcome: row.inspection_outcome,
            notes: row.inspection_notes,
            inspectedBy: row.inspected_by,
            inspectedAt: row.inspected_at,
          },
    charges: row.charges_total_cents,
    chargeCount: row.charge_count,
    release,
    settlement:
      row.owed_settled_at === null || row.owed_settled_method === null
        ? null
        : {
            at: row.owed_settled_at,
            by: row.owed_settled_by,
            method: row.owed_settled_method as PaymentMethod,
          },
    stage: depositStageOf({
      released: release !== null,
      inspected: row.inspection_id !== null,
      bookingStatus,
    }),
    // A released deposit reports what was approved; an open one reports what is
    // standing. Recomputing a released deposit from the live rows would let a
    // figure on a statement move after it was given to somebody.
    figures: depositFiguresOf(
      row.amount_cents,
      release ? release.chargesTotal : row.charges_total_cents,
    ),
  }
}

function summaryQuery(propertyId: string) {
  return dataClient().from('deposit_summary').select(SUMMARY_COLUMNS).eq('property_id', propertyId)
}

/**
 * Every deposit the property is still holding — capability E1's own question.
 *
 * Unpaginated, and for the units board's reason rather than the register's:
 * this set is bounded by how many guests are in the building and by how fast
 * Finance works, and it is a queue meant to be emptied. A property holding
 * enough unreleased deposits for this to be a large read has a problem no page
 * size would fix. Released deposits are the unbounded set, and they page.
 */
export async function listHeldDeposits(): Promise<readonly Deposit[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await summaryQuery(propertyId)
    .is('released_at', null)
    .order('collected_at', { ascending: true })

  if (error) {
    throw new Error(`Could not read the deposits held: ${error.message}`)
  }

  return (data as unknown as DepositSummaryRow[]).map(toDeposit)
}

export interface DepositPage {
  deposits: readonly Deposit[]
  /** How many matched, ignoring the page — the footer's denominator. */
  total: number
}

/**
 * Released deposits, newest first, one page at a time.
 *
 * The archive grows for the life of the building, so this pages in SQL for the
 * reason the bookings register does. `owedOnly` narrows it to the releases
 * that left a guest owing something nobody has recorded as paid — the "Owed"
 * tile's list, and the closest thing this product has to a debtors' report.
 */
/** How the archive is narrowed. */
export interface ReleasedDepositFilter {
  /** Only the guests who still owe something. */
  owedOnly?: boolean
  /** Stays touching this half-open range, matching availability semantics. */
  overlaps?: DateRange
  /** A term the booking reference, guest name or unit contains. */
  search?: string
}

export async function listReleasedDeposits(
  filter: ReleasedDepositFilter = {},
  page?: PageRequest,
): Promise<DepositPage> {
  const propertyId = await currentPropertyId()

  const query = dataClient()
    .from('deposit_summary')
    .select(SUMMARY_COLUMNS, { count: 'exact' })
    .eq('property_id', propertyId)
    .not('released_at', 'is', null)
    .order('released_at', { ascending: false })
    .order('id', { ascending: false })

  applyReleasedFilter(query, filter)

  if (page) {
    const from = (page.page - 1) * page.pageSize

    query.range(from, from + page.pageSize - 1)
  }

  const { data, error, count } = await query

  if (error) {
    // A bookmarked page past the last row is a 416, not a fault — answered as
    // an empty page carrying the real total so the caller can clamp and read
    // again. The treatment ./bookings.ts gives it.
    if (page && isRangeNotSatisfiable(error)) {
      return { deposits: [], total: await countReleasedDeposits(propertyId, filter) }
    }

    throw new Error(`Could not list released deposits: ${error.message}`)
  }

  return {
    deposits: (data as unknown as DepositSummaryRow[]).map(toDeposit),
    total: count ?? 0,
  }
}

async function countReleasedDeposits(
  propertyId: string,
  filter: ReleasedDepositFilter,
): Promise<number> {
  const query = dataClient()
    .from('deposit_summary')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .not('released_at', 'is', null)

  applyReleasedFilter(query, filter)

  const { count, error } = await query

  if (error) {
    throw new Error(`Could not count released deposits: ${error.message}`)
  }

  return count ?? 0
}

/**
 * The archive's predicates, in one place so the page and its count cannot
 * disagree — the register's rule for a list and its summary.
 *
 * The overlap is the register's too (`applyListFilter` in ./bookings.ts): a
 * stay touches the window when it begins before the window ends and ends
 * after it begins. A deposit with no stay behind it has null dates and so
 * never matches a window, which is the right answer to a question about
 * dates it cannot answer.
 */
function applyReleasedFilter(query: ArchiveQuery, filter: ReleasedDepositFilter): void {
  // Each call mutates the builder, so nothing is chained on a return value.
  if (filter.owedOnly) {
    query.gt('owed_cents', 0)
    query.is('owed_settled_at', null)
  }

  if (filter.overlaps) {
    query.lt('check_in', filter.overlaps.end)
    query.gt('check_out', filter.overlaps.start)
  }

  if (filter.search) {
    applySearch(query, ['booking_reference', 'guest_name', 'unit_ref'], filter.search)
  }
}

/**
 * The three predicates `applyReleasedFilter` uses, structurally — the
 * register's `FilterableQuery` for the same reason: the data client is
 * untyped, so naming the concrete builder would mean naming five generic
 * parameters that carry no information here. Not generic over the builder,
 * unlike the register's: the builder mutates in place, which is what the
 * callers already rely on, and inferring it against the summary's column
 * list sends the type checker into a recursion it gives up on.
 */
interface ArchiveQuery {
  gt(column: string, value: unknown): unknown
  lt(column: string, value: unknown): unknown
  is(column: string, value: unknown): unknown
  or(filters: string): unknown
}

/**
 * Every release that left a guest owing, and that nobody has recorded as paid.
 *
 * Its own read rather than a page of the above, because the ledger's tile
 * states a total in BND and a page cannot be summed. Bounded in practice by
 * how often charges exceed BND 100, which prd.md §11's own note expects to be
 * rare — and if it stops being rare, that is the commercial conversation the
 * note asks for rather than a paging problem.
 */
export async function listOwedDeposits(): Promise<readonly Deposit[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await summaryQuery(propertyId)
    .gt('owed_cents', 0)
    .is('owed_settled_at', null)
    .order('released_at', { ascending: true })

  if (error) {
    throw new Error(`Could not read what guests owe: ${error.message}`)
  }

  return (data as unknown as DepositSummaryRow[]).map(toDeposit)
}

/** One deposit, by the reference of the booking it was taken against. */
export async function getDepositByBookingReference(reference: string): Promise<Deposit | null> {
  const propertyId = await currentPropertyId()

  const { data, error } = await summaryQuery(propertyId)
    .eq('booking_reference', reference.trim().toUpperCase())
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read the deposit for ${reference}: ${error.message}`)
  }

  return data ? toDeposit(data as unknown as DepositSummaryRow) : null
}

/** One deposit, by its booking's id — for a screen that already holds one. */
export async function getDepositByBookingId(bookingId: string): Promise<Deposit | null> {
  const propertyId = await currentPropertyId()

  const { data, error } = await summaryQuery(propertyId).eq('booking_id', bookingId).maybeSingle()

  if (error) {
    throw new Error(`Could not read the deposit for booking ${bookingId}: ${error.message}`)
  }

  return data ? toDeposit(data as unknown as DepositSummaryRow) : null
}

/**
 * The deposits held against a list of bookings, keyed by booking id.
 *
 * One query for a table of rows — the dashboard's departures list asks for
 * several at once, and asking per row is the N+1 web/performance.md names.
 */
export async function listDepositsForBookings(
  bookingIds: readonly string[],
): Promise<ReadonlyMap<string, Deposit>> {
  if (bookingIds.length === 0) {
    return new Map()
  }

  const propertyId = await currentPropertyId()

  const { data, error } = await summaryQuery(propertyId).in('booking_id', [...bookingIds])

  if (error) {
    throw new Error(`Could not read deposits for these bookings: ${error.message}`)
  }

  const deposits = (data as unknown as DepositSummaryRow[]).map(toDeposit)

  return new Map(deposits.map((deposit) => [deposit.bookingId, deposit]))
}

// ── Writes ───────────────────────────────────────────────────────────────────
//
// Every one returns a refusal rather than throwing, so a server action can turn
// a domain answer into a sentence on a form and keep a thrown error meaning
// what it should: something broke.

export interface DepositWriteError {
  code: string
  message: string
}

export type DepositWriteResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: DepositWriteError }

interface RpcRefusal {
  ok: false
  error: string
  [key: string]: unknown
}

export interface CheckInBookingInput {
  bookingId: string
  /** How the deposit was taken. Ignored where the booking quotes none. */
  method: PaymentMethod
  actorId: string | null
}

/**
 * Checks a guest in, and collects the deposit while doing it.
 *
 * The status move is decided here and not in SQL: `transition()` in
 * lib/domain/booking-state.ts is the single place the state machine exists
 * (architecture.md §5.3), and `check_in_booking()` is passed the pair it
 * derived. What the database adds is atomicity — the move and the deposit row
 * are one transaction, because a guest checked in with no deposit recorded is
 * the gap this slice exists to close.
 *
 * `depositId` comes back null where the booking quoted no deposit, which is
 * not a failure: the caller says so on screen rather than implying money
 * changed hands.
 */
export async function checkInBooking(
  input: CheckInBookingInput,
): Promise<DepositWriteResult<{ status: BookingStatus; depositId: string | null; amount: Cents }>> {
  const propertyId = await currentPropertyId()

  const { data: booking, error: readError } = await dataClient()
    .from('booking')
    .select('status')
    .eq('property_id', propertyId)
    .eq('id', input.bookingId)
    .maybeSingle()

  if (readError) {
    throw new Error(`Could not read booking ${input.bookingId}: ${readError.message}`)
  }

  if (!booking) {
    return { ok: false, error: { code: 'not_found', message: 'That booking no longer exists.' } }
  }

  // Read for its status alone: the state machine decides legality here
  // (architecture.md §5.3) and the function re-checks the same status under a
  // lock. The deposit's amount is deliberately NOT read here — see below.
  const current = booking as { status: BookingStatus }
  const next = transition(current.status, 'check_in')

  if (!next.ok) {
    return { ok: false, error: next.error }
  }

  const { data, error } = await dataClient().rpc('check_in_booking', {
    p_property_id: propertyId,
    p_booking_id: input.bookingId,
    p_from_status: current.status,
    p_to_status: next.status,
    p_method: input.method,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not check the guest in: ${error.message}`)
  }

  const result = data as
    | { ok: true; status: BookingStatus; deposit_id: string | null; amount_cents: number }
    | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeCheckInFailure(result) }
  }

  // The amount comes back from the function rather than from the read above.
  // `confirmed` is amendable and `amend_booking()` can reprice the deposit, so
  // an amendment landing between the two would leave this reporting one figure
  // while the ledger held another — and the figure a clerk is shown is the one
  // they say out loud to the guest. What comes back was written under the row
  // lock.
  return {
    ok: true,
    status: result.status,
    depositId: result.deposit_id,
    amount: result.amount_cents,
  }
}

function describeCheckInFailure(result: RpcRefusal): DepositWriteError {
  switch (result.error) {
    case 'status_changed':
      return {
        code: result.error,
        message:
          'Someone else moved this booking while you were working on it. Reload and try again.',
      }
    case 'already_collected':
      return {
        code: result.error,
        message: 'A deposit has already been recorded against this booking.',
      }
    case 'invalid_method':
      return { code: result.error, message: 'Choose how the deposit was taken.' }
    default:
      return { code: result.error, message: 'That booking no longer exists.' }
  }
}

/**
 * Approves the release of a deposit (capability E2).
 *
 * The figures come back from the database rather than being computed here,
 * because they are what was actually written — the charges are summed under
 * the deposit's own lock, so a charge added while the dialog was open is
 * either counted or refused, never signed against a list that moved.
 */
export async function approveDepositRelease(input: {
  depositId: string
  note: string | null
  actorId: string | null
}): Promise<DepositWriteResult<{ releasedAmount: Cents; chargesTotal: Cents; owed: Cents }>> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('approve_deposit_release', {
    p_property_id: propertyId,
    p_deposit_id: input.depositId,
    p_note: input.note,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not approve the release: ${error.message}`)
  }

  const result = data as
    | {
        ok: true
        released_amount_cents: number
        charges_total_cents: number
        owed_cents: number
      }
    | RpcRefusal

  if (!result.ok) {
    // One table of sentences, in lib/domain, so a refusal reads the same
    // whether the screen caught it before the click or the function after.
    return { ok: false, error: describeReleaseFailure(result.error) }
  }

  return {
    ok: true,
    releasedAmount: result.released_amount_cents,
    chargesTotal: result.charges_total_cents,
    owed: result.owed_cents,
  }
}

/**
 * Records that a guest has paid what they owed beyond their deposit.
 *
 * Not a payment against the booking: it settles no booking, appears in no
 * cash-up, and moves nothing. It is the fact that the excess prd.md §11
 * requirement 6 describes has been recovered.
 */
export async function settleDepositOwed(input: {
  depositId: string
  method: PaymentMethod
  actorId: string | null
}): Promise<DepositWriteResult> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('settle_deposit_owed', {
    p_property_id: propertyId,
    p_deposit_id: input.depositId,
    p_method: input.method,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not record the settlement: ${error.message}`)
  }

  const result = data as { ok: true } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeSettlementFailure(result) }
  }

  return { ok: true }
}

function describeSettlementFailure(result: RpcRefusal): DepositWriteError {
  switch (result.error) {
    case 'not_released':
      return {
        code: result.error,
        message: 'Nothing is owed until the release has been approved.',
      }
    case 'nothing_owed':
      return { code: result.error, message: 'This guest owes nothing beyond their deposit.' }
    case 'already_settled':
      return { code: result.error, message: 'This has already been recorded as settled.' }
    case 'invalid_method':
      return { code: result.error, message: 'Choose how the money arrived.' }
    default:
      return { code: result.error, message: 'That deposit no longer exists.' }
  }
}
