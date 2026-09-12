import { transition, type BookingStatus, isTerminal } from '@/lib/domain/booking-state'
import type { DayBounds, StayDate } from '@/lib/domain/dates'
import { depositSecuresBooking } from '@/lib/domain/deposit'
import type { Cents } from '@/lib/domain/money'
import type { PaymentMatchKind, PaymentMethod, PaymentStatus } from '@/lib/domain/payment'
import type { BookingStream } from '@/lib/domain/stream'
import { dataClient } from '@/lib/supabase/data'

import { isRangeNotSatisfiable, type PageRequest } from './bookings'
import { currentPropertyId } from './property'
import { readAllRows } from './rows'
import { applySearch } from './search'

/**
 * Payment reads and writes (capabilities B4–B7, prd.md §10).
 *
 * Reads go through the `payment_summary` view, which carries the booking's
 * reference, guest and live total alongside the payment — the verification
 * queue needs all of it per row and would otherwise cost a round trip each.
 *
 * Writes go through `verify_payment()` and `record_cash_payment()`, which make
 * the payment row, the booking's status and the audit events atomic. Neither
 * this module nor those functions decides legality: `transition()` in
 * lib/domain does, here, and the status pair is passed down
 * (architecture.md §5.3).
 *
 * Nothing in this module computes a balance, a refund or an amount
 * outstanding. prd.md §18 N5 is open; §9.6 records why nothing depends on it.
 */

/** A payment as the portal's screens read it. */
export interface Payment {
  id: string
  bookingId: string
  /** The booking's reference, which is also the payment reference (§6.1). */
  bookingReference: string
  bookingStatus: BookingStatus
  guestName: string
  guestPhone: string
  method: PaymentMethod
  status: PaymentStatus
  /**
   * What is **outstanding** on the booking now — its total less every other
   * payment already verified against it. The queue's "amount expected"
   * column, and what a confirmation is matched against.
   *
   * It used to be the booking's whole total, and for a booking with one
   * payment the two are the same figure. They part company on a top-up: a
   * second transfer raised to clear what an amendment added is matched
   * against the difference, not against a total its predecessor has already
   * reduced (capability B13).
   */
  due: Cents
  /**
   * What the booking was worth when this payment was raised, refreshed to
   * `due` at verification. While the two differ, the booking has been
   * repriced since the guest was told what to send — which the queue flags,
   * because otherwise a clerk matches against a stale quote and overrides for
   * no reason.
   */
  expected: Cents
  /** Null until somebody has actually looked at the bank, or counted. */
  amount: Cents | null
  /** What appeared in the bank, for the manual-match case (prd.md §10.4). */
  observedReference: string | null
  observedSender: string | null
  observedOn: StayDate | null
  matchKind: PaymentMatchKind | null
  amountOverrideReason: string | null
  matchReason: string | null
  collectedBy: string | null
  collectedAt: string | null
  verifiedBy: string | null
  verifiedAt: string | null
  /** The waiting clock behind the queue's "time waiting" column. */
  createdAt: string
  /**
   * The transfer slip on file, or null (capability B4).
   *
   * prd.md §10.4: evidence, not verification — staff still check the bank, and
   * this changes nothing about how a payment is confirmed. Read from the
   * payment rather than joined, because the verification queue asks it once per
   * row and that screen is measured in seconds (prd.md §20).
   */
  slipDocumentId: string | null
  checkIn: StayDate | null
  /**
   * The day a day pass admits them. Null for every other stream — a pass
   * occupies no unit, so `checkIn` is null for one and this is where the
   * queue gets a date to show instead (prd.md §6.1).
   */
  passDate: StayDate | null
  unitRef: string | null
  /**
   * What the booking sold — read for revenue by stream (capability E5), which
   * groups money received by the product it was received for.
   */
  bookingStream: BookingStream
}

interface PaymentSummaryRow {
  id: string
  booking_id: string
  booking_reference: string
  booking_status: BookingStatus
  guest_name: string
  guest_phone: string
  method: PaymentMethod
  status: PaymentStatus
  due_amount_cents: number
  expected_amount_cents: number
  amount_cents: number | null
  observed_reference: string | null
  observed_sender: string | null
  observed_on: StayDate | null
  match_kind: PaymentMatchKind | null
  amount_override_reason: string | null
  match_reason: string | null
  collected_by: string | null
  collected_at: string | null
  verified_by: string | null
  verified_at: string | null
  created_at: string
  slip_document_id: string | null
  check_in: StayDate | null
  pass_date: StayDate | null
  unit_ref: string | null
  booking_stream: BookingStream
}

