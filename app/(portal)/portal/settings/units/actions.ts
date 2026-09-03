'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { applyUnitRegistry, listUnitRegistry } from '@/lib/db/units'
import {
  checkUnitRegistry,
  planRegistry,
  isNoOp,
  MAX_UNITS_PER_TYPE,
  type DesiredUnitType,
  type RefProblem,
} from '@/lib/domain/unit-ref'

/**
 * Renaming and resizing the building (capability F6).
 *
 * ── Why this is `config.manage` and not `unit.manage` ─────────────────────
 *
 * prd.md §4 gives Housekeeping `unit.manage` with the parenthetical "(status
 * only)" — a standing warning that the permission is broader than the role.
 * Reporting that a unit cannot be used is the cleaner's job; renumbering the
 * building is not. Renumbering is configuration, in the same class as the
 * pricing screen F3 puts behind `config.manage`, so it goes there rather than
 * behind a seventeenth permission string that would cost a migration, a seed
 * change and a role rework for a screen opened twice a year.
 *
 * ── The plan is recomputed here, never trusted from the client ────────────
 *
 * The form submits what the building should *look like*; the diff against what
 * it currently looks like is computed on the server from a fresh read. A
 * client-supplied plan would let a hand-made request rename a unit the editor
 * never showed, and it would be computed against data that may be minutes old.
 */

export interface RegistryActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  /** What is wrong with the names, so the editor can mark the fields. */
  problems?: readonly RefProblem[]
  /** Units the save wanted to remove but could not, named for the reader. */
  blocked?: readonly string[]
  applied?: { renamed: number; added: number; removed: number }
}

const desiredSchema = z.object({
  desired: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown
      } catch {
        ctx.addIssue({ code: 'custom', message: 'The form could not be read.' })

        return z.NEVER
      }
    })
    .pipe(
      z.array(
        z.object({
          unitTypeId: z.string().min(1),
          refs: z.array(z.string()).max(MAX_UNITS_PER_TYPE),
        }),
      ),
    ),
})

export async function saveUnitRegistryAction(
  _previous: RegistryActionState,
  formData: FormData,
): Promise<RegistryActionState> {
  const actor = await requirePermission('config.manage')

  const parsed = desiredSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return { status: 'error', message: 'The form could not be read. Reload and try again.' }
  }

  const desired: readonly DesiredUnitType[] = parsed.data.desired.map((type) => ({
    unitTypeId: type.unitTypeId,
    refs: type.refs.map((ref) => ref.trim()),
  }))

  const current = (await listUnitRegistry()).map((unit) => ({
    id: unit.id,
    ref: unit.ref,
    unitTypeId: unit.unitTypeId,
    hasHistory: unit.hasHistory,
  }))

  // Validated against the whole building rather than the types being edited:
  // `unique (property_id, ref)` is property-wide, so naming a 2-bedroom `3B-01`
  // collides with a 3-bedroom the form was not even showing.
  const problems = checkUnitRegistry(current, desired)

  if (problems.length > 0) {
    return { status: 'error', message: 'Some names cannot be used.', problems }
  }

  const plan = planRegistry(current, desired)

  if (plan.blocked.length > 0) {
    return {
      status: 'error',
      message:
        'Some units have hosted bookings and cannot be removed. Take them out of service instead — that keeps the record and stops them being booked.',
      blocked: plan.blocked.map((entry) => entry.ref),
    }
  }

  if (isNoOp(plan)) {
    return { status: 'error', message: 'Nothing has changed.' }
  }

  const result = await applyUnitRegistry({ plan, actorId: actor.userId })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidatePath('/portal/settings/units')
  revalidatePath('/portal/units')
  // Every screen that names a unit or counts the inventory.
  revalidatePath('/portal/bookings')
  revalidatePath('/portal/bookings/new')
  revalidatePath('/portal')

  return { status: 'done', applied: result.outcome }
}
