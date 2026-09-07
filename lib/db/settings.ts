import type { PaxPolicy } from '@/lib/domain/config'
import type { DocumentKind } from '@/lib/domain/document'
import type {
  BankAccountPayload,
  DayPassPayload,
  PricingPayload,
  RetentionPayload,
} from '@/lib/domain/settings-checks'
import type { PropertySettings } from '@/lib/domain/settings'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'

/**
 * Reading and writing the property's settings (capability F3).
 *
 * One read for the whole of it and four writes, one per tab. Every write goes
 * through a database function that applies the change and records its own audit
 * events in the same transaction — the arrangement `apply_unit_registry()`
 * established: what changed and who changed it cannot come apart, because
 * nothing commits one without the other.
 *
 * ── The token ──────────────────────────────────────────────────────────────
 *
 * Every save states the `settingsUpdatedAt` the screen was opened on and is
 * refused with `changed` if it has moved. The value is opaque here: it is read
 * from a save's result or from `readPropertySettings()`, carried through the
 * form, and handed back. Nothing formats it or compares it, because the only
 * comparison that means anything happens under a row lock in Postgres.
 */

export interface PropertySettingsRow {
  property_id: string
  name: string
  time_zone: string
  currency: string
  settings_updated_at: string
  policy: {
    pax_policy: PaxPolicy
    extra_person_per_night_cents: number
    pax_exempt_age_max: number
    sofa_bed_fee_cents: number
    sofa_bed_stock: number | null
    early_check_in_per_hour_cents: number
    late_check_out_per_hour_cents: number
    check_in_time: string
    check_out_time: string
    security_deposit_cents: number
    max_advance_booking_days: number
  }
  unit_types: {
    id: string
    slug: string
    name: string
    base_rate_cents: number
    max_pax: number
    car_parks: number
  }[]
  bands: {
    id: string
    label: string
    min_age: number
    max_age_exclusive: number | null
    price_cents: number
  }[]
  bundles: {
    id: string
    label: string
    price_cents: number
    sort_order: number
    lines: { band_id: string; headcount: number }[]
  }[]
  facilities: {
    id: string
    slug: string
    name: string
    included_in_day_pass: boolean
    day_pass_capacity: number | null
    sort_order: number
  }[]
  retention: { kind: DocumentKind; months: number }[]
  bank_accounts: {
    id: string
    bank_name: string
    account_number: string
    sort_order: number
  }[]
}

function toSettings(row: PropertySettingsRow): PropertySettings {
  return {
    propertyId: row.property_id,
    name: row.name,
    timeZone: row.time_zone,
    currency: row.currency,
    settingsUpdatedAt: row.settings_updated_at,
    policy: {
      paxPolicy: row.policy.pax_policy,
      extraPersonPerNightCents: row.policy.extra_person_per_night_cents,
      paxExemptAgeMax: row.policy.pax_exempt_age_max,
      sofaBedFeeCents: row.policy.sofa_bed_fee_cents,
      sofaBedStock: row.policy.sofa_bed_stock,
      earlyCheckInPerHourCents: row.policy.early_check_in_per_hour_cents,
      lateCheckOutPerHourCents: row.policy.late_check_out_per_hour_cents,
      checkInTime: row.policy.check_in_time,
      checkOutTime: row.policy.check_out_time,
      securityDepositCents: row.policy.security_deposit_cents,
      maxAdvanceBookingDays: row.policy.max_advance_booking_days,
    },
    unitTypes: row.unit_types.map((unitType) => ({
      id: unitType.id,
      slug: unitType.slug,
      name: unitType.name,
      baseRateCents: unitType.base_rate_cents,
      maxPax: unitType.max_pax,
      carParks: unitType.car_parks,
    })),
    bands: row.bands.map((band) => ({
      id: band.id,
      label: band.label,
      minAge: band.min_age,
      maxAgeExclusive: band.max_age_exclusive,
      priceCents: band.price_cents,
    })),
    bundles: row.bundles.map((bundle) => ({
      id: bundle.id,
      label: bundle.label,
      priceCents: bundle.price_cents,
      sortOrder: bundle.sort_order,
      lines: bundle.lines.map((bundleLine) => ({
        bandId: bundleLine.band_id,
        headcount: bundleLine.headcount,
      })),
    })),
    facilities: row.facilities.map((facility) => ({
      id: facility.id,
      slug: facility.slug,
      name: facility.name,
      includedInDayPass: facility.included_in_day_pass,
      dayPassCapacity: facility.day_pass_capacity,
      sortOrder: facility.sort_order,
    })),
    retention: row.retention.map((period) => ({ kind: period.kind, months: period.months })),
    bankAccounts: row.bank_accounts.map((account) => ({
      id: account.id,
      bankName: account.bank_name,
      accountNumber: account.account_number,
      sortOrder: account.sort_order,
    })),
  }
}

/** Everything the settings screen edits and the pricing engine reads. */
export async function readPropertySettings(): Promise<PropertySettings> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('property_settings', {
    p_property_id: propertyId,
  })

  if (error) {
    throw new Error(`Could not read the property settings: ${error.message}`)
  }

  if (!data) {
    throw new Error('Could not read the property settings: no property was returned.')
  }

  return toSettings(data as PropertySettingsRow)
}

