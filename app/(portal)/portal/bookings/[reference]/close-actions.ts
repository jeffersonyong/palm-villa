'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getBookingById } from '@/lib/db/bookings'
import {
  cancelBooking,
  markBookingNoShow,
  type CloseBookingResult,
  type DepositSettledAtClose,
} from '@/lib/db/close-booking'
import { DEPOSIT_OUTCOMES } from '@/lib/domain/deposit'
import type { Cents } from '@/lib/domain/money'

/**
 * Closing a booking without a stay: cancelling it (capability B3), or marking
 * the guest a no-show — and, in the same act, what happens to the security
 * deposit (prd.md §9.5, capability B16).
 *
 * Both used to be a status move and nothing else. The client answered N5 on
 * 10 September 2026 — "we keep the deposit" — so both now settle the deposit
 * as they close, in one transaction (lib/db/close-booking.ts). What a
 * cancellation does to money paid for the *stay* is unchanged: it is refunded
 * outside the system, and the dialog says so.
 *
 * ── The permission ────────────────────────────────────────────────────────
 *
 * **`booking.cancel` gates both [A].** A no-show ends a booking and keeps its
 * deposit exactly as a cancellation does, and minting a string for it would put
 * a row in the permission matrix that means "cancel, but on the arrival day".
 * The same holder chooses whether a cancelled guest's deposit is kept or given
 * back — the reason they already type is what the choice is read against.
 * Both are put to the client in open-questions.md.
 */

export interface CloseBookingState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
  /** What happened to the deposit, so the toast can say the true thing. */
  closed?: { deposit: DepositSettledAtClose; amount: Cents }
}

/**
 * A cancellation reason is required.
 *
 * **[A]** — the PRD does not ask for one. B3 promises who, what and when; this
 * adds why, because prd.md §9.5 keeps the deposit on a cancellation and the
 * first question in any dispute about that is what the booking was cancelled
 * for. Recorded as an assumption in prd.md §9.6 rather than assumed silently.
 *
 * `depositOutcome` defaults to keep, which is the rule, and is what a dialog
 * that showed no choice — because nothing was held — sends.
 */
const cancelBookingSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, 'Say briefly why this booking is being cancelled.')
    .max(280, 'Keep the reason under 280 characters.'),
  depositOutcome: z.enum(DEPOSIT_OUTCOMES).default('keep'),
})

export async function cancelBookingAction(
  _previous: CloseBookingState,
  formData: FormData,
): Promise<CloseBookingState> {
  // architecture.md §4: every mutation passes the permission check first.
  const actor = await requirePermission('booking.cancel')

  const parsed = cancelBookingSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}

    for (const issue of parsed.error.issues) {
      const field = issue.path[0]

      if (typeof field === 'string' && !fieldErrors[field]) {
        fieldErrors[field] = issue.message
      }
    }

    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors }
  }

  const { bookingId, reason, depositOutcome } = parsed.data

  // Read before the write, so a booking that has already vanished is reported
  // as such rather than as a failed transition — and so the revalidation below
  // has a reference and a unit to name.
  const booking = await getBookingById(bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  const result = await cancelBooking({
    bookingId,
    actorId: actor.userId,
    reason,
    depositOutcome,
  })

  return settle(result, booking.reference, booking.stay?.unitRef ?? null)
}

const markNoShowSchema = z.object({
  bookingId: z.string().uuid(),
})

/**
 * Marking a confirmed guest a no-show, from their arrival day on.
 *
 * No reason is asked for. The event says what happened, and there is only one
 * thing it can mean; a required box would collect "did not arrive" four hundred
 * times. The deposit is kept without a choice — prd.md §9.5 makes no exception
 * for a guest who never came — and the unit goes back on sale for the nights
 * they did not use.
 */
export async function markNoShowAction(
  _previous: CloseBookingState,
  formData: FormData,
): Promise<CloseBookingState> {
  const actor = await requirePermission('booking.cancel')

  const parsed = markNoShowSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return { status: 'error', message: 'This booking could not be closed. Reload the screen.' }
  }

  const booking = await getBookingById(parsed.data.bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  const result = await markBookingNoShow({ bookingId: booking.id, actorId: actor.userId })

  return settle(result, booking.reference, booking.stay?.unitRef ?? null)
}

function settle(
  result: CloseBookingResult,
  reference: string,
  unitRef: string | null,
): CloseBookingState {
  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidateClosedBooking(reference, unitRef)

  return { status: 'done', closed: { deposit: result.deposit, amount: result.amount } }
}

/**
 * Everything a closed booking changes.
 *
 * The widest list in the portal, because closing without a stay touches every
 * register at once: the booking and its unit's availability, the deposit
 * ledger a kept deposit leaves, the payments queue a lapsed promise leaves,
 * and the revenue a kept deposit joins.
 */
function revalidateClosedBooking(reference: string, unitRef: string | null): void {
  revalidatePath('/portal')
  revalidatePath('/portal/bookings')
  revalidatePath(`/portal/bookings/${reference}`)
  revalidatePath('/portal/bookings/new')
  revalidatePath('/portal/bookings/calendar')
  revalidatePath('/portal/deposits')
  revalidatePath(`/portal/deposits/${reference}`)
  revalidatePath('/portal/payments')
  revalidatePath('/portal/reports')
  revalidatePath('/portal/units')

  if (unitRef) {
    revalidatePath(`/portal/units/${unitRef}`)
  }
}
