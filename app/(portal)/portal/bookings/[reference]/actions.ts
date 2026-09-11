'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getBookingById, transitionBooking } from '@/lib/db/bookings'
import { listDocumentsForBooking } from '@/lib/db/documents'
import { recordBookingDeposit, topUpBookingDeposit } from '@/lib/db/deposits'
import { addBookingNote } from '@/lib/db/notes'
import { assembleAccountingPack } from '@/lib/db/packs'
import { recordCashPayment, recordTransferPayment } from '@/lib/db/payments'
import { centsFromInput } from '@/lib/domain/money'
import type { PaymentMethod } from '@/lib/domain/payment'
import { isNoteAudience, MAX_NOTE_LENGTH } from '@/lib/domain/note'

import { scheduleBookingConfirmedEmail } from '@/app/schedule-booking-email'

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
 * still open. Since 10 September 2026 the BND 100 security deposit is taken at
 * booking (§9.1), so a guest who cancels usually *has* paid it — which makes
 * the question sharper rather than answered, because forfeiting it is money
 * moving and nothing here moves money. Computing either here would resolve an open question silently,
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
    /**
     * Cash settled the stay against a booking still waiting on its deposit,
     * which is what confirms it — so the toast says the booking is not yet.
     */
    awaitingDeposit: boolean
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

    return {
      status: 'done',
      recorded: { method: 'bank_transfer', amount: null, awaitingDeposit: false },
    }
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

  // And the same test for the confirmation email (capability A8): the guest
  // hears once, when the booking actually becomes confirmed — which, for a
  // booking quoting a deposit, is when the deposit is taken, not here.
  if (recorded.confirmedNow) {
    scheduleBookingConfirmedEmail(booking.id)
  }

  return {
    status: 'done',
    recorded: { method: 'cash', amount, awaitingDeposit: recorded.awaitingDeposit },
  }
}

const recordDepositSchema = z.object({
  bookingId: z.string().min(1),
  method: z.enum(['cash', 'bank_transfer']),
})

export interface RecordDepositState {
  status: 'idle' | 'error' | 'done'
  message?: string
  recorded?: { method: PaymentMethod; amount: number; confirmed: boolean }
}

/**
 * Taking the security deposit at the desk (capability B16, staff half).
 *
 * ── The permission ────────────────────────────────────────────────────────
 *
 * **[A] `payment.record_cash`** — the same string that records a booking
 * payment, and no new one. prd.md §11 already took this position twice: a
 * deposit is verified under `payment.verify` because it is the same job as
 * verifying a payment, and the excess above a deposit is settled by whoever
 * may record a payment. Taking money at the counter is that job; minting
 * `deposit.collect` would be a third string for one act and another row in a
 * matrix the client has to understand.
 *
 * ── What it does not do ───────────────────────────────────────────────────
 *
 * **No email.** prd.md §11 is explicit that a customer hears twice about a
 * booking and never a third time, and the booking form promises it as they
 * type. Cash taken here confirms the booking, so the confirmation email — the
 * second of the two — is scheduled; a promised transfer sends nothing, because
 * the guest is told when somebody has actually seen the money.
 *
 * **No accounting pack.** A pack is assembled when money is verified against
 * the booking (capability G5) and a deposit settles nothing: the stay is still
 * owed in full on arrival. The same position `verifyDepositAction` takes.
 */