export type SettingsErrorCode =
  | 'changed'
  | 'not_found'
  | 'unit_type_not_found'
  | 'bands_required'
  | 'bands_not_contiguous'
  | 'band_not_found'
  | 'band_in_use'
  | 'bundle_not_found'
  | 'facility_not_found'
  | 'account_not_found'
  | 'duplicate_label'
  | 'kind_missing'
  | 'months_invalid'
  | 'invalid_value'

export interface SettingsError {
  code: SettingsErrorCode
  message: string
}

export type SettingsWriteResult =
  | { ok: true; settingsUpdatedAt: string; changed: number }
  | { ok: false; error: SettingsError }

interface SettingsRefusal {
  ok: false
  error: SettingsErrorCode
  detail?: string | null
}

type SettingsRpcResult =
  | { ok: true; settings_updated_at: string; changed: number }
  | SettingsRefusal

async function callSave(
  fn: string,
  args: Record<string, unknown>,
  what: string,
): Promise<SettingsWriteResult> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc(fn, {
    p_property_id: propertyId,
    ...args,
  })

  if (error) {
    throw new Error(`Could not save ${what}: ${error.message}`)
  }

  const result = data as SettingsRpcResult

  if (!result.ok) {
    return { ok: false, error: describeSettingsFailure(result) }
  }

  return {
    ok: true,
    settingsUpdatedAt: result.settings_updated_at,
    changed: result.changed,
  }
}

export async function savePricingSettings(input: {
  expectedUpdatedAt: string
  pricing: PricingPayload
  actorId: string | null
}): Promise<SettingsWriteResult> {
  return callSave(
    'save_pricing_settings',
    {
      p_expected_updated_at: input.expectedUpdatedAt,
      p_unit_types: input.pricing.unitTypes,
      p_policy: input.pricing.policy,
      p_actor_id: input.actorId,
    },
    'the rates',
  )
}

export async function saveDayPassSettings(input: {
  expectedUpdatedAt: string
  dayPass: DayPassPayload
  actorId: string | null
}): Promise<SettingsWriteResult> {
  return callSave(
    'save_day_pass_settings',
    {
      p_expected_updated_at: input.expectedUpdatedAt,
      p_bands: input.dayPass.bands,
      p_bundles: input.dayPass.bundles,
      p_facilities: input.dayPass.facilities,
      p_actor_id: input.actorId,
    },
    'the day pass',
  )
}

export async function saveDocumentRetention(input: {
  expectedUpdatedAt: string
  months: RetentionPayload
  actorId: string | null
}): Promise<SettingsWriteResult> {
  return callSave(
    'save_document_retention',
    {
      p_expected_updated_at: input.expectedUpdatedAt,
      p_months: input.months,
      p_actor_id: input.actorId,
    },
    'the retention periods',
  )
}

export async function saveBankAccounts(input: {
  expectedUpdatedAt: string
  accounts: readonly BankAccountPayload[]
  actorId: string | null
}): Promise<SettingsWriteResult> {
  return callSave(
    'save_bank_accounts',
    {
      p_expected_updated_at: input.expectedUpdatedAt,
      p_accounts: input.accounts,
      p_actor_id: input.actorId,
    },
    'the bank accounts',
  )
}

function describeSettingsFailure(refusal: SettingsRefusal): SettingsError {
  const detail = refusal.detail ?? null

  switch (refusal.error) {
    case 'changed':
      return {
        code: refusal.error,
        message:
          'Somebody else changed these settings while this screen was open. Reload to see what they saved, then make your change again.',
      }
    case 'bands_required':
      return { code: refusal.error, message: 'There has to be at least one age band.' }
    case 'bands_not_contiguous':
      return {
        code: refusal.error,
        message:
          'The age bands have to cover every age from 0 with no gaps, and the last one has to be open-ended.',
      }
    case 'band_in_use':
      return {
        code: refusal.error,
        message: detail
          ? `The “${detail}” band is still used by a family bundle. Change the bundle first, or remove it.`
          : 'That age band is still used by a family bundle.',
      }
    case 'duplicate_label':
      return { code: refusal.error, message: 'Two rows have the same name. Names have to differ.' }
    case 'kind_missing':
      return {
        code: refusal.error,
        message: `No retention period was given for ${detail ?? 'one kind of document'}.`,
      }
    case 'months_invalid':
      return {
        code: refusal.error,
        message: `The retention period for ${detail ?? 'that document'} has to be at least one month.`,
      }
    case 'unit_type_not_found':
    case 'band_not_found':
    case 'bundle_not_found':
    case 'facility_not_found':
    case 'account_not_found':
      return {
        code: refusal.error,
        message:
          'Something on this screen no longer exists — somebody else may have removed it. Reload and try again.',
      }
    case 'not_found':
      return { code: 'not_found', message: 'That property no longer exists.' }
    default:
      return {
        code: 'invalid_value',
        message: 'One of these values was refused. Check the figures and try again.',
      }
  }
}
