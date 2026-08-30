'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getPaymentById, verifyPayment } from '@/lib/db/payments'
import { isStayDate } from '@/lib/domain/dates'
import { centsFromInput } from '@/lib/domain/money'
import { checkPaymentMatch } from '@/lib/domain/payment-match'

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
    return { status: 'error', message: 'That payment no longer exists.' }
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
    return { status: 'error', message: result.error.message }
  }

  revalidateAfterPayment(result.payment.bookingReference)

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
    return { status: 'error', message: 'That payment no longer exists.' }
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
    return { status: 'error', message: result.error.message }
  }

  revalidateAfterPayment(result.payment.bookingReference)

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
