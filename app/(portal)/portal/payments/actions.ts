'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { verifyDeposit } from '@/lib/db/deposits'
import { getPaymentById, verifyPayment } from '@/lib/db/payments'
import { centsFromInput } from '@/lib/domain/money'
import { checkMatchReason, checkPaymentMatch, matchKindFor } from '@/lib/domain/payment-match'

import { scheduleBookingConfirmedEmail } from '@/app/schedule-booking-email'

import { scheduleAccountingPack } from '../schedule-accounting-pack'

/**
 * Confirming a payment, and confirming a promised deposit (capabilities B5,
 * B6 and B16).
 *
 * prd.md §10.4 requires a match on amount as well as reference, and
 * architecture.md §6.2 tightens that: "a mismatched amount can only be
 * confirmed through an explicit override that records a reason."
 *
 * **One action per kind of money, not one per kind of match.** §10.4's escape
 * hatch used to be a second action behind a second dialog, which asked a clerk
 * to declare before opening their bank app whether the reference would be
 * there. It is `matchKindFor` now: the kind is read off what the bank showed,
 * and the hatch is the note that becomes required when it showed nothing.
 *
 * Both actions re-run `checkPaymentMatch` server-side against the amount due
 * **now**, read from the database rather than taken from the form. The dialog
 * runs the same function to decide when to reveal its fields, but that copy is
 * display only — a booking repriced while the dialog sat open would otherwise
 * be confirmed against a figure that is no longer owed.
 *
 * What these deliberately do NOT do: calculate a refund, a forfeiture or a
 * balance. prd.md §18 N5 is open, and §9.6 records that this system states
 * differences rather than moving money.
 */

const amount = z
  .string()
  .trim()
  .min(1, 'Enter the amount received.')
  .refine((value) => centsFromInput(value) !== null, 'Enter an amount like 442.00.')

const reason = z.string().trim().max(280).optional()

const verifySchema = z.object({
  paymentId: z.string().min(1),
  amount,
  observedReference: z.string().trim().max(60).optional(),
  amountOverrideReason: reason,
  // Optional here and required by `checkPaymentMatch` below, because whether
  // it is required depends on another field — a clerk who cleared the
  // reference owes a note, and one who did not owes nothing. A schema-level
  // `min(1)` would refuse the ordinary case.
  matchReason: reason,
})

export interface PaymentActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
  /**
   * What the verification did to the booking, so the toast tells the truth:
   * a deposit confirms it; a payment confirms it only where nothing else is
   * quoted to, and otherwise settles money against a booking still waiting.
   */
  done?: {
    kind: 'payment' | 'deposit'
    confirmed: boolean
    /** The booking is confirmed once its deposit is — not by this. */
    awaitingDeposit: boolean
  }
  /**
   * What was typed, echoed back so a refusal does not empty the form.
   *
   * React resets an uncontrolled field once its form action resolves. Without
   * this, a clerk who is asked for a reason loses the observations they just
   * transcribed off a bank statement — which is the one thing in this dialog
   * that is genuinely tedious to re-enter.
   */
  submitted?: Record<string, string>
}

export async function verifyPaymentAction(
  _previous: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  // architecture.md §4: every mutation passes the permission check first.
  const actor = await requirePermission('payment.verify')
  const parsed = verifySchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fields(parsed),
    }
  }

  const input = parsed.data
  const observed = centsFromInput(input.amount)!
  const payment = await getPaymentById(input.paymentId)

  if (!payment) {
    return { status: 'error', message: 'That payment no longer exists.', submitted: echo(formData) }
  }

  // Read off the statement rather than chosen: a blank reference field is a
  // clerk saying the bank quoted nothing, which is what makes this a hand
  // match and what makes the note below the only identifying record.
  const matchKind = matchKindFor(input.observedReference ?? null)

  // Matched against what is due now, read fresh. The form's figure is never
  // trusted, the same way the booking form's submitted total never is.
  const match = checkPaymentMatch({
    dueCents: payment.due,
    observedCents: observed,
    match: matchKind,
    amountOverrideReason: input.amountOverrideReason ?? null,
    matchReason: input.matchReason ?? null,
  })

  if (!match.ok) {
    return {
      status: 'error',
      message: match.error.message,
      fieldErrors: { [match.error.field]: match.error.message },
      submitted: echo(formData),
    }
  }

  const result = await verifyPayment({
    paymentId: input.paymentId,
    observedAmount: observed,
    match: matchKind,
    observedReference: input.observedReference || null,
    amountOverrideReason: input.amountOverrideReason || null,
    matchReason: input.matchReason || null,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message, submitted: echo(formData) }
  }

  revalidateAfterPayment(result.payment.bookingReference)
  // Money is verified, so the booking has an accounting record to write
  // (capability G5). After the response, and never a reason to refuse.
  scheduleAccountingPack(result.payment.bookingId)

  // Only when this verification is what confirmed the booking (capability A8).
  // A top-up against a booking already confirmed moves nothing, and the guest
  // had their confirmation the first time; a payment against a booking still
  // waiting on its deposit moves nothing either, and the deposit's own
  // verification sends the email.
  if (result.confirmedNow) {
    scheduleBookingConfirmedEmail(result.payment.bookingId)
  }

  return {
    status: 'done',
    done: {
      kind: 'payment',
      confirmed: result.confirmedNow,
      awaitingDeposit: result.awaitingDeposit,
    },
  }
}

