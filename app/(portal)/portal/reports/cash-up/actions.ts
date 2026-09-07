'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { recordCashBanking } from '@/lib/db/cash-banking'
import { isStayDate } from '@/lib/domain/dates'
import { centsFromInput } from '@/lib/domain/money'

/**
 * Recording that a day's cash reached the bank (capability E4, prd.md §10.5).
 *
 * ── The permission is `payment.verify`, and that is an [A] ────────────────
 *
 * prd.md §4 names no permission for banking, and §10.5's own [A] reads
 * "verified by Finance" as the cash-up rather than as a per-payment sign-off —
 * so whoever may verify that money arrived is whoever may say it reached the
 * bank. It mints no new string, which is the position §10.7 took for recording
 * a transfer and §13 took for rebuilding an accounting pack. Raised as N26.
 *
 * Who and when are the acting user and now, exactly as recording cash has it.
 * What the person *chooses* is the business day the money belongs to, because
 * an evening's takings are walked to the bank the next morning and filing them
 * under the morning would leave every day short and the next day over.
 *
 * There is no edit and no delete, here or anywhere: a correction is a second
 * entry (lib/db/cash-banking.ts).
 */

const recordBankingSchema = z.object({
  businessDate: z
    .string()
    .trim()
    .min(1, 'Pick the day the cash was taken.')
    .refine(isStayDate, 'Pick a day from the calendar.'),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter how much went to the bank.')
    .refine((value) => centsFromInput(value) !== null, 'Enter an amount like 442.00.'),
  note: z.string().trim().max(280).optional(),
  /** The day whose screen this was submitted from, so it can be revalidated. */
  viewing: z.string().trim().optional(),
})

export interface RecordBankingState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
  recorded?: { businessDate: string; amount: number }
  /** What was typed, echoed back so a refusal does not empty the form. */
  submitted?: { businessDate: string; amount: string; note: string }
}

export async function recordBankingAction(
  _previous: RecordBankingState,
  formData: FormData,
): Promise<RecordBankingState> {
  const actor = await requirePermission('payment.verify')
  const parsed = recordBankingSchema.safeParse(Object.fromEntries(formData))

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

  const result = await recordCashBanking({
    businessDate: input.businessDate,
    amount,
    note: input.note || null,
    actorId: actor.userId,
  })

  if (!result.ok) {
    // The database owns these refusals — it is the only party that can say
    // what "today" is in the property's timezone — so the message it returns
    // is put on the field it is about rather than reworded here.
    const field =
      result.error.code === 'future_date' || result.error.code === 'date_required'
        ? 'businessDate'
        : 'amount'

    return {
      status: 'error',
      message: result.error.message,
      fieldErrors:
        result.error.code === 'not_found' ? undefined : { [field]: result.error.message },
      submitted: echo(formData),
    }
  }

  revalidatePath('/portal/reports/cash-up')
  revalidatePath(`/portal/reports/cash-up/${input.businessDate}`)

  // The day being looked at, when it is not the day being banked: somebody
  // reading Tuesday and filing Monday's takings should see Tuesday's own
  // figures settle too, since the strip above them is a window total.
  if (input.viewing && isStayDate(input.viewing) && input.viewing !== input.businessDate) {
    revalidatePath(`/portal/reports/cash-up/${input.viewing}`)
  }

  return { status: 'done', recorded: { businessDate: input.businessDate, amount } }
}

/** The raw form values, for re-filling a refused form. */
function echo(formData: FormData): { businessDate: string; amount: string; note: string } {
  return {
    businessDate: String(formData.get('businessDate') ?? ''),
    amount: String(formData.get('amount') ?? ''),
    note: String(formData.get('note') ?? ''),
  }
}
