'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getBookingByReference } from '@/lib/db/bookings'
import { recordCashPayment } from '@/lib/db/payments'
import { centsFromInput } from '@/lib/domain/money'

/**
 * Recording cash collected against a booking (capability B7).
 *
 * prd.md §10.5: "record who collected, when, and against which booking."
 *
 * Who and when are the acting user and now, not fields — the dialog says so.
 * The columns carry another answer without a migration, so back-dating or
 * recording on a colleague's behalf is a form change later rather than a
 * schema one. Recorded as an [A] in prd.md §10.5.
 *
 * What this does NOT do: calculate a balance, or reconcile against banked
 * cash. The daily cash-up is capability E4 and its own screen.
 */

const recordCashSchema = z.object({
  reference: z.string().trim().min(1, 'Enter the booking reference.').max(20),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter the amount collected.')
    .refine((value) => centsFromInput(value) !== null, 'Enter an amount like 442.00.'),
  amountOverrideReason: z.string().trim().max(280).optional(),
})

export interface RecordCashState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
  recorded?: { reference: string; amount: number }
}

export async function recordCashAction(
  _previous: RecordCashState,
  formData: FormData,
): Promise<RecordCashState> {
  const actor = await requirePermission('payment.record_cash')
  const parsed = recordCashSchema.safeParse(Object.fromEntries(formData))

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
  const amount = centsFromInput(input.amount)!

  // Typed rather than picked from a list: the reference is the one string
  // staff already have in hand, off a printout or the guest's phone.
  // `getBookingByReference` normalises case and whitespace for exactly this.
  const booking = await getBookingByReference(input.reference)

  if (!booking) {
    return {
      status: 'error',
      message: `No booking found with reference ${input.reference.toUpperCase()}.`,
      fieldErrors: { reference: 'Check the reference and try again.' },
    }
  }

  const result = await recordCashPayment({
    bookingId: booking.id,
    amount,
    amountOverrideReason: input.amountOverrideReason || null,
    actorId: actor.userId,
  })

  if (!result.ok) {
    if (result.error.code === 'reason_required') {
      return {
        status: 'error',
        message: result.error.message,
        fieldErrors: {
          amountOverrideReason: 'This is not the amount due. Say why.',
        },
      }
    }

    return { status: 'error', message: result.error.message }
  }

  revalidatePath('/portal/payments/cash')
  revalidatePath('/portal/payments')
  revalidatePath(`/portal/bookings/${booking.reference}`)
  revalidatePath('/portal/bookings')
  revalidatePath('/portal')

  return {
    status: 'done',
    recorded: { reference: booking.reference, amount },
  }
}
