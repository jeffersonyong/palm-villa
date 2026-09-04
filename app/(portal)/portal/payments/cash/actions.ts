'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getBookingByReference } from '@/lib/db/bookings'
import { recordCashPayment } from '@/lib/db/payments'
import { centsFromInput } from '@/lib/domain/money'

import { scheduleAccountingPack } from '../../schedule-accounting-pack'

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
 * The amount is matched against what the booking still OWES rather than
 * against its total (capability B13). For a booking nobody has paid the two
 * are the same figure, which is every payment this screen took before the
 * balance existed; they part company when cash settles the difference an
 * amendment created, which used to demand a written override for the ordinary
 * case.
 *
 * What this still does NOT do: reconcile against banked cash. The daily
 * cash-up is capability E4 and its own screen.
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
  /**
   * What was typed, echoed back so a refusal does not empty the form.
   *
   * React resets an uncontrolled field once its form action resolves, so
   * without this a clerk who is asked to justify an amount loses both the
   * reference and the figure they just entered — and retyping the amount
   * slightly differently would make the reason describe a discrepancy that no
   * longer exists.
   */
  submitted?: { reference: string; amount: string; amountOverrideReason: string }
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

    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors,
      submitted: echo(formData),
    }
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
      submitted: echo(formData),
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
          amountOverrideReason: 'This is not what the booking still owes. Say why.',
        },
        submitted: echo(formData),
      }
    }

    return { status: 'error', message: result.error.message, submitted: echo(formData) }
  }

  revalidatePath('/portal/payments/cash')
  revalidatePath('/portal/payments')
  revalidatePath(`/portal/bookings/${booking.reference}`)
  revalidatePath('/portal/bookings')
  revalidatePath('/portal')
  // Cash is born verified, so the accounting record can be written now
  // (capability G5). After the response.
  scheduleAccountingPack(booking.id)

  return {
    status: 'done',
    recorded: { reference: booking.reference, amount },
  }
}

/** The raw form values, for re-filling a refused form. */
function echo(formData: FormData): {
  reference: string
  amount: string
  amountOverrideReason: string
} {
  return {
    reference: String(formData.get('reference') ?? ''),
    amount: String(formData.get('amount') ?? ''),
    amountOverrideReason: String(formData.get('amountOverrideReason') ?? ''),
  }
}
