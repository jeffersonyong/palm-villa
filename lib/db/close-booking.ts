import { transition, type BookingEvent, type BookingStatus } from '@/lib/domain/booking-state'
import { formatStayDate, type StayDate } from '@/lib/domain/dates'
import type { DepositOutcome } from '@/lib/domain/deposit'
import type { Cents } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'

/**
 * Closing a booking without a stay — cancelling it, or marking the guest a
 * no-show — and settling its security deposit as it closes (prd.md §9.5;
 * capabilities B3 and B16).
 *
 * ── Why this is not `transitionBooking` ───────────────────────────────────
 *
 * Both events move money. The client's answer of 10 September 2026 (N5) is
 * that the deposit is kept when a guest cancels or never arrives, and a
 * deposit kept is a liability that stops being one — so the status move and
 * what happens to the deposit are one fact, written by one function in one
 * transaction: `close_booking()`. `transition_booking()` refuses both events,
 * so no path closes a booking and leaves its deposit sitting on the ledger.
 *
 * ── What happens to the deposit ───────────────────────────────────────────
 *
 * Decided in SQL under the deposit's row lock, from the row — never from what
 * the dialog showed, which may be a second out of date:
 *
 * - **Held** — collected and not released. A no-show keeps it. A cancellation
 *   keeps it, or gives it back, as the clerk chose.
 * - **Promised and never verified.** Nothing is held, so nothing is kept; the
 *   promise lapses and leaves the payments queue.
 * - **None, waived, or quoting nothing.** Nothing happens.
 *
 * **Keeping is the default and returning is the clerk's call [A].** The rule is
 * the guest's cancellation. A booking made in error, or cancelled by the
 * property, is not that, and without a way to say so the guest's BND 100 would
 * become revenue with no way back. Whoever may cancel may choose, with the
 * reason they already have to give — put to the client in open-questions.md.
 *
 * The status pair is derived by `transition()`, because architecture.md §5.3
 * keeps the machine in one module, and re-checked under the lock.
 */

/** What happened to the security deposit when the booking closed. */
export type DepositSettledAtClose = 'kept' | 'returned' | 'promise_lapsed' | 'none'

export type CloseBookingRefusalCode =
  'not_found' | 'illegal_transition' | 'terminal_state' | 'status_changed' | 'before_arrival_day'

export type CloseBookingResult =
  | {
      ok: true
      status: BookingStatus
      deposit: DepositSettledAtClose
      /** What was kept or given back. Zero where nothing was. */
      amount: Cents
    }
  | { ok: false; error: { code: CloseBookingRefusalCode; message: string } }

export interface CancelBookingInput {
  bookingId: string
  actorId: string | null
  /**
   * Why. Required by the cancel screen; carried on the booking's audit event,
   * and on the release note of a deposit given back.
   */
  reason: string | null
  /**
   * What to do with a deposit still held. Sent whether or not one turns out to
   * be — the function decides that under its lock — so no caller can cancel
   * without having chosen.
   */
  depositOutcome: DepositOutcome
}

export function cancelBooking(input: CancelBookingInput): Promise<CloseBookingResult> {
  return closeBooking('cancel', input.bookingId, input.actorId, input.reason, input.depositOutcome)
}

/**
 * Marks a confirmed guest a no-show. The deposit is kept — prd.md §9.5 has no
 * exception for a guest who never came — and the unit is released for the
 * nights they did not use. Refused before the arrival day (`canMarkNoShow`).
 */
export function markBookingNoShow(input: {
  bookingId: string
  actorId: string | null
}): Promise<CloseBookingResult> {
  return closeBooking('mark_no_show', input.bookingId, input.actorId, null, null)
}

async function closeBooking(
  event: Extract<BookingEvent, 'cancel' | 'mark_no_show'>,
  bookingId: string,
  actorId: string | null,
  reason: string | null,
  depositOutcome: DepositOutcome | null,
): Promise<CloseBookingResult> {
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

  const { data: applied, error: applyError } = await dataClient().rpc('close_booking', {
    p_property_id: propertyId,
    p_booking_id: bookingId,
    p_from_status: from,
    p_to_status: next.status,
    p_event: event,
    p_deposit_outcome: depositOutcome,
    p_actor_id: actorId,
    p_reason: reason,
  })

  if (applyError) {
    throw new Error(`Could not close the booking: ${applyError.message}`)
  }

  const result = applied as
    | { ok: true; status: BookingStatus; deposit: DepositSettledAtClose; amount_cents: number }
    | { ok: false; error: string; arrival?: string | null }

  if (!result.ok) {
    return { ok: false, error: describeCloseFailure(result) }
  }

  return {
    ok: true,
    status: result.status,
    deposit: result.deposit,
    amount: result.amount_cents,
  }
}

function describeCloseFailure(result: { error: string; arrival?: string | null }): {
  code: CloseBookingRefusalCode
  message: string
} {
  switch (result.error) {
    case 'before_arrival_day':
      return {
        code: 'before_arrival_day',
        message: result.arrival
          ? `This guest is not due until ${formatStayDate(result.arrival as StayDate)}, so they cannot be a no-show yet.`
          : 'This booking has no arrival date, so it cannot be marked a no-show.',
      }
    case 'status_changed':
      return {
        code: 'status_changed',
        message:
          'Someone else changed this booking while you were working on it. Reload and try again.',
      }
    case 'not_found':
      return { code: 'not_found', message: 'That booking no longer exists.' }
    default:
      // `invalid_event`, `deposit_outcome_required` and `invalid_deposit_outcome`
      // are this module calling the function wrongly — no screen can produce
      // them — so they are a fault, not a sentence for a clerk.
      throw new Error(`close_booking() refused: ${result.error}`)
  }
}