const SUMMARY_COLUMNS =
  'id, booking_id, booking_reference, booking_status, guest_name, guest_phone, ' +
  'method, status, due_amount_cents, expected_amount_cents, amount_cents, ' +
  'observed_reference, observed_sender, observed_on, match_kind, ' +
  'amount_override_reason, match_reason, collected_by, collected_at, ' +
  'verified_by, verified_at, created_at, slip_document_id, check_in, pass_date, unit_ref, ' +
  'booking_stream'

function toPayment(row: PaymentSummaryRow): Payment {
  return {
    id: row.id,
    bookingId: row.booking_id,
    bookingReference: row.booking_reference,
    bookingStatus: row.booking_status,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    method: row.method,
    status: row.status,
    due: row.due_amount_cents,
    expected: row.expected_amount_cents,
    amount: row.amount_cents,
    observedReference: row.observed_reference,
    observedSender: row.observed_sender,
    observedOn: row.observed_on,
    matchKind: row.match_kind,
    amountOverrideReason: row.amount_override_reason,
    matchReason: row.match_reason,
    collectedBy: row.collected_by,
    collectedAt: row.collected_at,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    slipDocumentId: row.slip_document_id,
    checkIn: row.check_in,
    passDate: row.pass_date,
    unitRef: row.unit_ref,
    bookingStream: row.booking_stream,
  }
}

export interface PaymentListFilter {
  statuses?: readonly PaymentStatus[]
  methods?: readonly PaymentMethod[]
  /**
   * Collected on or after this date, and before the day after `collectedTo` —
   * both ends inclusive, as the calendar shows them. The half-open conversion
   * happens at the page boundary, matching how the bookings list handles its
   * own range (architecture.md §5.2).
   */
  collectedFrom?: string
  collectedBefore?: string
  /**
   * Money that may have landed inside a window, however it arrived — the
   * revenue report's filter (capability E5).
   *
   * A coarse superset of three columns, because which day a payment counts on
   * is a rule with branches (`revenueDateOf` in lib/domain/reports/revenue):
   * cash by the day it was collected, a transfer by the date read off the bank
   * or, failing that, the day it was verified. Expressing that here would put
   * half the rule in a query string; the domain applies the exact one to what
   * comes back.
   *
   * **Not combined with `search` today, and untested if it ever is.** Both
   * write an `or=` on the same query, which PostgREST ANDs together — probably
   * what a caller would want, but nothing here proves it. A revenue report
   * that grows a search box should add the test before it adds the field.
   */
  collectedOrObserved?: {
    /** The window as instants, for the two `timestamptz` columns. */
    bounds: DayBounds
    /** The window as calendar dates, for `observed_on`, which is a `date`. */
    from: StayDate
    to: StayDate
  }
  /**
   * A log reads newest first; a queue reads oldest first. Both are this same
   * query, so which end is "the top" is the caller's to say.
   */
  newestFirst?: boolean
  /** A term the booking reference, guest name, phone or unit contains. */
  search?: string
}

/**
 * Payments, oldest first.
 *
 * A queue is worked from the top and the longest wait belongs there, which is
 * the opposite of every other list in the portal. The cash log re-sorts at its
 * own screen, because a log is read newest-first.
 *
 * An empty filter array is treated as no filter, matching `listBookings`.
 */
export async function listPayments(filter: PaymentListFilter = {}): Promise<readonly Payment[]> {
  // **Chunked, because PostgREST truncates at `max_rows` and says nothing.**
  //
  // This function had six callers and every one of them wanted all the rows:
  // the cash log and its total, the verification queue, the daily cash-up and
  // its CSV, and the revenue report. Past a thousand matching payments each
  // would have quietly used the first thousand — a log that stops mid-month, a
  // total short by an unknown amount, a reconciliation that is simply wrong
  // with nothing on screen to say so.
  //
  // The loop is `readAllRows` in ./rows.ts, which lib/db/export.ts has used
  // since it met the same ceiling. A fresh builder per page because a
  // PostgREST query carries its own range once awaited.
  const propertyId = await currentPropertyId()
  const rows = await readAllRows<PaymentSummaryRow>(
    (from, to) => paymentQuery(propertyId, filter).range(from, to),
    { label: 'payments' },
  )

  return rows.map(toPayment)
}

