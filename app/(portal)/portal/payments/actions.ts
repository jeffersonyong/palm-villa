'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { verifyDeposit } from '@/lib/db/deposits'
import { getPaymentById, verifyPayment } from '@/lib/db/payments'
import { isStayDate } from '@/lib/domain/dates'
import { centsFromInput } from '@/lib/domain/money'
import { checkPaymentMatch } from '@/lib/domain/payment-match'

import { scheduleBookingConfirmedEmail } from '@/app/schedule-booking-email'

import { scheduleAccountingPack } from '../schedule-accounting-pack'

/**
 * Confirming a payment, and matching one by hand (capabilities B5 and B6).
 *
 * prd.md §10.4 requires a match on amount as well as reference, and
 * architecture.md §6.2 tightens that: "a mismatched amount can only be
 * confirmed through an explicit override that records a reason."
 *
 * Both actions re-run `checkPaymentMatch` server-side against the amount due
 * **now**, read from the database rather than taken from the form. The dialog
 * runs the same function to decide when to reveal its reason field, but that
 * copy is display only — a booking repriced while the dialog sat open would
 * otherwise be confirmed against a figure that is no longer owed.
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
})

const manualMatchSchema = z.object({
  paymentId: z.string().min(1),
  amount,
  observedSender: z.string().trim().min(1, 'Enter the sender as the bank shows them.').max(120),
  observedOn: z.string().refine(isStayDate, 'Enter the date the payment appeared.'),
  observedReference: z.string().trim().max(60).optional(),
  matchReason: z.string().trim().min(1, 'Say why this payment belongs to this booking.').max(280),
  amountOverrideReason: reason,
})

export interface PaymentActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
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

  // Matched against what is due now, read fresh. The form's figure is never
  // trusted, the same way the booking form's submitted total never is.
  const match = checkPaymentMatch({
    dueCents: payment.due,
    observedCents: observed,
    match: 'reference',
    amountOverrideReason: input.amountOverrideReason ?? null,
    matchReason: null,
  })

  if (!match.ok) {
    return {
      status: 'error',
      message: match.error.message,
      fieldErrors: { amountOverrideReason: match.error.message },
      submitted: echo(formData),
    }
  }

  const result = await verifyPayment({
    paymentId: input.paymentId,
    observedAmount: observed,
    match: 'reference',
    observedReference: input.observedReference || null,
    amountOverrideReason: input.amountOverrideReason || null,
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
  // had their confirmation the first time.
  if (result.confirmedNow) {
    scheduleBookingConfirmedEmail(result.payment.bookingId)
  }

  return { status: 'done' }
}

export async function matchPaymentManuallyAction(
  _previous: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requirePermission('payment.verify')
  const parsed = manualMatchSchema.safeParse(Object.fromEntries(formData))

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

  const match = checkPaymentMatch({
    dueCents: payment.due,
    observedCents: observed,
    match: 'manual',
    amountOverrideReason: input.amountOverrideReason ?? null,
    matchReason: input.matchReason,
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
    match: 'manual',
    observedReference: input.observedReference || null,
    observedSender: input.observedSender,
    observedOn: input.observedOn,
    amountOverrideReason: input.amountOverrideReason || null,
    matchReason: input.matchReason,
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
  // had their confirmation the first time.
  if (result.confirmedNow) {
    scheduleBookingConfirmedEmail(result.payment.bookingId)
  }

  return { status: 'done' }
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

  // The amount rule is enforced under the row lock in `verify_deposit()`,
  // against the figure the booking quotes rather than against anything this
  // form carried. What comes back is the sentence a clerk acts on.
  const result = await verifyDeposit({
    depositId: input.depositId,
    observedAmount: observed,
    observedReference: input.observedReference || null,
    overrideReason: input.amountOverrideReason || null,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error.message,
      fieldErrors:
        result.error.code === 'reason_required'
          ? { amountOverrideReason: result.error.message }
          : undefined,
      submitted: echo(formData),
    }
  }

  revalidatePath('/portal/payments')
  revalidatePath('/portal/deposits')
  revalidatePath('/portal/bookings')
  revalidatePath('/portal')

  // The deposit is what secures the booking, so this is the moment it becomes
  // confirmed for a customer who booked online (capabilities A8 and B16).
  if (result.confirmedNow) {
    scheduleBookingConfirmedEmail(result.bookingId)
  }

  return { status: 'done' }
}

const verifyDepositSchema = z.object({
  depositId: z.string().min(1),
  amount: z.string().min(1, 'Enter the amount that arrived.'),
  observedReference: z.string().max(140).optional(),
  amountOverrideReason: z.string().max(280).optional(),
})
