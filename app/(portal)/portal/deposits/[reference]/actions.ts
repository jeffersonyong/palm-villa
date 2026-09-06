'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { addDepositCharge, waiveDepositCharge } from '@/lib/db/deposit-charges'
import { approveDepositRelease, settleDepositOwed } from '@/lib/db/deposits'
import { recordInspection } from '@/lib/db/inspections'
import {
  MAX_CHARGE_REASON_LENGTH,
  MAX_RELEASE_NOTE_LENGTH,
  MAX_WAIVE_REASON_LENGTH,
} from '@/lib/domain/deposit'
import {
  checkInspectionNotes,
  isInspectionOutcome,
  MAX_INSPECTION_NOTES_LENGTH,
  type InspectionOutcome,
} from '@/lib/domain/inspection'
import { centsFromInput, type Cents } from '@/lib/domain/money'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/domain/payment'

/**
 * Everything that can be done to a deposit (capabilities E2 and E3).
 *
 * Five actions behind four permissions, which is the point rather than an
 * accident of design. prd.md §4 [C] separates them on purpose: "Deposit release
 * approval sits at the end of the pipeline, with Finance or Jason, not with
 * Housekeeping or Front Office. Housekeeping records the inspection; a separate
 * role approves." So one screen carries actions three different people can
 * take, and each checks its own permission rather than the screen checking one
 * on their behalf.
 *
 * | Action | Permission | Held by |
 * |---|---|---|
 * | Record an inspection | `inspection.record` | Housekeeping, Admin |
 * | Add a charge | `charge.create` | Front Office, Admin |
 * | Waive a charge | `charge.waive` | Finance, Admin |
 * | Approve a release | `deposit.approve_release` | Finance, Admin |
 * | Record the excess as settled | `payment.record_cash` | Front Office, Admin |
 *
 * The last is **[A]** and worth stating: recovering an amount a guest owes is
 * not a booking payment — it settles no booking and belongs in no cash-up — but
 * whoever may say that money arrived is the same person either way, and minting
 * a permission string the client has never been asked about is what prd.md
 * §10.7 already declined to do. Added to N11 with the rest.
 *
 * ── What none of them do ──────────────────────────────────────────────────
 *
 * Move money. An approval records who signed off what, and a settlement
 * records that the guest paid; the notes and the transfer happen in the world.
 * That is prd.md §11 requirement 5 read literally, and it is what keeps this
 * independent of N5.
 */

export interface DepositActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
  /**
   * What was refused, echoed back so the form can be re-filled. React empties
   * an uncontrolled field as soon as an action returns, and a clerk who typed
   * a reason should not lose it to a refusal about something else.
   */
  submitted?: Record<string, string>
  /** The figures an approval produced, so the toast can state them. */
  released?: { releasedAmount: Cents; owed: Cents }
  /**
   * The inspection this call just wrote.
   *
   * Returned because a photograph hangs off an `inspection_id`, so the dialog
   * cannot send one until it knows which inspection it is attaching to. This
   * is what lets recording and photographing be one step for the person doing
   * them while staying two writes underneath — see record-inspection.tsx.
   */
  inspectionId?: string
}

/* ── Recording an inspection ──────────────────────────────────────────────── */

const inspectionSchema = z.object({
  bookingId: z.string().uuid(),
  reference: z.string().min(1),
  outcome: z.string().refine(isInspectionOutcome, 'Choose how the unit was found.'),
  notes: z
    .string()
    .trim()
    .max(
      MAX_INSPECTION_NOTES_LENGTH,
      `Keep the notes under ${MAX_INSPECTION_NOTES_LENGTH.toLocaleString('en-GB')} characters.`,
    )
    .default(''),
})

export async function recordInspectionAction(
  _previous: DepositActionState,
  formData: FormData,
): Promise<DepositActionState> {
  const actor = await requirePermission('inspection.record')
  const parsed = inspectionSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsOf(parsed.error),
      submitted: echo(formData),
    }
  }

  const { bookingId, reference, outcome, notes } = parsed.data

  // The rule lives in lib/domain so the dialog and this agree about it, and
  // the database refuses last. Notes are required when something was found:
  // an inspection that says something is wrong without saying what cannot
  // support the charge that follows it.
  const check = checkInspectionNotes(outcome as InspectionOutcome, notes)

  if (!check.ok) {
    return {
      status: 'error',
      message: check.error.message,
      fieldErrors: { notes: check.error.message },
      submitted: echo(formData),
    }
  }

  const result = await recordInspection({
    bookingId,
    outcome: outcome as InspectionOutcome,
    notes: notes.length > 0 ? notes : null,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message, submitted: echo(formData) }
  }

  revalidateDepositScreens(reference)

  return { status: 'done', inspectionId: result.inspectionId }
}

/* ── Charges ──────────────────────────────────────────────────────────────── */

const addChargeSchema = z.object({
  depositId: z.string().uuid(),
  reference: z.string().min(1),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount.')
    .refine((value) => {
      const cents = centsFromInput(value)

      return cents !== null && cents > 0
    }, 'Enter an amount in dollars and cents, like 25.00.'),
  reason: z
    .string()
    .trim()
    .min(3, 'Say what this charge is for.')
    .max(MAX_CHARGE_REASON_LENGTH, `Keep the reason under ${MAX_CHARGE_REASON_LENGTH} characters.`),
})