/**
 * The shape of a query this filter can be applied to.
 *
 * Structural because the data client is untyped, and the same reason
 * ./bookings.ts declares one: the row read, the chunked read and the head
 * count are three different PostgREST builder types that all answer these
 * four methods.
 */
interface FilterablePaymentQuery<Self> {
  in(column: string, values: unknown[]): Self
  gte(column: string, value: unknown): Self
  lt(column: string, value: unknown): Self
  or(filters: string): Self
}

/**
 * Applies a list filter to a `payment_summary` query.
 *
 * **One function, three readers.** The chunked read, the paged read and the
 * count go through this and nothing else, so a page's rows, its footer total
 * and the money summed beneath it are filtered by exactly the same predicates.
 * Two copies would be two chances for a total to disagree with the rows above
 * it, which is the one thing a summary of a list must never do — the rule
 * `applyListFilter` sets in ./bookings.ts.
 *
 * Each call mutates the builder, so nothing is chained on a return value.
 */
function applyPaymentFilter<Query extends FilterablePaymentQuery<Query>>(
  query: Query,
  filter: PaymentListFilter,
): void {
  if (filter.statuses && filter.statuses.length > 0) {
    query.in('status', filter.statuses as unknown[])
  }

  if (filter.methods && filter.methods.length > 0) {
    query.in('method', filter.methods as unknown[])
  }

  if (filter.collectedFrom) {
    query.gte('collected_at', filter.collectedFrom)
  }

  if (filter.collectedBefore) {
    query.lt('collected_at', filter.collectedBefore)
  }

  if (filter.collectedOrObserved) {
    const { bounds, from, to } = filter.collectedOrObserved

    query.or(
      [
        `and(collected_at.gte.${bounds.start},collected_at.lt.${bounds.end})`,
        `and(observed_on.gte.${from},observed_on.lte.${to})`,
        `and(verified_at.gte.${bounds.start},verified_at.lt.${bounds.end})`,
      ].join(','),
    )
  }

  if (filter.search) {
    applySearch(
      query,
      ['booking_reference', 'guest_name', 'guest_phone', 'unit_ref'],
      filter.search,
    )
  }
}

/**
 * A fresh `payment_summary` query carrying the filter and the sort.
 *
 * A factory rather than a value because a PostgREST builder carries its own
 * range once awaited, so the chunked read needs a new one per page.
 *
 * **Synchronous, and it has to be.** A builder is a thenable, so an `async`
 * function returning one would await it — handing back an executed response
 * instead of a query to range. The property id is therefore resolved by the
 * caller and passed in, which also reads it once per read rather than once
 * per chunk.
 *
 * The sort ends in a unique tiebreak. Under pagination that is not cosmetic:
 * two rows sharing a `collected_at` can swap between requests, and a row that
 * swaps across a page boundary is a row somebody sees twice or never.
 */
function paymentQuery(propertyId: string, filter: PaymentListFilter) {
  const query = dataClient()
    .from('payment_summary')
    .select(SUMMARY_COLUMNS, { count: 'exact' })
    .eq('property_id', propertyId)

  applyPaymentFilter(query, filter)

  return query
    .order(filter.newestFirst ? 'collected_at' : 'created_at', { ascending: !filter.newestFirst })
    .order('id', { ascending: !filter.newestFirst })
}

/** One page of payments, with the total the footer counts against. */
export interface PaymentPage {
  payments: readonly Payment[]
  /** How many matched the filter, ignoring the page. */
  total: number
}

/**
 * Payments, one page at a time.
 *
 * The read a screen uses. `listPayments` above answers with every matching row
 * and is for the callers that genuinely need them — a running balance, a CSV —
 * while anything rendering a table asks for a page, because handing a browser
 * five thousand rows is its own problem and a chunked read does not fix it.
 */