export async function recordDepositAction(
  _previous: RecordDepositState,
  formData: FormData,
): Promise<RecordDepositState> {
  const actor = await requirePermission('payment.record_cash')
  const parsed = recordDepositSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return { status: 'error', message: 'Choose how the deposit was taken.' }
  }

  const booking = await getBookingById(parsed.data.bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  // The amount is the booking's quoted figure, read under the row lock in
  // SQL — never anything this form carried.
  const result = await recordBookingDeposit({
    bookingId: parsed.data.bookingId,
    method: parsed.data.method,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidateBooking(booking.reference)
  // A promised deposit is now in the verification queue, and a collected one
  // is on the ledger. Neither screen is the one the clerk is standing on.
  revalidatePath('/portal/deposits')

  if (result.confirmedNow) {
    scheduleBookingConfirmedEmail(booking.id)
  }

  return {
    status: 'done',
    recorded: {
      method: parsed.data.method,
      amount: result.amount,
      confirmed: result.confirmedNow,
    },
  }
}

const topUpDepositSchema = z.object({
  bookingId: z.string().min(1),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter the amount that arrived.')
    .refine((value) => centsFromInput(value) !== null, 'Enter an amount like 50.00.'),
  method: z.enum(['cash', 'bank_transfer']),
})

export interface TopUpDepositState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
  toppedUp?: { added: number; amount: number; shortfall: number; confirmed: boolean }
}

/**
 * The rest of a deposit that arrived short (capability B16; prd.md §11).
 *
 * `payment.record_cash`, the same string as recording the deposit in the first
 * place and for the reason that one gives: taking money at the counter is one
 * job, and a second string for the second half of the same deposit would be a
 * row in the permission matrix nobody could explain to the client.
 *
 * **The email is scheduled only where this is what confirmed the booking**,
 * which is `confirmedNow` from the function rather than anything computed
 * here: a top-up that leaves the deposit still short moves nothing and the
 * guest hears nothing. That keeps prd.md §11's promise that a customer hears
 * about a booking exactly twice.
 *
 * **No accounting pack**, the position every deposit action takes: a deposit
 * settles nothing and the stay is still owed in full on arrival.
 */
export async function topUpDepositAction(
  _previous: TopUpDepositState,
  formData: FormData,
): Promise<TopUpDepositState> {
  const actor = await requirePermission('payment.record_cash')
  const parsed = topUpDepositSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: { amount: parsed.error.issues[0]?.message ?? 'Enter the amount that arrived.' },
    }
  }

  const booking = await getBookingById(parsed.data.bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  const result = await topUpBookingDeposit({
    bookingId: parsed.data.bookingId,
    amount: centsFromInput(parsed.data.amount)!,
    method: parsed.data.method,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error.message,
      fieldErrors:
        result.error.code === 'exceeds_shortfall' || result.error.code === 'invalid_amount'
          ? { amount: result.error.message }
          : undefined,
    }
  }

  revalidateBooking(booking.reference)
  // The ledger's held total and the deposit's own screen both move, and a
  // completed deposit changes what the cash-up says about the drawer.
  revalidatePath('/portal/deposits')
  revalidatePath(`/portal/deposits/${booking.reference}`)
  revalidatePath('/portal/reports/cash-up')

  if (result.confirmedNow) {
    scheduleBookingConfirmedEmail(booking.id)
  }

  return {
    status: 'done',
    toppedUp: {
      added: centsFromInput(parsed.data.amount)!,
      amount: result.amount,
      shortfall: result.shortfall,
      confirmed: result.confirmedNow,
    },
  }
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

/**
 * Rebuilding the accounting pack on demand (capability G5).
 *
 * ── Why a button exists at all ────────────────────────────────────────────
 *
 * A pack is assembled the moment a payment is verified, and rebuilt by the
 * nightly job for everything else that changes what it records — a slip
 * attached afterwards, an IC that turned up late, a booking amended. That is
 * correct and it is also a wait: the desk can see the pack is behind and has
 * no way to say "now". This is that way.
 *
 * ── The permission ────────────────────────────────────────────────────────
 *
 * **[A] `payment.verify`** — Admin, Front Office and Finance. Verifying a
 * payment is what builds a pack automatically, so whoever may cause the build
 * may ask for it again; Front Office is also the desk that attaches the late
 * slip, which is what puts the pack behind in the first place. It mints no new
 * permission string, which is the position prd.md §10.7 already took. Housekeeping
 * and Security hold `booking.view` and see no button. Put to the client as
 * [N25](docs/open-questions.md).
 *
 * ── Why this awaits rather than scheduling ────────────────────────────────
 *
 * `scheduleAccountingPack` hands the work to `after()` so a clerk verifying a
 * payment is not kept waiting on a PDF. Here the PDF *is* what was asked for,
 * so it is awaited and the answer is the truth about it: the screen shows the
 * new pack when this returns, rather than polling for a file and hoping.
 *
 * A refusal is not a failure worth alarming anybody with. `superseded_by_newer`
 * means the nightly job got there first — the pack is current, which is what
 * the clicker wanted.
 */
export async function rebuildAccountingPackAction(
  bookingId: string,
): Promise<{ status: 'done' | 'error'; message?: string }> {
  await requirePermission('payment.verify')

  const booking = await getBookingById(bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  const result = await assembleAccountingPack({ bookingId })

  revalidateBooking(booking.reference)

  if (result.ok || result.reason === 'superseded_by_newer') {
    return { status: 'done' }
  }

  if (result.reason === 'no_verified_payment') {
    return {
      status: 'error',
      message: 'There is no verified payment on this booking, so there is no pack to assemble.',
    }
  }

  return { status: 'error', message: 'The pack could not be rebuilt. Try again in a moment.' }
}