export async function addChargeAction(
  _previous: DepositActionState,
  formData: FormData,
): Promise<DepositActionState> {
  const actor = await requirePermission('charge.create')
  const parsed = addChargeSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsOf(parsed.error),
      submitted: echo(formData),
    }
  }

  const { depositId, reference, amount, reason } = parsed.data
  // Non-null: the schema refused anything `centsFromInput` cannot read.
  const cents = centsFromInput(amount)!

  const result = await addDepositCharge({ depositId, amount: cents, reason, actorId: actor.userId })

  if (!result.ok) {
    return { status: 'error', message: result.error.message, submitted: echo(formData) }
  }

  revalidateDepositScreens(reference)

  return { status: 'done' }
}

const waiveChargeSchema = z.object({
  chargeId: z.string().uuid(),
  reference: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, 'Say why this charge is being dropped.')
    .max(MAX_WAIVE_REASON_LENGTH, `Keep the reason under ${MAX_WAIVE_REASON_LENGTH} characters.`),
})

export async function waiveChargeAction(
  _previous: DepositActionState,
  formData: FormData,
): Promise<DepositActionState> {
  // A different permission from adding one, and deliberately: raising a charge
  // is an operational act at the desk, dropping one is giving money back.
  const actor = await requirePermission('charge.waive')
  const parsed = waiveChargeSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsOf(parsed.error),
      submitted: echo(formData),
    }
  }

  const { chargeId, reference, reason } = parsed.data

  const result = await waiveDepositCharge({ chargeId, reason, actorId: actor.userId })

  if (!result.ok) {
    return { status: 'error', message: result.error.message, submitted: echo(formData) }
  }

  revalidateDepositScreens(reference)

  return { status: 'done' }
}

/* ── Approving the release ────────────────────────────────────────────────── */

const approveSchema = z.object({
  depositId: z.string().uuid(),
  reference: z.string().min(1),
  note: z
    .string()
    .trim()
    .max(MAX_RELEASE_NOTE_LENGTH, `Keep the note under ${MAX_RELEASE_NOTE_LENGTH} characters.`)
    .default(''),
})

export async function approveReleaseAction(
  _previous: DepositActionState,
  formData: FormData,
): Promise<DepositActionState> {
  const actor = await requirePermission('deposit.approve_release')
  const parsed = approveSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsOf(parsed.error),
      submitted: echo(formData),
    }
  }

  const { depositId, reference, note } = parsed.data

  // No figures are submitted. What is released is computed in the database
  // under the deposit's own lock, from the charges standing at that moment —
  // so a charge added while this dialog was open is either counted or refuses
  // the approval, and never signed against a list that moved.
  const result = await approveDepositRelease({
    depositId,
    note: note.length > 0 ? note : null,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message, submitted: echo(formData) }
  }

  revalidateDepositScreens(reference)

  return {
    status: 'done',
    released: { releasedAmount: result.releasedAmount, owed: result.owed },
  }
}

/* ── Recording what a guest owed as settled ───────────────────────────────── */

const settleSchema = z.object({
  depositId: z.string().uuid(),
  reference: z.string().min(1),
  method: z.string().refine(isPaymentMethod, 'Choose how the money arrived.'),
})

function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value)
}

export async function settleOwedAction(
  _previous: DepositActionState,
  formData: FormData,
): Promise<DepositActionState> {
  const actor = await requirePermission('payment.record_cash')
  const parsed = settleSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsOf(parsed.error),
      submitted: echo(formData),
    }
  }

  const { depositId, reference, method } = parsed.data

  const result = await settleDepositOwed({ depositId, method, actorId: actor.userId })

  if (!result.ok) {
    return { status: 'error', message: result.error.message, submitted: echo(formData) }
  }

  revalidateDepositScreens(reference)

  return { status: 'done' }
}

/* ── Shared ───────────────────────────────────────────────────────────────── */

/**
 * Every screen that shows this deposit or the booking it belongs to.
 *
 * The statement is included because a release is exactly what makes it
 * renderable, and the units board because an inspection is the fact C2–C3 will
 * derive `awaiting_inspection` from — harmless today, and one less thing to
 * remember when that lands.
 */
function revalidateDepositScreens(reference: string): void {
  revalidatePath('/portal/deposits')
  revalidatePath(`/portal/deposits/${reference}`)
  revalidatePath(`/portal/deposits/${reference}/statement`)
  revalidatePath(`/portal/bookings/${reference}`)
  revalidatePath('/portal/units')
  revalidatePath('/portal')
}

/** The first message per field, which is all a form can show at once. */
function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {}

  for (const issue of error.issues) {
    const field = issue.path[0]

    if (typeof field === 'string' && !fieldErrors[field]) {
      fieldErrors[field] = issue.message
    }
  }

  return fieldErrors
}

/** What was typed, so a refused form comes back filled in. */
function echo(formData: FormData): Record<string, string> {
  const submitted: Record<string, string> = {}

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      submitted[key] = value
    }
  }

  return submitted
}