export async function listPaymentPage(
  filter: PaymentListFilter = {},
  page?: PageRequest,
): Promise<PaymentPage> {
  return listPaymentRange(
    filter,
    page ? { offset: (page.page - 1) * page.pageSize, limit: page.pageSize } : undefined,
  )
}

/** A window of rows by offset, for a list that does not start at a page boundary. */
export interface RangeRequest {
  offset: number
  limit: number
}

/**
 * Payments, by offset rather than by page number.
 *
 * The verification queue needs this and `listPaymentPage` cannot serve it. That
 * screen is two lists shown as one: everything still waiting — transfers and
 * promised deposits together — and beneath it everything already settled. The
 * waiting half is bounded by real work and is read whole; the settled half
 * grows for the life of the building and is read a page at a time. So the
 * offset into the settled rows is the page's offset less however many waiting
 * rows came first, which is not a multiple of the page size and therefore not
 * a page number.
 */
export async function listPaymentRange(
  filter: PaymentListFilter = {},
  range?: RangeRequest,
): Promise<PaymentPage> {
  const propertyId = await currentPropertyId()
  const query = paymentQuery(propertyId, filter)

  if (range) {
    query.range(range.offset, range.offset + range.limit - 1)
  }

  const { data, error, count } = await query

  if (error) {
    // A bookmarked `?page=7` that has outlived its rows is a 416 from
    // PostgREST rather than a fault. Answered as an empty page carrying the
    // real total, so the caller can clamp and read again — the treatment
    // ./bookings.ts gives it.
    if (range && isRangeNotSatisfiable(error)) {
      return { payments: [], total: await countPayments(filter) }
    }

    throw new Error(`Could not list payments: ${error.message}`)
  }

  return { payments: (data as unknown as PaymentSummaryRow[]).map(toPayment), total: count ?? 0 }
}

/**
 * What the matching payments come to, across every page.
 *
 * **The figure a paged screen must not compute for itself.** A total summed
 * from the rows in hand is a total that changes when you turn the page, and
 * on a money screen that is not a rounding difference — it is a number that
 * is simply wrong, with nothing on screen admitting it. The cash log summed
 * what it had fetched, which was right only while every match fitted in one
 * read.
 *
 * Chunked rather than a SQL `sum()`, deliberately. An aggregate would be one
 * round trip instead of several, and `cash_on_hand_before()` makes exactly
 * that argument for the cash-up's opening balance. What it would also be is a
 * second copy of this filter written in SQL — and a total filtered by
 * predicates that have drifted from the rows above it is the failure this
 * function exists to prevent, arriving by another door. One predicate path,
 * one answer. `amount_cents` alone is read, so the cost is an integer a row.
 *
 * If this screen is ever slow, the fix is an RPC that takes the filter whole
 * rather than one that re-states it.
 */
export async function sumPaymentAmounts(filter: PaymentListFilter = {}): Promise<Cents> {
  const propertyId = await currentPropertyId()

  const rows = await readAllRows<{ amount_cents: number | null }>(
    (from, to) => {
      const query = dataClient()
        .from('payment_summary')
        .select('amount_cents')
        .eq('property_id', propertyId)

      applyPaymentFilter(query, filter)

      // Ordered so the chunks partition the set rather than overlapping it.
      return query.order('id', { ascending: true }).range(from, to)
    },
    { label: 'payment amounts' },
  )

  return rows.reduce((total, row) => total + (row.amount_cents ?? 0), 0)
}

/**
 * How many payments match, without fetching any.
 *
 * Used on the out-of-range path — the ordinary read gets its count riding
 * along with the rows — and by the verification queue, which needs to know how
 * long its settled half is before it decides which slice of it to read.
 */
export async function countPayments(filter: PaymentListFilter = {}): Promise<number> {
  const propertyId = await currentPropertyId()

  const query = dataClient()
    .from('payment_summary')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)

  applyPaymentFilter(query, filter)

  const { count, error } = await query

  if (error) {
    throw new Error(`Could not count payments: ${error.message}`)
  }

  return count ?? 0
}

