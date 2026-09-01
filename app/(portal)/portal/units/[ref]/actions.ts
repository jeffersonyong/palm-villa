'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import {
  endUnitLease,
  markUnitLeased,
  markUnitOutOfService,
  returnUnitToService,
  type LeaseEnding,
} from '@/lib/db/units'
import { isStayDate } from '@/lib/domain/dates'

/**
 * The four things a person can do to a unit (capability B9).
 *
 * ── Two permissions, deliberately ─────────────────────────────────────────
 *
 * Out of service is `unit.manage`, which prd.md §4 gives Housekeeping "(status
 * only)" — reporting that a unit cannot be used is exactly the cleaner's job.
 * Letting a unit long-term is `tenancy.manage`, because it is a commercial
 * statement rather than an operational one and should not sit with the person
 * who reports that the shower door sticks.
 *
 * ── Where the rules actually live ─────────────────────────────────────────
 *
 * Not here. Whether a unit may be taken out of service depends on what is
 * booked into it, and a check in this file would race the booking being
 * created — so it is inside `set_unit_out_of_service()`, after a `for update`
 * on the row. What these functions own is the permission gate, the shape of
 * the input, and which screens have to be rebuilt afterwards.
 */

export interface UnitActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
  /** Which of an action's two outcomes happened, where it has two. */
  outcome?: LeaseEnding
}

/**
 * Screens that show what a unit is doing, or whether it can be sold.
 *
 * The booking screens are on the list because taking a unit out of service
 * changes what their pickers may offer, and a cached picker offering a unit the
 * write will refuse is the exact disagreement architecture.md §5.2 keeps the
 * availability query and the constraint in step to avoid.
 */
function revalidateUnitScreens(ref: string): void {
  revalidatePath('/portal/units')
  revalidatePath(`/portal/units/${ref}`)
  revalidatePath('/portal/bookings/new')
  revalidatePath('/portal')
}

/** First message per field, in the shape the forms read. */
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

const stayDate = z.string().refine(isStayDate, 'Use a real date.')

/**
 * A reason is required, and it is the useful half of the record.
 *
 * "Out of service" on its own tells the next person nothing — they still have
 * to ring somebody to find out whether it is a burst pipe or a missing
 * remote control, which is the phone call this screen exists to save.
 */
const outOfServiceSchema = z.object({
  unitId: z.string().uuid(),
  ref: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, 'Say briefly why this unit cannot be used.')
    .max(280, 'Keep the reason under 280 characters.'),
})

export async function markOutOfServiceAction(
  _previous: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const actor = await requirePermission('unit.manage')
  const parsed = outOfServiceSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  }

  const { unitId, ref, reason } = parsed.data

  const result = await markUnitOutOfService({ unitId, reason, actorId: actor.userId })

  if (!result.ok) {
    // Reported on the reason field only when the refusal is about the reason;
    // this one is about the building, so it belongs at the button that asked.
    return { status: 'error', message: result.error.message }
  }

  revalidateUnitScreens(ref)

  return { status: 'done' }
}

const returnToServiceSchema = z.object({
  unitId: z.string().uuid(),
  ref: z.string().min(1),
})

export async function returnToServiceAction(
  _previous: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const actor = await requirePermission('unit.manage')
  const parsed = returnToServiceSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return { status: 'error', message: 'That unit could not be identified.' }
  }

  const result = await returnUnitToService({
    unitId: parsed.data.unitId,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidateUnitScreens(parsed.data.ref)

  return { status: 'done' }
}

/**
 * A lease is a name and two dates, and nothing else.
 *
 * prd.md §6.2 sketches a `Tenancy` with a tenant record and a monthly rent, and
 * scope X5 makes that phase three. B9 asks only that availability reflects
 * reality and that the board can say who is in the unit — so the name is free
 * text **[A]**, and the day the tenancy module lands it becomes a real
 * relationship rather than a second system.
 */
const leaseSchema = z
  .object({
    unitId: z.string().uuid(),
    ref: z.string().min(1),
    occupantName: z
      .string()
      .trim()
      .min(2, 'Who is the unit let to?')
      .max(120, 'Keep the name under 120 characters.'),
    start: stayDate,
    end: stayDate,
  })
  .refine((value) => value.end > value.start, {
    path: ['end'],
    message: 'A lease has to end after it starts.',
  })

export async function markLeasedAction(
  _previous: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const actor = await requirePermission('tenancy.manage')
  const parsed = leaseSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  }

  const { unitId, ref, occupantName, start, end } = parsed.data

  const result = await markUnitLeased({
    unitId,
    occupantName,
    start,
    end,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidateUnitScreens(ref)

  return { status: 'done' }
}

const endLeaseSchema = z.object({
  occupancyId: z.string().uuid(),
  ref: z.string().min(1),
  end: stayDate,
})

export async function endLeaseAction(
  _previous: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const actor = await requirePermission('tenancy.manage')
  const parsed = endLeaseSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  }

  const result = await endUnitLease({
    occupancyId: parsed.data.occupancyId,
    end: parsed.data.end,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidateUnitScreens(parsed.data.ref)

  // Which of the two happened, so the toast can say the true thing: a date on
  // or before the start unwinds the lease rather than ending it.
  return { status: 'done', outcome: result.outcome }
}
