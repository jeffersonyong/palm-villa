import {
  depositFiguresOf,
  depositShortfallOf,
  depositStageOf,
  describeReleaseFailure,
  describeTopUpFailure,
  type DepositFigures,
  type DepositStage,
} from '@/lib/domain/deposit'
import { transition, type BookingStatus } from '@/lib/domain/booking-state'
import type { DateRange } from '@/lib/domain/availability'
import type { DayBounds, StayDate } from '@/lib/domain/dates'
import { formatCents, type Cents } from '@/lib/domain/money'
import type { PaymentMatchKind, PaymentMethod } from '@/lib/domain/payment'
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

/** A deposit kept when its booking closed without a stay (prd.md §9.5). */
export interface DepositForfeiture {
  at: string
  by: string | null
  /** Everything that was held — less than the quote for a short deposit. */
  amount: Cents
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
  /**
   * When the money was actually seen. Null while a promised transfer is
   * unverified (prd.md §9.1) — the one state in which this row is not yet a
   * liability, and the reason every "what do we hold" read excludes it.
   */
  collectedAt: string | null
  /**
   * The transfer slip on file for this deposit, or null (N39, capability A6).
   *
   * A deposit is not a payment (prd.md §11), so until A6 landed there was
   * nowhere to hang the screenshot a guest sends of the one transfer they were
   * asked to make. It is the same `payment_slip` kind as a payment'''s, on the
   * same seven-year clock — what differs is only the row it points at.
   */
  slipDocumentId: string | null
  /** When the customer said they had transferred it, or null at the desk. */
  promisedAt: string | null
  /** What the verifier read off the bank, for a deposit promised online. */
  observed: { reference: string | null; sender: string | null; on: string | null } | null
  /** Why a figure other than the quoted one was accepted. */
  overrideReason: string | null
  inspection: DepositInspection | null
  /** Unwaived charges standing against the deposit now. */
  charges: Cents
  chargeCount: number
  release: DepositRelease | null
  settlement: DepositSettlement | null
  /**
   * Kept when the booking was cancelled or the guest never arrived, or null.
   * Never beside a `release`: a deposit is kept or given back, not both
   * (`deposit_kept_or_returned`).
   */
  forfeiture: DepositForfeiture | null
  /** Derived, never stored. See lib/domain/deposit.ts. */
  stage: DepositStage
  /**
   * What goes back and what is owed. Computed from the approved charges once a
   * release exists, so a released deposit keeps showing the figures somebody
   * signed rather than a recomputation.
   */
  figures: DepositFigures
  /**
   * What the booking quotes, beside `amount` which is what was taken.
   *
   * prd.md §11 keeps the two apart on purpose and reads the quote live, so an
   * amendment that reprices the booking moves this and never `amount`.
   */
  quoted: Cents
  /**
   * What is still owed against the quote — zero for a whole deposit, and zero
   * for a promise, which is awaited rather than short.
   */
  shortfall: Cents
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
  collected_at: string | null
  slip_document_id: string | null
  promised_at: string | null
  observed_reference: string | null
  observed_sender: string | null
  observed_on: string | null
  amount_override_reason: string | null
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
  quoted_cents: number
  forfeited_at: string | null
  forfeited_by: string | null
  forfeited_amount_cents: number | null
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
  'slip_document_id',
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
  'promised_at',
  'observed_reference',
  'observed_sender',
  'observed_on',
  'amount_override_reason',
  'quoted_cents',
  'forfeited_at',
  'forfeited_by',
  'forfeited_amount_cents',
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
    slipDocumentId: row.slip_document_id,
    promisedAt: row.promised_at,
    observed:
      row.observed_reference === null && row.observed_sender === null && row.observed_on === null
        ? null
        : {
            reference: row.observed_reference,
            sender: row.observed_sender,
            on: row.observed_on,
          },
    overrideReason: row.amount_override_reason,
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
    forfeiture:
      row.forfeited_at === null || row.forfeited_amount_cents === null
        ? null
        : {
            at: row.forfeited_at,
            by: row.forfeited_by,
            amount: row.forfeited_amount_cents,
          },
    stage: depositStageOf({
      collected: row.collected_at !== null,
      released: release !== null,
      forfeited: row.forfeited_at !== null,
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
    quoted: row.quoted_cents,
    shortfall: depositShortfallOf(row.quoted_cents, row.amount_cents, row.collected_at !== null),
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
    // Nor one that was kept when its booking closed (prd.md §9.5): the
    // business stopped owing it back at that moment, and revenue has it now.
    .is('forfeited_at', null)
    // E1 answers what the property owes back **right now**, so a deposit a
    // customer has promised and nobody has verified is not in it: the money
    // is not there, and a ledger that counted it would overstate the
    // liability by every abandoned transfer. Those rows are the payment
    // queue's work, and `listPendingDeposits` is what reads them.
    .not('collected_at', 'is', null)
    .order('collected_at', { ascending: true })

  if (error) {
    throw new Error(`Could not read the deposits held: ${error.message}`)
  }

  return (data as unknown as DepositSummaryRow[]).map(toDeposit)
}

/**
 * The deposits collected inside a half-open span of instants.
 *
 * The cash-up's informational line (capability E4): cash security deposits go
 * into the same drawer as the takings, so a clerk counting it has to be told
 * they are there — while prd.md §11 keeps them out of the total, because a
 * deposit is money the business owes back rather than money it earned.
 *
 * Instants, not dates: `collected_at` is a `timestamptz` and a bare date is
 * cast at the session's midnight, which is 08:00 in Brunei. The caller builds
 * the bounds with `bruneiDayBounds`/`bruneiWindowBounds` (lib/domain/dates).
 */
export async function listDepositsCollectedBetween(
  bounds: DayBounds,
  method?: PaymentMethod,
): Promise<readonly Deposit[]> {
  const propertyId = await currentPropertyId()

  const query = summaryQuery(propertyId)
    .gte('collected_at', bounds.start)
    .lt('collected_at', bounds.end)
    .order('collected_at', { ascending: true })

  if (method) {
    query.eq('method', method)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Could not read the deposits collected: ${error.message}`)
  }

  return (data as unknown as DepositSummaryRow[]).map(toDeposit)
}

/** Cash that crossed the counter for a security deposit, and the moment it did. */
export interface DepositCashArrival {
  collectedAt: string
  amount: Cents
}

/**
 * The cash security deposits that actually arrived inside a window
 * (capability E4).
 *
 * The cash-up's informational line used to be `listDepositsCollectedBetween`
 * summed straight, and a top-up broke that in two ways at once. A deposit row
 * carries one `method` and one `collected_at` — how and when it was *first*
 * seen — but `amount_cents` grows when the desk tops it up, so:
 *
 *   - BND 50 topped up in cash against a deposit that first arrived by
 *     transfer went into the drawer and into no figure on this screen. A
 *     clerk counting the notes found 50 they could not explain.
 *   - BND 50 topped up today against a deposit collected on Monday moved
 *     **Monday's** figure, which somebody may already have counted, printed
 *     and signed.
 *
 * Both are the same mistake — reading a running total as a day's takings — and
 * the fix is to ask what arrived, which the trail records exactly. A deposit
 * reports what was collected on its own day (its total, less everything added
 * since), and every cash top-up reports on the day it was taken. Subtracting
 * *all* of a deposit's top-ups is exact rather than approximate, because a
 * top-up can only follow a collection.
 *
 * prd.md §14 is unchanged by this: deposits stay out of the takings total.
 * What changes is that the line beside the total is now true.
 */
export async function listDepositCashArrivals(
  bounds: DayBounds,
): Promise<readonly DepositCashArrival[]> {
  const propertyId = await currentPropertyId()
  const collected = await listDepositsCollectedBetween(bounds, 'cash')

  const [addedSince, toppedUpInWindow] = await Promise.all([
    topUpTotalsFor(
      propertyId,
      collected.map((deposit) => deposit.id),
    ),
    cashTopUpsBetween(propertyId, bounds),
  ])

  const firstArrivals = collected.flatMap((deposit) =>
    deposit.collectedAt === null
      ? []
      : [
          {
            collectedAt: deposit.collectedAt,
            amount: deposit.amount - (addedSince.get(deposit.id) ?? 0),
          },
        ],
  )

  // A deposit whose every cent arrived later contributes nothing to its own
  // day rather than a zero row, which would read as a deposit of nothing.
  return [...firstArrivals.filter((arrival) => arrival.amount > 0), ...toppedUpInWindow]
}

/** What has been added to each of these deposits since it was collected, all time. */
async function topUpTotalsFor(
  propertyId: string,
  depositIds: readonly string[],
): Promise<ReadonlyMap<string, Cents>> {
  if (depositIds.length === 0) {
    return new Map()
  }

  const { data, error } = await dataClient()
    .from('audit_event')
    .select('entity_id, after')
    .eq('property_id', propertyId)
    .eq('action', 'deposit.topped_up')
    .in('entity_id', depositIds)

  if (error) {
    throw new Error(`Could not read the deposit top-ups: ${error.message}`)
  }

  const totals = new Map<string, Cents>()

  for (const row of data as unknown as TopUpEventRow[]) {
    const added = row.after?.added_cents ?? 0

    totals.set(row.entity_id, (totals.get(row.entity_id) ?? 0) + added)
  }

  return totals
}

/** Every top-up taken in cash inside the window, whatever its deposit first was. */
async function cashTopUpsBetween(
  propertyId: string,
  bounds: DayBounds,
): Promise<readonly DepositCashArrival[]> {
  const { data, error } = await dataClient()
    .from('audit_event')
    .select('at, after')
    .eq('property_id', propertyId)
    .eq('action', 'deposit.topped_up')
    .gte('at', bounds.start)
    .lt('at', bounds.end)
    .order('at', { ascending: true })

  if (error) {
    throw new Error(`Could not read the deposit top-ups: ${error.message}`)
  }

  return (data as unknown as TopUpEventRow[]).flatMap((row) =>
    // Filtered here rather than in the query: the method lives inside the
    // event's `after` document, and a jsonb path in a filter is a string
    // comparison nobody reading this file would see was load-bearing.
    row.after?.method === 'cash' && (row.after.added_cents ?? 0) > 0
      ? [{ collectedAt: row.at, amount: row.after.added_cents ?? 0 }]
      : [],
  )
}

interface TopUpEventRow {
  entity_id: string
  at: string
  after: { added_cents?: number; method?: string } | null
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

/**
 * A write the closed-booking guard refused, as a sentence — or null for any
 * other error, which the caller throws.
 *
 * `deposit_refuses_money_after_close` and its twin on charges
 * (20260922000100) raise PV003 rather than returning a refusal, because they are
 * one rule enforced for four writers that were never taught it. The screens do
 * not offer these moves on a closed booking, so reaching one is a colleague
 * closing the booking while a dialog was open — the arrangement PV002 has for a
 * unit taken out of service.
 */
export function closedBookingRefusal(error: {
  code?: string
  message?: string
}): DepositWriteError | null {
  if (error.code !== 'PV003') {
    return null
  }

  return error.message?.includes('deposit_kept')
    ? {
        code: 'deposit_kept',
        message:
          'This deposit was kept when the booking closed, so nothing more is taken against it or charged to it.',
      }
    : {
        code: 'booking_closed',
        message:
          'This booking has closed without a stay, so nothing more is taken against it. Reload to see how it closed.',
      }
}

export interface RecordBookingDepositInput {
  bookingId: string
  /** Counted at the desk, or promised by transfer. */
  method: PaymentMethod
  actorId: string | null
}

/**
 * Takes the security deposit against a booking, before the guest arrives
 * (capability B16, staff half; prd.md §9.1, §11).
 *
 * The path the desk did not have. `create_walk_in_booking()` takes the
 * deposit as a booking is made and `submit_public_payment()` records one a
 * customer promised online, and between them there was no way for a staff
 * member to record the BND 100 against a booking that already existed — so a
 * guest who transferred it and never pressed the button on their own page
 * left the desk with nothing correct to do. Recording it as a booking payment
 * was the only reachable option and it is the wrong kind of money: prd.md
 * §9.1 spends a paragraph on why a deposit must never read as one, and §14
 * keeps a cash deposit out of the cash-up total that a cash payment lands in.
 *
 * It is also the way out when check-in refuses: `check_in_booking()` takes
 * nothing at the door, so a confirmed booking with its deposit still owed is
 * settled here first, in cash, and then checked in.
 *
 * ── The two methods are different acts ────────────────────────────────────
 *
 * **Cash is counted**, so it is collected the moment it exists and the booking
 * is secured on the spot — `secure_with_deposit`, which reaches `confirmed`
 * without claiming the stay was paid. That distinction is the whole reason the
 * event exists rather than reusing `pay_in_full`.
 *
 * **A transfer is a promise**, so it is written the way the customer's own
 * button writes one and joins the same verification queue, settled by the same
 * `verifyDeposit()`. Nothing here is a second way to confirm money.
 *
 * **Cash against an existing promise fulfils it** rather than being refused —
 * the customer whose transfer failed, walking in with the notes. prd.md §11
 * already makes that judgement at the door and nothing in its reasoning
 * depends on the guest arriving, so the row is corrected to the method that
 * actually changed hands and `promised_at` survives as the record of what
 * they said. It moves the booking by `verify_payment`, the edge
 * `verifyDeposit` already uses, because the promise is being settled rather
 * than the booking secured afresh.
 *
 * The status pair is derived here and passed down, because architecture.md
 * §5.3 keeps the machine in one module. A booking already `confirmed` — the
 * desk catching up on a transfer that landed days ago — passes nulls and does
 * not move, which is `verify_payment()`'s arrangement for a top-up and for
 * the same reason: a second confirmation line in a history for a booking that
 * never moved is noise.
 *
 * The amount is never passed. It is the booking's quoted figure, read under
 * the row lock, exactly as check-in reads it — what is held must not move when
 * an amendment reprices the stay (prd.md §11).
 */
export async function recordBookingDeposit(input: RecordBookingDepositInput): Promise<
  DepositWriteResult<{
    depositId: string
    amount: Cents
    status: BookingStatus
    /** True when this call is what confirmed the booking, for capability A8. */
    confirmedNow: boolean
  }>
> {
  const propertyId = await currentPropertyId()

  const { data: row, error: readError } = await dataClient()
    .from('booking')
    .select('status')
    .eq('property_id', propertyId)
    .eq('id', input.bookingId)
    .maybeSingle()

  if (readError) {
    throw new Error(`Could not read booking ${input.bookingId}: ${readError.message}`)
  }

  if (!row) {
    return { ok: false, error: { code: 'not_found', message: 'That booking no longer exists.' } }
  }

  const current = (row as { status: BookingStatus }).status

  // Whether a promise is already standing decides which move this is, so it is
  // read before the write. The database re-reads it under the row lock and is
  // what actually settles a race; this only picks the pair to offer.
  const standing = await getDepositByBookingId(input.bookingId)
  const fulfilsPromise =
    input.method === 'cash' && standing !== null && standing.collectedAt === null

  // Cash secures the booking; a promised transfer sends it to the queue; cash
  // against a promise settles it. All three are only legal from somewhere a
  // booking is still waiting, and `transition` is what says so — a booking
  // already confirmed simply does not move. `secure_with_deposit` leaves
  // `awaiting_payment_verification` too: a booking waiting on a transfer for
  // the stay is confirmed by the deposit counted here, and the transfer stays
  // in the queue to settle the balance.
  const event = fulfilsPromise
    ? 'verify_payment'
    : input.method === 'cash'
      ? 'secure_with_deposit'
      : 'submit_payment'
  const next = transition(current, event)

  const { data, error } = await dataClient().rpc('record_booking_deposit', {
    p_property_id: propertyId,
    p_booking_id: input.bookingId,
    p_method: input.method,
    p_from_status: next.ok ? current : null,
    p_to_status: next.ok ? next.status : null,
    p_actor_id: input.actorId,
  })

  if (error) {
    const closed = closedBookingRefusal(error)

    if (closed) {
      return { ok: false, error: closed }
    }

    throw new Error(`Could not record the deposit: ${error.message}`)
  }

  const result = data as
    { ok: true; deposit_id: string; amount_cents: number; status: BookingStatus } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeRecordDepositFailure(result) }
  }

  return {
    ok: true,
    depositId: result.deposit_id,
    amount: result.amount_cents,
    status: result.status,
    // Only cash confirms here. A transfer is confirmed by whoever verifies it,
    // and `verifyDeposit` reports that moment — saying it twice would send the
    // guest two confirmation emails for one booking.
    confirmedNow: next.ok && next.status === 'confirmed',
  }
}

function describeRecordDepositFailure(result: RpcRefusal): DepositWriteError {
  switch (result.error) {
    case 'no_deposit_quoted':
      return {
        code: result.error,
        message: 'This booking quotes no security deposit, so there is nothing to take against it.',
      }
    case 'already_recorded':
      return {
        code: result.error,
        message: 'A security deposit is already held against this booking.',
      }
    case 'already_promised':
      return {
        code: result.error,
        message:
          'This booking is already waiting on a deposit transfer. Confirm that one from the payments queue, or take the deposit in cash.',
      }
    case 'status_changed':
      return {
        code: result.error,
        message:
          'Someone else moved this booking while you were working on it. Reload and try again.',
      }
    default:
      return { code: result.error, message: 'That booking no longer exists.' }
  }
}

export interface CheckInBookingInput {
  bookingId: string
  actorId: string | null
}

export type CheckInRefusalCode =
  'not_found' | 'status_changed' | 'deposit_not_secured' | 'illegal_transition' | 'terminal_state'

/**
 * Checks a guest in. It collects nothing.
 *
 * The deposit is taken when the booking is made — at the counter, or by the
 * transfer a customer promises online — because it is what secures the
 * booking (prd.md §9.1, capability B16). The door is therefore not a place
 * money changes hands, and `check_in_booking()` refuses a booking whose
 * quoted deposit is not in the safe rather than taking it: a guest checked in
 * with no deposit recorded is the gap this product exists to close, and the
 * booking's Money card is one click away with the two honest ways to fix it —
 * confirm the transfer in the queue, or take the BND 100 in cash.
 *
 * The status move is decided here and not in SQL: `transition()` in
 * lib/domain/booking-state.ts is the single place the state machine exists
 * (architecture.md §5.3), and `check_in_booking()` is passed the pair it
 * derived.
 *
 * `depositId` comes back null where the booking quoted no deposit, which is
 * not a failure: the caller says so on screen rather than implying money
 * changed hands.
 */
export async function checkInBooking(input: CheckInBookingInput): Promise<
  | {
      ok: true
      status: BookingStatus
      /** The deposit held against the stay, or null where none was quoted. */
      depositId: string | null
      /** What is actually held — zero where nothing was quoted. */
      amount: Cents
    }
  | { ok: false; error: { code: CheckInRefusalCode; message: string } }
> {
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
  // lock. Whether the deposit is secured is deliberately NOT read here — the
  // function decides that under the same lock, so a deposit verified a second
  // before the click is counted and one collected a second after is not
  // double-counted.
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

  // The amount comes back from the function rather than from a read here:
  // it is what the ledger actually holds, written under the row lock, and the
  // figure a clerk is shown is the one they say out loud to the guest.
  return {
    ok: true,
    status: result.status,
    depositId: result.deposit_id,
    amount: result.amount_cents,
  }
}

function describeCheckInFailure(result: RpcRefusal): {
  code: CheckInRefusalCode
  message: string
} {
  switch (result.error) {
    case 'status_changed':
      return {
        code: result.error,
        message:
          'Someone else moved this booking while you were working on it. Reload and try again.',
      }
    case 'deposit_not_secured': {
      const amount =
        typeof result.amount_cents === 'number' ? `BND ${formatCents(result.amount_cents)} ` : ''

      // Three ways to fail one gate, and each names the action that works.
      // `short` is the one this cannot get wrong: sending a clerk to the
      // payments queue for a deposit that was already verified is how the
      // shortfall goes uncollected a second time.
      if (result.short === true) {
        const held =
          typeof result.held_cents === 'number' ? `BND ${formatCents(result.held_cents)}` : 'Less'

        return {
          code: result.error,
          message: `Only ${held} of the ${amount}security deposit is held. Top it up from the booking, then check the guest in.`,
        }
      }

      return {
        code: result.error,
        message:
          result.promised === true
            ? `The ${amount}security deposit transfer has not been verified. Confirm it from the payments queue, or take it in cash from the booking, then check the guest in.`
            : `The ${amount}security deposit has not been taken. Record it from the booking, then check the guest in.`,
      }
    }
    default:
      return { code: 'not_found', message: 'That booking no longer exists.' }
  }
}

/**
 * The deposits somebody has promised and nobody has checked.
 *
 * The verification queue's second source (capability B4, for a deposit). It is
 * a separate read rather than a filter on the ledger's because the two answer
 * opposite questions: E1 asks what the property is holding, and this asks what
 * it has been told to expect. A row here is not money.
 *
 * Ordered oldest first, like the payments queue, because the figure that
 * matters to a customer standing on the other end is how long they have been
 * waiting.
 */
export async function listPendingDeposits(): Promise<readonly Deposit[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await summaryQuery(propertyId)
    .is('collected_at', null)
    // A promise on a booking that closed without a stay is not awaited by
    // anybody (prd.md §9.5): there is nothing left for the money to secure,
    // and verifying it now is refused. It stays on the booking as a promise
    // that lapsed, and leaves the queue.
    .not('booking_status', 'in', '(cancelled,no_show,expired)')
    .order('promised_at', { ascending: true })

  if (error) {
    throw new Error(`Could not read the deposits awaited: ${error.message}`)
  }

  return (data as unknown as DepositSummaryRow[]).map(toDeposit)
}

export interface VerifyDepositInput {
  depositId: string
  /** What the verifier actually saw in the bank app. */
  observedAmount: Cents
  /**
   * How the money was tied to this booking. Derived by `matchKindFor` from
   * whether the bank showed a reference — never chosen by whoever is calling.
   */
  match: PaymentMatchKind
  observedReference?: string | null
  observedSender?: string | null
  observedOn?: StayDate | null
  /** Required when the figure disagrees with what the booking quoted. */
  overrideReason?: string | null
  /** Required when `match` is `manual`; otherwise the optional note. */
  matchReason?: string | null
  actorId: string | null
}

/**
 * Confirms that a promised security deposit arrived (capability B16).
 *
 * The same act as verifying a payment and deliberately a different function —
 * see the migration for why the two are not one with a flag. What is repeated
 * here is only the shape: the status move is decided by `transition()` and
 * passed in, the amount rule is enforced in SQL under the row lock, and a
 * figure that disagrees with the quote needs a written reason.
 *
 * A booking that is already `confirmed` — a desk that took cash for the stay
 * before the transfer landed — passes no status pair, so the deposit is
 * collected against a booking that stays exactly where it is. That is
 * `verify_payment()`'s arrangement for a top-up, and for the same reason:
 * writing `confirmed → confirmed` would put a second confirmation line in a
 * history for a booking that never moved.
 *
 * It returns the booking it collected against, and whether this call is what
 * confirmed it — both for capability A8's confirmation email, which is the
 * only thing that has ever needed them. The paragraph above is what makes
 * `confirmedNow` answerable: `verify_payment` is the one edge into
 * `confirmed`, so a booking moved here or it was already there.
 *
 * **Still no accounting pack**, and that is unchanged by the widening: a
 * deposit is not money against the booking, it settles nothing, and the pack
 * arrives when the stay itself is paid on arrival (capability G5).
 */
export async function verifyDeposit(input: VerifyDepositInput): Promise<
  DepositWriteResult<{
    amount: Cents
    bookingId: string
    confirmedNow: boolean
    /** What the deposit is still short of the quote. Non-zero means it secured nothing. */
    shortfall: Cents
  }>
> {
  const propertyId = await currentPropertyId()

  const { data: row, error: readError } = await dataClient()
    .from('deposit_summary')
    .select('booking_status')
    .eq('property_id', propertyId)
    .eq('id', input.depositId)
    .maybeSingle()

  if (readError) {
    throw new Error(`Could not read deposit ${input.depositId}: ${readError.message}`)
  }

  if (!row) {
    return { ok: false, error: { code: 'not_found', message: 'That deposit no longer exists.' } }
  }

  const current = (row as { booking_status: BookingStatus }).booking_status
  const next = transition(current, 'verify_payment')

  const { data, error } = await dataClient().rpc('verify_deposit', {
    p_property_id: propertyId,
    p_deposit_id: input.depositId,
    p_from_status: next.ok ? current : null,
    p_to_status: next.ok ? next.status : null,
    p_observed_amount_cents: input.observedAmount,
    p_match_kind: input.match,
    p_observed_reference: input.observedReference ?? null,
    p_observed_sender: input.observedSender ?? null,
    p_observed_on: input.observedOn ?? null,
    p_amount_override_reason: input.overrideReason ?? null,
    p_match_reason: input.matchReason ?? null,
    p_actor_id: input.actorId,
  })

  if (error) {
    const closed = closedBookingRefusal(error)

    if (closed) {
      return { ok: false, error: closed }
    }

    throw new Error(`Could not verify the deposit: ${error.message}`)
  }

  const result = data as
    | {
        ok: true
        amount_cents: number
        booking_id: string
        shortfall_cents: number
        moved: boolean
      }
    | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeVerifyDepositFailure(result) }
  }

  return {
    ok: true,
    amount: result.amount_cents,
    bookingId: result.booking_id,
    shortfall: result.shortfall_cents,
    // From the function, not from `next.ok`. A transfer that arrived short is
    // collected and moves nothing (prd.md §11), and the pair this offered was
    // only ever an offer — reading it back as fact is how a guest gets a
    // confirmation email for a booking still sitting in `held`.
    confirmedNow: result.moved,
  }
}

export interface TopUpDepositInput {
  bookingId: string
  /** What was counted or seen now — never the new total. */
  amount: Cents
  /** How this money arrived, which need not be how the deposit was first taken. */
  method: PaymentMethod
  actorId: string | null
}

/**
 * The rest of a deposit that arrived short (capability B16; prd.md §11).
 *
 * `recordBookingDeposit`'s shape, and the three differences are the design.
 *
 * **It takes an amount.** Recording a deposit never does — it is the booking's
 * quoted figure and there is nothing to type. What is missing off a short one
 * is whatever the guest has just handed over, and only the person holding it
 * knows.
 *
 * **It is money already seen.** Cash counted at the desk, or a transfer the
 * clerk has just read in the bank app. Nothing here joins the verification
 * queue: a queue row is a promise, and this row stopped being a promise when
 * somebody collected it. That is why `method` is the top-up's own and not the
 * row's — the row keeps how the deposit first arrived.
 *
 * **It confirms the booking only when the deposit comes whole.** The pair is
 * derived here because architecture.md §5.3 keeps the machine in one module,
 * but the function re-derives the shortfall under the row lock and applies the
 * pair only if nothing is left owing. This read picks which pair to offer; the
 * database is what settles a race.
 *
 * `secure_with_deposit` is the event, not a new one. It already means exactly
 * this — the deposit is in and it is what confirms the booking, with the stay
 * still owed in full — and a synonym would fragment "every booking confirmed
 * by its deposit" into two lookups.
 *
 * **No accounting pack**, for `verifyDeposit`'s reason: a deposit is not money
 * against the booking, it settles nothing, and the pack arrives when the stay
 * is paid on arrival (capability G5).
 */
export async function topUpBookingDeposit(input: TopUpDepositInput): Promise<
  DepositWriteResult<{
    depositId: string
    /** The deposit's new total. */
    amount: Cents
    /** What is still owed against the quote, zero once it is whole. */
    shortfall: Cents
    status: BookingStatus
    /** True when this call is what confirmed the booking, for capability A8. */
    confirmedNow: boolean
  }>
> {
  const propertyId = await currentPropertyId()

  const { data: row, error: readError } = await dataClient()
    .from('booking')
    .select('status')
    .eq('property_id', propertyId)
    .eq('id', input.bookingId)
    .maybeSingle()

  if (readError) {
    throw new Error(`Could not read booking ${input.bookingId}: ${readError.message}`)
  }

  if (!row) {
    return { ok: false, error: { code: 'not_found', message: 'That booking no longer exists.' } }
  }

  const current = (row as { status: BookingStatus }).status

  // Whether this top-up completes the deposit decides whether there is a move
  // to offer at all. Read here, re-derived under the row lock there.
  const standing = await getDepositByBookingId(input.bookingId)
  const completes = standing !== null && standing.amount + input.amount >= standing.quoted
  const next = completes ? transition(current, 'secure_with_deposit') : null

  const { data, error } = await dataClient().rpc('top_up_booking_deposit', {
    p_property_id: propertyId,
    p_booking_id: input.bookingId,
    p_amount_cents: input.amount,
    p_method: input.method,
    p_from_status: next?.ok ? current : null,
    p_to_status: next?.ok ? next.status : null,
    p_actor_id: input.actorId,
  })

  if (error) {
    const closed = closedBookingRefusal(error)

    if (closed) {
      return { ok: false, error: closed }
    }

    throw new Error(`Could not top up the deposit: ${error.message}`)
  }

  const result = data as
    | {
        ok: true
        deposit_id: string
        amount_cents: number
        shortfall_cents: number
        confirmed_now: boolean
        status: BookingStatus
      }
    | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeTopUpRefusal(result) }
  }

  return {
    ok: true,
    depositId: result.deposit_id,
    amount: result.amount_cents,
    shortfall: result.shortfall_cents,
    status: result.status,
    confirmedNow: result.confirmed_now,
  }
}

function describeTopUpRefusal(result: RpcRefusal): DepositWriteError {
  if (result.error === 'exceeds_shortfall') {
    const shortfall =
      typeof result.shortfall_cents === 'number' ? formatCents(result.shortfall_cents) : null

    return {
      code: result.error,
      message: shortfall
        ? `This deposit is only BND ${shortfall} short. Enter that or less.`
        : describeTopUpFailure(result.error).message,
    }
  }

  if (result.error === 'status_changed') {
    return {
      code: result.error,
      message:
        'Someone else moved this booking while you were working on it. Reload and try again.',
    }
  }

  if (result.error === 'booking_not_found' || result.error === 'invalid_method') {
    return { code: result.error, message: 'That booking no longer exists.' }
  }

  if (result.error === 'invalid_amount') {
    return { code: result.error, message: 'Enter the amount that arrived.' }
  }

  // The four state refusals share their sentences with `canTopUp`, so a clerk
  // reads the same words whether the screen caught it or the database did.
  const refusal = describeTopUpFailure(result.error)

  return { code: refusal.code, message: refusal.message }
}

function describeVerifyDepositFailure(result: RpcRefusal): DepositWriteError {
  switch (result.error) {
    case 'reason_required': {
      const due = typeof result.due_cents === 'number' ? formatCents(result.due_cents) : null

      return {
        code: result.error,
        message: due
          ? `That is not the BND ${due} this booking quoted. Say why it is being accepted.`
          : 'That is not the figure this booking quoted. Say why it is being accepted.',
      }
    }
    case 'already_collected':
      return {
        code: result.error,
        message:
          'This deposit has already been verified. If it came up short, top it up from the booking.',
      }
    case 'status_changed':
      return {
        code: result.error,
        message:
          'Someone else moved this booking while you were working on it. Reload and try again.',
      }
    case 'invalid_amount':
      return { code: result.error, message: 'Enter the amount that arrived.' }
    // Both are the database refusing what the dialog already refuses, so the
    // wording matches `checkPaymentMatch`'s. Reaching either means a form was
    // submitted past the screen's own check — the position architecture.md §6.2
    // takes on the amount rule, applied to the match.
    case 'match_reason_required':
      return {
        code: result.error,
        message:
          'No reference was quoted, so the note is the only thing identifying this transfer. Say what the bank showed.',
      }
    case 'invalid_match_kind':
      return {
        code: result.error,
        message: 'Could not tell how this deposit was matched. Reload and try again.',
      }
    default:
      return { code: result.error, message: 'That deposit no longer exists.' }
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
