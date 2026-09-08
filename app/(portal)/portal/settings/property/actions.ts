'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import {
  saveBankAccounts,
  saveDayPassSettings,
  saveDocumentRetention,
  savePricingSettings,
} from '@/lib/db/settings'
import {
  checkBankAccountsDraft,
  checkDayPassDraft,
  checkPricingDraft,
  checkRetentionDraft,
  type BankAccountsDraft,
  type DayPassDraft,
  type PricingDraft,
  type RetentionDraft,
  type SettingsProblem,
} from '@/lib/domain/settings-checks'

/**
 * Writing the property's settings (capability F3).
 *
 * Four actions, one per tab, all the same shape: `config.manage`, parse, check
 * with the same pure function the form ran, write through the RPC that records
 * its own audit events, revalidate.
 *
 * ── Why the draft arrives as one JSON field ────────────────────────────────
 *
 * A tab is a table with rows a person adds and removes, so its shape is not a
 * fixed set of form fields — the units registry made the same move for the same
 * reason. The client sends the draft it was editing and the server re-checks it
 * from scratch: what came back over the wire is never trusted, and the check is
 * the same module either way, so a field the form accepted cannot be one the
 * action refuses.
 *
 * ── The token ──────────────────────────────────────────────────────────────
 *
 * Every action carries the `settingsUpdatedAt` the screen was opened on. The
 * database refuses the write if it has moved — somebody else saved while this
 * screen was open — and the action says so rather than overwriting them.
 */

export interface SettingsActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  /** Per-field problems, addressed the way `SettingsProblem.field` is. */
  problems?: readonly SettingsProblem[]
  /** How many rows the save actually changed. Zero is a successful no-op. */
  changed?: number
}

/**
 * The two fields every tab submits: the draft, and the token.
 *
 * The draft is validated as JSON here and as a *shape* by the check function
 * that follows — deliberately not by zod, which would be a third statement of
 * the draft types after the interface and the checker.
 */
const submissionSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  draft: z
    .string()
    .min(1)
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown
      } catch {
        ctx.addIssue({ code: 'custom', message: 'unreadable' })

        return z.NEVER
      }
    }),
})

interface Submission<T> {
  expectedUpdatedAt: string
  draft: T
}

function readSubmission<T>(formData: FormData): Submission<T> | null {
  const parsed = submissionSchema.safeParse({
    expectedUpdatedAt: formData.get('expectedUpdatedAt'),
    draft: formData.get('draft'),
  })

  return parsed.success
    ? { expectedUpdatedAt: parsed.data.expectedUpdatedAt, draft: parsed.data.draft as T }
    : null
}

const UNREADABLE: SettingsActionState = {
  status: 'error',
  message: 'That form could not be read. Reload the page and try again.',
}

const SETTINGS_PATH = '/portal/settings/property'

/**
 * Everything a rate change is visible on.
 *
 * The two booking screens because they quote — the new-booking form shows the
 * rate per type and both price through `getPropertyConfig()` — and the portal
 * home because its tiles read the same inventory.
 */
function revalidatePricing(): void {
  revalidatePath(SETTINGS_PATH)
  revalidatePath('/portal/bookings/new')
  revalidatePath('/portal/bookings')
  revalidatePath('/portal')
}

export async function savePricingAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const actor = await requirePermission('config.manage')
  const submission = readSubmission<PricingDraft>(formData)

  if (!submission) {
    return UNREADABLE
  }

  const checked = checkPricingDraft(submission.draft)

  if (!checked.ok) {
    return {
      status: 'error',
      message: 'Some of these figures were refused.',
      problems: checked.problems,
    }
  }

  const saved = await savePricingSettings({
    expectedUpdatedAt: submission.expectedUpdatedAt,
    pricing: checked.value,
    actorId: actor.userId,
  })

  if (!saved.ok) {
    return { status: 'error', message: saved.error.message }
  }

  revalidatePricing()

  return { status: 'done', changed: saved.changed }
}

export async function saveDayPassAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const actor = await requirePermission('config.manage')
  const submission = readSubmission<DayPassDraft>(formData)

  if (!submission) {
    return UNREADABLE
  }

  const checked = checkDayPassDraft(submission.draft)

  if (!checked.ok) {
    return {
      status: 'error',
      message: 'Some of these figures were refused.',
      problems: checked.problems,
    }
  }

  const saved = await saveDayPassSettings({
    expectedUpdatedAt: submission.expectedUpdatedAt,
    dayPass: checked.value,
    actorId: actor.userId,
  })

  if (!saved.ok) {
    return { status: 'error', message: saved.error.message }
  }

  revalidatePath(SETTINGS_PATH)
  // The reports screen names where a day-pass capacity would come from.
  revalidatePath('/portal/reports')

  return { status: 'done', changed: saved.changed }
}

export async function saveRetentionAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const actor = await requirePermission('config.manage')
  const submission = readSubmission<RetentionDraft>(formData)

  if (!submission) {
    return UNREADABLE
  }

  const checked = checkRetentionDraft(submission.draft)

  if (!checked.ok) {
    return {
      status: 'error',
      message: 'Some of these periods were refused.',
      problems: checked.problems,
    }
  }

  const saved = await saveDocumentRetention({
    expectedUpdatedAt: submission.expectedUpdatedAt,
    months: checked.value,
    actorId: actor.userId,
  })

  if (!saved.ok) {
    return { status: 'error', message: saved.error.message }
  }

  revalidatePath(SETTINGS_PATH)
  // A shortened period moves the "kept until" date shown on every booking that
  // holds a document, so those screens are stale the moment this returns.
  revalidatePath('/portal/bookings')
  revalidatePath('/portal/documents')

  return { status: 'done', changed: saved.changed }
}

export async function saveBankAccountsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const actor = await requirePermission('config.manage')
  const submission = readSubmission<BankAccountsDraft>(formData)

  if (!submission) {
    return UNREADABLE
  }

  const checked = checkBankAccountsDraft(submission.draft)

  if (!checked.ok) {
    return {
      status: 'error',
      message: 'Some of these accounts were refused.',
      problems: checked.problems,
    }
  }

  const saved = await saveBankAccounts({
    expectedUpdatedAt: submission.expectedUpdatedAt,
    accounts: checked.value,
    actorId: actor.userId,
  })

  if (!saved.ok) {
    return { status: 'error', message: saved.error.message }
  }

  revalidatePath(SETTINGS_PATH)

  return { status: 'done', changed: saved.changed }
}
