'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getBookingById, transitionBooking } from '@/lib/db/bookings'
import { listDocumentsForBooking } from '@/lib/db/documents'
import { addBookingNote } from '@/lib/db/notes'
import { recordCashPayment, recordTransferPayment } from '@/lib/db/payments'
import { centsFromInput } from '@/lib/domain/money'
import type { PaymentMethod } from '@/lib/domain/payment'
import { isNoteAudience, MAX_NOTE_LENGTH } from '@/lib/domain/note'

import { scheduleAccountingPack } from '../../schedule-accounting-pack'

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

/**
 * Settling what a booking still owes, from the booking itself (capability B13).
 *
 * The case this exists for is an amendment: a guest who paid for one night and
 * extends to two leaves the booking worth more than has been paid for it. Both
 * methods the property takes are here, because the one that was missing is the
 * whole point — cash had a screen already, and a second bank transfer could
 * not be represented at all, which pushed staff into logging transfers as cash
 * and putting money into Finance's cash-up that was never in the drawer.
 *
 * The two behave differently, and the difference is the existing model rather
 * than a choice made here. **Cash** is counted at the desk, so it is recorded
 * as verified and the balance moves immediately. **A transfer** has been
 * promised, not seen, so it is raised as pending, lands in the verification
 * queue, and moves the balance only once somebody has checked the bank.
 *
 * ── The permission, and its name ──────────────────────────────────────────
 *
 * Gated on `payment.record_cash`, which is now narrower as a name than the job
 * it does: it means "may record a payment taken against a booking", and cash
 * was simply the only method that path supported when it was named. Extending
 * it is deliberate rather than minting `payment.record_transfer` — whoever is
 * trusted to say money arrived is the same person either way, and inventing a
 * permission string the client has never been asked about would be this file
 * settling a question that belongs to them. Flagged on N11 in the
 * open-questions register, which already asks how the payment permissions
 * should be split.
 */

const recordPaymentSchema = z.object({
  bookingId: z.string().uuid(),
  method: z.enum(['cash', 'bank_transfer']),
  /**
   * Cash only, and required there. A transfer deliberately carries no amount:
   * `payment.amount_cents` stays null until somebody has looked at the bank,
   * so the figure is entered at verification against the statement rather than
   * promised here and contradicted later.
   */
  amount: z.string().trim().default(''),
  amountOverrideReason: z.string().trim().max(280).default(''),
})

export interface RecordPaymentState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
  recorded?: {
    method: PaymentMethod
    /** Null for a transfer, which has been promised rather than counted. */
    amount: number | null
  }
  /** Echoed back so a refusal does not empty the form. */
  submitted?: { amount: string; amountOverrideReason: string }
}

export async function recordPaymentAction(
  _previous: RecordPaymentState,
  formData: FormData,
): Promise<RecordPaymentState> {
  const actor = await requirePermission('payment.record_cash')
  const parsed = recordPaymentSchema.safeParse(Object.fromEntries(formData))

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

  const input = parsed.data
  const echo = {
    amount: input.amount,
    amountOverrideReason: input.amountOverrideReason,
  }

  const booking = await getBookingById(input.bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  if (input.method === 'bank_transfer') {
    const raised = await recordTransferPayment({
      bookingId: input.bookingId,
      actorId: actor.userId,
    })

    if (!raised.ok) {
      return { status: 'error', message: raised.error.message, submitted: echo }
    }

    revalidateBooking(booking.reference)

    return { status: 'done', recorded: { method: 'bank_transfer', amount: null } }
  }

  const amount = centsFromInput(input.amount)

  if (amount === null || amount <= 0) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: { amount: 'Enter an amount like 200.00.' },
      submitted: echo,
    }
  }

  const recorded = await recordCashPayment({
    bookingId: input.bookingId,
    amount,
    amountOverrideReason: input.amountOverrideReason || null,
    actorId: actor.userId,
  })

  if (!recorded.ok) {
    if (recorded.error.code === 'reason_required') {
      return {
        status: 'error',
        message: recorded.error.message,
        fieldErrors: { amountOverrideReason: 'This is not what is outstanding. Say why.' },
        submitted: echo,
      }
    }

    return { status: 'error', message: recorded.error.message, submitted: echo }
  }

  revalidateBooking(booking.reference)
  // Cash settles now, so the accounting record is written now (capability
  // G5). The transfer branch above schedules nothing: a promised transfer is
  // not money until somebody has checked the bank, and verifying it is where
  // the pack gets assembled.
  scheduleAccountingPack(booking.id)

  return { status: 'done', recorded: { method: 'cash', amount } }
}

/**
 * Every screen a payment changes.
 *
 * The queue and the dashboard counter both move when a transfer is raised, and
 * the register's own list carries nothing about money — but the booking's
 * detail screen and the cash log do, so all four are rebuilt rather than
 * guessing which one the clerk will look at next.
 */
function revalidateBooking(reference: string): void {
  revalidatePath(`/portal/bookings/${reference}`)
  revalidatePath('/portal/payments')
  revalidatePath('/portal/payments/cash')
  revalidatePath('/portal')
}

/**
 * The id of the booking's newest live accounting pack, or null.
 *
 * Not a mutation: this is what the booking screen polls after a payment is
 * verified, so the pack can appear the moment `after()` has filed it rather
 * than on the next refresh (see accounting-pack.tsx). It is gated exactly as
 * the screen is — `booking.view` — and answers with an id and nothing else,
 * because the caller already holds everything a pack row shows and re-renders
 * the route to get the new one.
 */
export async function latestAccountingPackIdAction(bookingId: string): Promise<string | null> {
  await requirePermission('booking.view')

  const packs = await listDocumentsForBooking(bookingId, 'accounting_pack')

  return packs.at(-1)?.id ?? null
}
