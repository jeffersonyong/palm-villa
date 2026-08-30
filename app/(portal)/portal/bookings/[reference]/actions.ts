'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getBookingById, transitionBooking } from '@/lib/db/bookings'

/**
 * Cancelling a booking (capability B3, cancel half).
 *
 * The status move itself was already built — `transitionBooking` has carried
 * the `cancel` event since the schema slice — so what lives here is the gate,
 * the reason, and the revalidation.
 *
 * ── What this deliberately does not do ─────────────────────────────────────
 *
 * No refund and no forfeiture. prd.md §9.5 says the deposit paid is forfeited
 * on cancellation [C], but **which** payment that means is prd.md §18 N5 and
 * still open — the BND 100 security deposit is collected on arrival, so a
 * guest who cancels never paid it, and the answer is most likely the
 * prepayment. Computing either here would resolve an open question silently,
 * which CLAUDE.md forbids: a gap in the PRD is a question for the client, not a
 * design decision. Settlement is therefore handled outside the system and the
 * dialog says so.
 */

export interface BookingActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
}

/**
 * A cancellation reason is required.
 *
 * **[A]** — the PRD does not ask for one. B3 promises who, what and when; this
 * adds why, because prd.md §9.5 forfeits a payment on cancellation and the
 * first question in any dispute about that is what the booking was cancelled
 * for. Recorded as an assumption in prd.md §9.6 rather than assumed silently.
 */
const cancelBookingSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, 'Say briefly why this booking is being cancelled.')
    .max(280, 'Keep the reason under 280 characters.'),
})

export async function cancelBookingAction(
  _previous: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
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

  const { bookingId, reason } = parsed.data

  // Read the reference before the write, so a successful cancellation can
  // revalidate its own route. Reading it afterwards would work too, but this
  // way a booking that has already vanished is reported as such rather than
  // surfacing as a failed transition.
  const booking = await getBookingById(bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  const result = await transitionBooking(bookingId, 'cancel', actor.userId, reason)

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  // The unit is released by the occupancy trigger inside the same transaction,
  // so the availability figures on the booking screens are now wrong until
  // they are rebuilt.
  revalidatePath('/portal/bookings')
  revalidatePath(`/portal/bookings/${booking.reference}`)
  revalidatePath('/portal/bookings/new')
  revalidatePath('/portal')

  return { status: 'done' }
}
