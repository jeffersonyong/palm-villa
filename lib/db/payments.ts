import { transition, type BookingStatus, isTerminal } from '@/lib/domain/booking-state'
import type { StayDate } from '@/lib/domain/dates'
import type { Cents } from '@/lib/domain/money'
import type { PaymentMatchKind, PaymentMethod, PaymentStatus } from '@/lib/domain/payment'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'

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
   * What the booking is worth **now**. The queue's "amount expected" column,
   * and what a confirmation is matched against.
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
  /** Always null in this slice; the documents slice fills it (§8). */
  slipDocumentId: string | null
  checkIn: StayDate | null
  unitRef: string | null
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
  unit_ref: string | null
}

const SUMMARY_COLUMNS =
  'id, booking_id, booking_reference, booking_status, guest_name, guest_phone, ' +
  'method, status, due_amount_cents, expected_amount_cents, amount_cents, ' +
  'observed_reference, observed_sender, observed_on, match_kind, ' +
  'amount_override_reason, match_reason, collected_by, collected_at, ' +
  'verified_by, verified_at, created_at, slip_document_id, check_in, unit_ref'

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
    unitRef: row.unit_ref,
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
   * A log reads newest first; a queue reads oldest first. Both are this same
   * query, so which end is "the top" is the caller's to say.
   */
  newestFirst?: boolean
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
  const propertyId = await currentPropertyId()

  let query = dataClient()
    .from('payment_summary')
    .select(SUMMARY_COLUMNS)
    .eq('property_id', propertyId)

  if (filter.statuses && filter.statuses.length > 0) {
    query = query.in('status', filter.statuses)
  }

  if (filter.methods && filter.methods.length > 0) {
    query = query.in('method', filter.methods)
  }

  if (filter.collectedFrom) {
    query = query.gte('collected_at', filter.collectedFrom)
  }

  if (filter.collectedBefore) {
    query = query.lt('collected_at', filter.collectedBefore)
  }

  const { data, error } = await query.order(filter.newestFirst ? 'collected_at' : 'created_at', {
    ascending: !filter.newestFirst,
  })

  if (error) {
    throw new Error(`Could not list payments: ${error.message}`)
  }

  return (data as unknown as PaymentSummaryRow[]).map(toPayment)
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
  | 'illegal_transition'
  | 'terminal_state'

export type VerifyPaymentResult =
  | { ok: true; payment: Payment }
  | {
      ok: false
      error: { code: VerifyPaymentErrorCode; message: string; dueCents?: Cents }
    }

/**
 * Confirms a payment and moves its booking (capabilities B5 and B6).
 *
 * Mirrors `transitionBooking`: the booking's current status is read, legality
 * is decided by `transition()` in lib/domain, and the pair is handed to the
 * database function, which makes the payment write, the status write and the
 * audit events atomic under a row lock.
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

  const next = transition(payment.bookingStatus, 'verify_payment')

  if (!next.ok) {
    return { ok: false, error: next.error }
  }

  const { data, error } = await dataClient().rpc('verify_payment', {
    p_property_id: propertyId,
    p_payment_id: input.paymentId,
    p_from_status: payment.bookingStatus,
    p_to_status: next.status,
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

  return { ok: true, payment: confirmed }
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
  | { ok: true; payment: Payment; bookingStatus: BookingStatus }
  | {
      ok: false
      error: {
        code: 'not_found' | 'booking_closed' | 'status_changed' | 'reason_required'
        message: string
        dueCents?: Cents
      }
    }

/**
 * Records cash collected against a booking (capability B7).
 *
 * prd.md §10.5: "record who collected, when, and against which booking."
 *
 * The booking's status moves only when it was waiting for money. Cash against
 * a booking already confirmed — the guest settling something at the desk — is
 * a fact worth recording that changes no state, and forcing a transition to
 * make the write feel symmetrical would invent one.
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

  // Which move the cash implies, if any — decided by the machine rather than
  // by a hand-written list of statuses.
  const event =
    from === 'awaiting_payment_verification'
      ? ('verify_payment' as const)
      : from === 'draft' || from === 'held'
        ? ('pay_in_full' as const)
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
        error: 'booking_not_found' | 'status_changed' | 'reason_required'
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

  return { ok: true, payment, bookingStatus: result.status }
}
