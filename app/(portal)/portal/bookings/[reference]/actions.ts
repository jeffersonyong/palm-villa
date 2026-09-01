'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getBookingById, transitionBooking } from '@/lib/db/bookings'
import { addBookingNote } from '@/lib/db/notes'
import { isNoteAudience, MAX_NOTE_LENGTH } from '@/lib/domain/note'

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

/**
 * Adding a note to a booking.
 *
 * ── Why `booking.view` gates a write ───────────────────────────────────────
 *
 * Every other mutation in the portal has a permission of its own, and this one
 * deliberately does not. A note is a staff member writing down something about
 * a stay that no field carries; anyone who can see the booking is someone
 * whose account of it is worth keeping, and a note nobody could add is a note
 * everyone keeps in WhatsApp instead — which is the thing this product exists
 * to replace. It also stays honest about what it costs to get wrong: a note
 * moves no money, changes no status, and releases no unit.
 *
 * Recorded as an **[A]** in prd.md §9.7. If it turns out that a role should be
 * able to read notes without writing them, that is one permission string and a
 * migration widening the CHECK constraint.
 *
 * No audit event. The note IS the record — it carries its author and its
 * timestamp, is never edited and never deleted — so a second row asserting
 * that somebody wrote something would say nothing the first does not.
 */

const addNoteSchema = z.object({
  bookingId: z.string().uuid(),
  audience: z.string().refine(isNoteAudience, 'Choose who this note is for.'),
  body: z
    .string()
    .trim()
    .min(1, 'Write the note before saving it.')
    .max(MAX_NOTE_LENGTH, `Keep the note under ${MAX_NOTE_LENGTH} characters.`),
})

export interface AddNoteState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
}

export async function addBookingNoteAction(
  _previous: AddNoteState,
  formData: FormData,
): Promise<AddNoteState> {
  const actor = await requirePermission('booking.view')

  const parsed = addNoteSchema.safeParse(Object.fromEntries(formData))

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

  const { bookingId, audience, body } = parsed.data

  // Checked here so a note cannot be attached to a booking that has gone; the
  // composite foreign key would refuse it anyway, and this turns that into a
  // sentence rather than a raised exception.
  const booking = await getBookingById(bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  await addBookingNote({ bookingId, audience, body, authorId: actor.userId })

  revalidatePath(`/portal/bookings/${booking.reference}`)

  return { status: 'done' }
}