/**
 * A confirmed payment changes the queue, the booking, the bookings list and
 * the dashboard's awaiting-payment count. All four are server rendered.
 */
function revalidateAfterPayment(reference: string): void {
  revalidatePath('/portal/payments')
  revalidatePath('/portal/payments/cash')
  revalidatePath(`/portal/bookings/${reference}`)
  revalidatePath('/portal/bookings')
  revalidatePath('/portal')
}

/** The raw form values, for re-filling a refused form. */
function echo(formData: FormData): Record<string, string> {
  const submitted: Record<string, string> = {}

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      submitted[key] = value
    }
  }

  return submitted
}

function fields(parsed: { error: z.ZodError }): Record<string, string> {
  const fieldErrors: Record<string, string> = {}

  for (const issue of parsed.error.issues) {
    const field = issue.path[0]

    if (typeof field === 'string' && !fieldErrors[field]) {
      fieldErrors[field] = issue.message
    }
  }

  return fieldErrors
}

/**
 * Confirming that a promised security deposit arrived (capability B16).
 *
 * The same permission as a payment, and deliberately no new string: prd.md §4
 * mints one for a *job*, and this is the same job — somebody opening a bank
 * app and saying what they saw. It is the position §10.7 and §13 already took
 * for recording a transfer and for rebuilding an accounting pack.
 *
 * **No accounting pack is scheduled.** A pack is assembled when money is
 * verified against a booking (capability G5), and a deposit is not money
 * against the booking: it settles nothing and leaves the stay owed in full.
 * The pack arrives when the stay itself is paid, on arrival.
 */
export async function verifyDepositAction(
  _previous: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requirePermission('payment.verify')
  const parsed = verifyDepositSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fields(parsed),
    }
  }

  const input = parsed.data
  const observed = centsFromInput(input.amount)

  if (observed === null) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: { amount: 'Enter the amount that arrived.' },
      submitted: echo(formData),
    }
  }

  // Derived from the statement exactly as a payment's is, and checked here
  // before the write for the same reason the amount is: the database refuses
  // a manual match with no reason, and a refusal that reaches the clerk as a
  // field error is one they can act on.
  const matchKind = matchKindFor(input.observedReference ?? null)

  // The match half alone. The deposit's amount rule is enforced under the row
  // lock against the quote read fresh, so there is no figure to check here.
  const matchError = checkMatchReason(matchKind, input.matchReason ?? null)

  if (matchError) {
    return {
      status: 'error',
      message: matchError.message,
      fieldErrors: { [matchError.field]: matchError.message },
      submitted: echo(formData),
    }
  }

  // The amount rule is enforced under the row lock in `verify_deposit()`,
  // against the figure the booking quotes rather than against anything this
  // form carried. What comes back is the sentence a clerk acts on.
  const result = await verifyDeposit({
    depositId: input.depositId,
    observedAmount: observed,
    match: matchKind,
    observedReference: input.observedReference || null,
    overrideReason: input.amountOverrideReason || null,
    matchReason: input.matchReason || null,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error.message,
      fieldErrors:
        result.error.code === 'reason_required'
          ? { amountOverrideReason: result.error.message }
          : result.error.code === 'match_reason_required'
            ? { matchReason: result.error.message }
            : undefined,
      submitted: echo(formData),
    }
  }

  revalidatePath('/portal/payments')
  revalidatePath('/portal/deposits')
  revalidatePath('/portal/bookings')
  revalidatePath('/portal')

  // The deposit is what secures the booking, so this is the moment it becomes
  // confirmed (capabilities A8 and B16) — whether the guest booked online or
  // the desk raised the promise for them.
  if (result.confirmedNow) {
    scheduleBookingConfirmedEmail(result.bookingId)
  }

  return {
    status: 'done',
    done: { kind: 'deposit', confirmed: result.confirmedNow, awaitingDeposit: false },
  }
}

const verifyDepositSchema = z.object({
  depositId: z.string().min(1),
  amount: z.string().min(1, 'Enter the amount that arrived.'),
  observedReference: z.string().trim().max(140).optional(),
  amountOverrideReason: z.string().max(280).optional(),
  // Conditionally required, so the schema cannot be the thing that requires
  // it — see `verifySchema` above.
  matchReason: reason,
})