/** Every payment against one booking, oldest first. */
export async function listPaymentsForBooking(bookingId: string): Promise<readonly Payment[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('payment_summary')
    .select(SUMMARY_COLUMNS)
    .eq('property_id', propertyId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Could not read payments for booking ${bookingId}: ${error.message}`)
  }

  return (data as unknown as PaymentSummaryRow[]).map(toPayment)
}

export async function getPaymentById(id: string): Promise<Payment | null> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('payment_summary')
    .select(SUMMARY_COLUMNS)
    .eq('property_id', propertyId)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read payment ${id}: ${error.message}`)
  }

  return data ? toPayment(data as unknown as PaymentSummaryRow) : null
}

export interface VerifyPaymentInput {
  paymentId: string
  /** What the staff member saw in the bank. */
  observedAmount: Cents
  match: PaymentMatchKind
  observedReference?: string | null
  observedSender?: string | null
  observedOn?: StayDate | null
  amountOverrideReason?: string | null
  matchReason?: string | null
  actorId: string | null
}

export type VerifyPaymentErrorCode =
  | 'not_found'
  | 'already_verified'
  | 'status_changed'
  | 'reason_required'
  | 'deposit_not_secured'
  | 'illegal_transition'
  | 'terminal_state'

export type VerifyPaymentResult =
  | {
      ok: true
      payment: Payment
      /**
       * Whether **this call** is what confirmed the booking (capability A8).
       *
       * `payment.bookingStatus` cannot answer it. The payment is re-read after
       * the write, so a top-up verified against a booking that was already
       * confirmed reads `confirmed` too — nothing moved, and the status says
       * `confirmed` either way. Anything that should happen once, when a
       * booking becomes confirmed, has to key on this instead: the guest gets
       * one confirmation email, not one per payment.
       */
      confirmedNow: boolean
      /**
       * The payment settled money against a booking that is still waiting on
       * its security deposit, so it did not confirm it. The queue's toast
       * says so, because "PV-4821 confirmed" would be untrue.
       */
      awaitingDeposit: boolean
    }
  | {
      ok: false
      error: { code: VerifyPaymentErrorCode; message: string; dueCents?: Cents }
    }

/**
 * Whether a booking's security deposit is in hand — the same question
 * `booking_deposit_is_secured()` answers in SQL, asked here first so the
 * status pair offered to the function is the right one.
 *
 * True when the booking quotes no deposit, or a deposit row exists that has
 * been collected **for at least the quoted figure**: counted at the desk or
 * verified in the queue. A promised transfer is not in hand, and neither is a
 * deposit that arrived short (prd.md §11).
 *
 * The predicate itself is `depositSecuresBooking` in lib/domain, so this reads
 * the rows and the rule lives in one place.
 */
async function depositSecures(
  propertyId: string,
  bookingId: string,
): Promise<{ quoted: Cents; secured: boolean }> {
  const [booking, deposit] = await Promise.all([
    dataClient()
      .from('booking')
      .select('security_deposit_cents')
      .eq('property_id', propertyId)
      .eq('id', bookingId)
      .maybeSingle(),
    dataClient()
      .from('deposit')
      .select('collected_at, amount_cents')
      .eq('property_id', propertyId)
      .eq('booking_id', bookingId)
      .maybeSingle(),
  ])

  if (booking.error) {
    throw new Error(`Could not read booking ${bookingId}: ${booking.error.message}`)
  }

  if (deposit.error) {
    throw new Error(`Could not read the deposit on ${bookingId}: ${deposit.error.message}`)
  }

  const quoted = (booking.data as { security_deposit_cents: number } | null)?.security_deposit_cents
  const row = deposit.data as { collected_at: string | null; amount_cents: number } | null

  return {
    quoted: quoted ?? 0,
    secured: depositSecuresBooking({
      quoted: quoted ?? 0,
      held: row?.amount_cents ?? 0,
      collected: row?.collected_at != null,
    }),
  }
}

/**
 * Confirms a payment and, where the deposit allows, moves its booking
 * (capabilities B5 and B6).
 *
 * Mirrors `transitionBooking`: the booking's current status is read, legality
 * is decided by `transition()` in lib/domain, and the pair is handed to the
 * database function, which makes the payment write, the status write and the
 * audit events atomic under a row lock.
 *
 * ── The deposit decides whether the booking moves ─────────────────────────
 *
 * A booking quoting a security deposit is confirmed by that deposit and by
 * nothing else (prd.md §9.1, §11). Money for the stay is verified whenever it
 * arrives — it settles the balance — but while the deposit is still a promise
 * in the queue the booking stays where it is, and the deposit's own
 * verification is what confirms it. So a customer who chose "everything now"
 * is confirmed once, on the deposit's row, whichever row the clerk works
 * first; and a customer who sent the stay and forgot the BND 100 is not
 * quietly confirmed on the wrong money.
 *
 * Every failure is returned rather than thrown, because none of them is a
 * fault in the system — a booking that moved underneath the caller, a payment
 * a colleague verified a second earlier, or an amount that needs a reason are
 * all sentences on screen.
 */
export async function verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
  const propertyId = await currentPropertyId()
  const payment = await getPaymentById(input.paymentId)

  if (!payment) {
    return { ok: false, error: { code: 'not_found', message: 'That payment no longer exists.' } }
  }

  if (payment.status === 'verified') {
    return {
      ok: false,
      error: {
        code: 'already_verified',
        message: 'This payment has already been verified. Reload to see who confirmed it.',
      },
    }
  }

  // ── The booking may not move at all ──────────────────────────────────────
  //
  // Verifying the transfer a booking is *waiting* on confirms it — provided
  // the deposit is in hand, or none is quoted. Verifying a top-up raised
  // against a booking that is already confirmed moves nothing — there is no
  // legal event from `confirmed` that means "confirmed again", and
  // `transition()` says so rather than being talked round. The pair is passed
  // as nulls in either case, which is the arrangement `recordCashPayment`
  // already had for cash taken against a booking that needed no move. The
  // function re-checks the deposit under the row lock.
  const isAwaiting = payment.bookingStatus === 'awaiting_payment_verification'
  const deposit = isAwaiting ? await depositSecures(propertyId, payment.bookingId) : null
  const moves = isAwaiting && deposit !== null && deposit.secured
  const next = moves ? transition(payment.bookingStatus, 'verify_payment') : null

  if (next && !next.ok) {
    return { ok: false, error: next.error }
  }

  const { data, error } = await dataClient().rpc('verify_payment', {
    p_property_id: propertyId,
    p_payment_id: input.paymentId,
    p_from_status: moves ? payment.bookingStatus : null,
    p_to_status: next?.ok ? next.status : null,
    p_observed_amount_cents: input.observedAmount,
    p_match_kind: input.match,
    p_observed_reference: input.observedReference ?? null,
    p_observed_sender: input.observedSender ?? null,
    p_observed_on: input.observedOn ?? null,
    p_amount_override_reason: input.amountOverrideReason ?? null,
    p_match_reason: input.matchReason ?? null,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not verify the payment: ${error.message}`)
  }

  const result = data as
    | { ok: true; status: BookingStatus; amount_cents: number; due_cents: number }
    | { ok: false; error: VerifyPaymentErrorCode; due_cents?: number }

  if (!result.ok) {
    return { ok: false, error: describeVerifyFailure(result.error, result.due_cents) }
  }

  const confirmed = await getPaymentById(input.paymentId)

  if (!confirmed) {
    // Not reachable: the function returned from a committed transaction.
    throw new Error(`Payment ${input.paymentId} was verified but could not be read back.`)
  }

  return {
    ok: true,
    payment: confirmed,
    confirmedNow: moves,
    awaitingDeposit: isAwaiting && !moves,
  }
}

function describeVerifyFailure(
  code: VerifyPaymentErrorCode,
  dueCents?: number,
): { code: VerifyPaymentErrorCode; message: string; dueCents?: Cents } {
  switch (code) {
    case 'not_found':
      return { code, message: 'That payment no longer exists.' }
    case 'already_verified':
      return {
        code,
        message: 'This payment has already been verified. Reload to see who confirmed it.',
      }
    case 'status_changed':
      return {
        code,
        message:
          'Someone else changed this booking while you were working on it. Reload and retry.',
      }
    case 'deposit_not_secured':
      // The function's own guard, reached only if the deposit was un-collected
      // between the read above and the lock — which nothing does. Said plainly
      // rather than swallowed.
      return {
        code,
        message:
          'This booking is still waiting on its security deposit, so the payment could not confirm it. Reload and try again.',
      }
    default:
      // `reason_required` reaching here means the booking was repriced after
      // the dialog was opened, so the amount the clerk typed no longer matches
      // what is due. The figure rides along so the screen can say what changed
      // rather than only that something did.
      return {
        code: 'reason_required',
        message: 'This booking has been repriced. Check the amount due and say why it differs.',
        dueCents,
      }
  }
}

export interface RecordCashPaymentInput {
  bookingId: string
  amount: Cents
  amountOverrideReason?: string | null
  actorId: string | null
}

export type RecordCashPaymentResult =
  | {
      ok: true
      payment: Payment
      bookingStatus: BookingStatus
      /**
       * Whether **this call** confirmed the booking — the same distinction
       * `VerifyPaymentResult` draws, and for the same reason. `bookingStatus`
       * reads `confirmed` for cash taken against a booking that was already
       * confirmed, where nothing moved.
       */
      confirmedNow: boolean
      /**
       * The cash settled the stay against a booking still waiting on its
       * security deposit, so it did not confirm it — the deposit will.
       */
      awaitingDeposit: boolean
    }
  | {
      ok: false
      error: {
        code:
          | 'not_found'
          | 'booking_closed'
          | 'status_changed'
          | 'reason_required'
          | 'deposit_not_secured'
        message: string
        dueCents?: Cents
      }
    }

/**
 * Records cash collected against a booking (capability B7).
 *
 * prd.md §10.5: "record who collected, when, and against which booking."
 *
 * The booking's status moves only when it was waiting for money **and the
 * deposit allows it** — a booking quoting a security deposit is confirmed by
 * that deposit alone (prd.md §9.1, §11), so cash for the stay against one
 * still owed is recorded and settles the balance, and the deposit confirms
 * the booking when it is taken. Cash against a booking already confirmed — the
 * guest settling something at the desk — is a fact worth recording that
 * changes no state, and forcing a transition to make the write feel
 * symmetrical would invent one.
 *
 * This is never the way to take the deposit itself: that is
 * `recordBookingDeposit`, which writes the other kind of money to the ledger
 * it belongs on.
 */
export async function recordCashPayment(
  input: RecordCashPaymentInput,
): Promise<RecordCashPaymentResult> {
  const propertyId = await currentPropertyId()

  const { data: bookingRow, error: readError } = await dataClient()
    .from('booking')
    .select('status')
    .eq('property_id', propertyId)
    .eq('id', input.bookingId)
    .maybeSingle()

  if (readError) {
    throw new Error(`Could not read booking ${input.bookingId}: ${readError.message}`)
  }

  if (!bookingRow) {
    return { ok: false, error: { code: 'not_found', message: 'That booking no longer exists.' } }
  }

  const from = (bookingRow as { status: BookingStatus }).status

  if (isTerminal(from)) {
    return {
      ok: false,
      error: {
        code: 'booking_closed',
        message: `This booking is ${from.replace(/_/g, ' ')}, so cash cannot be recorded against it.`,
      },
    }
  }

  // Which move the cash implies, if any. Only a booking still waiting can
  // move, and only when its deposit is in hand or none is quoted — otherwise
  // the cash is recorded and the deposit is what confirms the booking. The
  // event itself is the machine's rather than a hand-written list of statuses.
  const isWaiting = from === 'awaiting_payment_verification' || from === 'draft' || from === 'held'
  const deposit = isWaiting ? await depositSecures(propertyId, input.bookingId) : null
  const event =
    isWaiting && deposit !== null && deposit.secured
      ? from === 'awaiting_payment_verification'
        ? ('verify_payment' as const)
        : ('pay_in_full' as const)
      : null

  const next = event ? transition(from, event) : null

  if (next && !next.ok) {
    return { ok: false, error: { code: 'status_changed', message: next.error.message } }
  }

  const { data, error } = await dataClient().rpc('record_cash_payment', {
    p_property_id: propertyId,
    p_booking_id: input.bookingId,
    p_amount_cents: input.amount,
    p_from_status: next ? from : null,
    p_to_status: next && next.ok ? next.status : null,
    p_event: event,
    p_amount_override_reason: input.amountOverrideReason ?? null,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not record the cash payment: ${error.message}`)
  }

  const result = data as
    | { ok: true; payment_id: string; status: BookingStatus }
    | {
        ok: false
        error: 'booking_not_found' | 'status_changed' | 'reason_required' | 'deposit_not_secured'
        due_cents?: number
      }

  if (!result.ok) {
    if (result.error === 'booking_not_found') {
      return { ok: false, error: { code: 'not_found', message: 'That booking no longer exists.' } }
    }

    if (result.error === 'status_changed') {
      return {
        ok: false,
        error: {
          code: 'status_changed',
          message:
            'Someone else changed this booking while you were working on it. Reload and retry.',
        },
      }
    }

    if (result.error === 'deposit_not_secured') {
      return {
        ok: false,
        error: {
          code: 'deposit_not_secured',
          message:
            'This booking is still waiting on its security deposit, so the cash could not confirm it. Reload and try again.',
        },
      }
    }

    return {
      ok: false,
      error: {
        code: 'reason_required',
        message: 'This is not the amount due. Say why that is, and it will be recorded with it.',
        dueCents: result.due_cents,
      },
    }
  }

  const payment = await getPaymentById(result.payment_id)

  if (!payment) {
    throw new Error(`Payment ${result.payment_id} was recorded but could not be read back.`)
  }

  return {
    ok: true,
    payment,
    bookingStatus: result.status,
    confirmedNow: next?.ok === true && next.status === 'confirmed',
    awaitingDeposit: isWaiting && event === null,
  }
}

export interface RecordTransferPaymentInput {
  bookingId: string
  actorId: string | null
}

export type RecordTransferPaymentResult =
  | { ok: true; payment: Payment }
  | {
      ok: false
      error: {
        code: 'booking_not_found' | 'nothing_outstanding' | 'already_pending'
        message: string
        dueCents?: Cents
      }
    }

/**
 * Raises a bank transfer against an existing booking, for whatever it still
 * owes (capability B13).
 *
 * The path that did not exist. Until this, the only two writers of a payment
 * row were booking creation and the cash form, so a guest who extended a paid
 * stay and wanted to transfer the difference could not be recorded at all —
 * and the workaround, logging a transfer as cash, puts money in Finance's
 * daily cash-up (E4) that was never in the drawer.
 *
 * ── It takes no amount ────────────────────────────────────────────────────
 *
 * A pending transfer has been promised, not seen. `payment.amount_cents` stays
 * null until somebody has looked at the bank — a table constraint enforces it
 * — so what is raised here is an expectation of the outstanding figure, and
 * the real number is entered at verification against the statement. Asking for
 * it twice would invite the second answer to disagree with the first.
 *
 * The booking does not move: a top-up is raised against one already confirmed,
 * and confirmation does not happen twice.
 */
export async function recordTransferPayment(
  input: RecordTransferPaymentInput,
): Promise<RecordTransferPaymentResult> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('record_transfer_payment', {
    p_property_id: propertyId,
    p_booking_id: input.bookingId,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not record the transfer: ${error.message}`)
  }

  const result = data as
    | { ok: true; payment_id: string; due_cents: number }
    | {
        ok: false
        error: 'booking_not_found' | 'nothing_outstanding' | 'already_pending'
        due_cents?: number
      }

  if (!result.ok) {
    return { ok: false, error: describeTransferFailure(result.error, result.due_cents) }
  }

  const raised = await getPaymentById(result.payment_id)

  if (!raised) {
    // Not reachable: the function returned this id from a committed insert.
    throw new Error(`Transfer ${result.payment_id} was raised but could not be read back.`)
  }

  return { ok: true, payment: raised }
}

function describeTransferFailure(
  code: 'booking_not_found' | 'nothing_outstanding' | 'already_pending',
  dueCents?: number,
): { code: typeof code; message: string; dueCents?: Cents } {
  switch (code) {
    case 'booking_not_found':
      return { code, message: 'That booking no longer exists.' }
    case 'nothing_outstanding':
      return {
        code,
        message:
          dueCents !== undefined && dueCents < 0
            ? 'This booking has been overpaid. Settle the difference outside the system.'
            : 'This booking is fully paid. There is nothing left to collect.',
        dueCents,
      }
    case 'already_pending':
      return {
        code,
        message:
          'A transfer is already awaiting verification on this booking. Confirm that one first.',
      }
  }
}
