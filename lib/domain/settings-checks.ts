import type { PaxPolicy } from './config'
import { DOCUMENT_KINDS, type DocumentKind } from './document'
import { centsFromInput, MAX_CENTS, type Cents } from './money'
import type { PropertySettings } from './settings'

/**
 * What the settings screen may submit, checked (capability F3).
 *
 * The `checkUnitRegistry()` arrangement, applied to the four settings tabs: one
 * pure module the client component runs on every keystroke to mark fields, and
 * the server action runs again before it writes. The client's verdict is a
 * convenience and the server's is the one that counts — the browser is not a
 * place to enforce anything — but they are the same function, so a field that
 * looks accepted is accepted.
 *
 * ── Why drafts hold strings ────────────────────────────────────────────────
 *
 * Every typed number is a string here, and the inputs behind them are text
 * inputs rather than `type="number"`. `centsFromInput()` rejects what it cannot
 * read rather than repairing it, where a number input silently swallows a
 * stray comma and hands back something plausible. discount-fields.tsx records
 * the same reasoning; this is the same decision for eleven more fields.
 *
 * ── What a check returns ───────────────────────────────────────────────────
 *
 * On success, the payload the RPC takes, in the snake_case shape it expects —
 * so lib/db/settings.ts is a pass-through and there is no third spelling of
 * these fields between the form and the function. On failure, every problem
 * found rather than the first, each addressed to a field the form can mark
 * (`bands.2.price`, `policy.checkInTime`).
 */

export interface SettingsProblem {
  /** Dotted path to the field, e.g. `bands.2.price`. */
  field: string
  message: string
}

export type SettingsCheck<T> =
  { ok: true; value: T } | { ok: false; problems: readonly SettingsProblem[] }

// ── Drafts ─────────────────────────────────────────────────────────────────

export interface UnitTypeDraft {
  slug: string
  /** Shown, never edited: renaming a type is a migration, not a setting. */
  name: string
  baseRate: string
  maxPax: string
  carParks: string
}

export interface PolicyDraft {
  paxPolicy: PaxPolicy
  extraPersonPerNight: string
  paxExemptAgeMax: string
  sofaBedFee: string
  /** Blank means "unknown, do not constrain" (open-questions.md N8). */
  sofaBedStock: string
  earlyCheckInPerHour: string
  lateCheckOutPerHour: string
  checkInTime: string
  checkOutTime: string
  securityDeposit: string
  maxAdvanceBookingDays: string
}

export interface PricingDraft {
  unitTypes: readonly UnitTypeDraft[]
  policy: PolicyDraft
}

export interface BandDraft {
  /**
   * Stable for the life of the row on screen: the band's id where it has one,
   * and a generated key where it does not. A bundle line names a band by this,
   * which is what lets a bundle use a band created in the same save.
   */
  key: string
  id: string | null
  label: string
  minAge: string
  /** Blank on the last band, meaning "and above". */
  maxAgeExclusive: string
  price: string
}

export interface BundleDraft {
  key: string
  id: string | null
  label: string
  price: string
  /** Band key → headcount. Blank or zero means the bundle does not include it. */
  lines: Readonly<Record<string, string>>
}

export interface FacilityDraft {
  key: string
  id: string | null
  name: string
  includedInDayPass: boolean
  /** Blank until the client agrees one (open-questions.md C2). */
  capacity: string
}

export interface DayPassDraft {
  bands: readonly BandDraft[]
  bundles: readonly BundleDraft[]
  facilities: readonly FacilityDraft[]
}

export type RetentionDraft = Readonly<Record<DocumentKind, string>>

export interface BankAccountDraft {
  key: string
  id: string | null
  bankName: string
  accountNumber: string
}

export type BankAccountsDraft = readonly BankAccountDraft[]

// ── Payloads (the jsonb the RPCs take) ─────────────────────────────────────

export interface UnitTypePayload {
  slug: string
  base_rate_cents: Cents
  max_pax: number
  car_parks: number
}

export interface PolicyPayload {
  pax_policy: PaxPolicy
  extra_person_per_night_cents: Cents
  pax_exempt_age_max: number
  sofa_bed_fee_cents: Cents
  sofa_bed_stock: number | null
  early_check_in_per_hour_cents: Cents
  late_check_out_per_hour_cents: Cents
  check_in_time: string
  check_out_time: string
  security_deposit_cents: Cents
  max_advance_booking_days: number
}

export interface PricingPayload {
  unitTypes: readonly UnitTypePayload[]
  policy: PolicyPayload
}

export interface BandPayload {
  key: string
  id: string | null
  label: string
  min_age: number
  max_age_exclusive: number | null
  price_cents: Cents
}

export interface BundlePayload {
  id: string | null
  label: string
  price_cents: Cents
  lines: readonly { band_key: string; headcount: number }[]
}

export interface FacilityPayload {
  id: string | null
  name: string
  included_in_day_pass: boolean
  day_pass_capacity: number | null
}

export interface DayPassPayload {
  bands: readonly BandPayload[]
  bundles: readonly BundlePayload[]
  facilities: readonly FacilityPayload[]
}

export type RetentionPayload = Readonly<Record<DocumentKind, number>>

export interface BankAccountPayload {
  id: string | null
  bank_name: string
  account_number: string
}

// ── Field helpers ──────────────────────────────────────────────────────────

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const WHOLE_NUMBER = /^\d{1,6}$/

const MAX_BAND_LABEL = 40
const MAX_BUNDLE_LABEL = 60
const MAX_FACILITY_NAME = 80
const MAX_BANK_NAME = 60
const MAX_ACCOUNT_NUMBER = 40
/** A hundred years of months. Nothing sensible is longer, and it bounds a typo. */
const MAX_RETENTION_MONTHS = 1200
const MAX_AGE = 130

class Problems {
  private readonly found: SettingsProblem[] = []

  add(field: string, message: string): void {
    this.found.push({ field, message })
  }

  get list(): readonly SettingsProblem[] {
    return this.found
  }

  get any(): boolean {
    return this.found.length > 0
  }
}

/** An amount in BND as typed, in cents, or null with a problem recorded. */
function readCents(problems: Problems, field: string, value: string, label: string): Cents | null {
  const amount = centsFromInput(value.trim())

  if (amount === null) {
    problems.add(
      field,
      `${label} must be an amount in BND, like 250 or 250.50 — no commas or symbols.`,
    )

    return null
  }

  if (amount > MAX_CENTS) {
    problems.add(field, `${label} is too large.`)

    return null
  }

  return amount
}

/** A whole number as typed, or null with a problem recorded. */
function readCount(
  problems: Problems,
  field: string,
  value: string,
  label: string,
  options: { min?: number; max?: number } = {},
): number | null {
  const trimmed = value.trim()

  if (!WHOLE_NUMBER.test(trimmed)) {
    problems.add(field, `${label} must be a whole number.`)

    return null
  }

  const count = Number(trimmed)
  const min = options.min ?? 0
  const max = options.max ?? Number.MAX_SAFE_INTEGER

  if (count < min || count > max) {
    problems.add(field, `${label} must be between ${min} and ${max}.`)

    return null
  }

  return count
}

/** A whole number, or null for a blank field — which is a value, not a gap. */
function readOptionalCount(
  problems: Problems,
  field: string,
  value: string,
  label: string,
  options: { min?: number; max?: number } = {},
): number | null {
  return value.trim() === '' ? null : readCount(problems, field, value, label, options)
}

function readLabel(
  problems: Problems,
  field: string,
  value: string,
  label: string,
  maxLength: number,
): string | null {
  const trimmed = value.trim()

  if (trimmed === '') {
    problems.add(field, `${label} cannot be empty.`)

    return null
  }

  if (trimmed.length > maxLength) {
    problems.add(field, `${label} must be ${maxLength} characters or fewer.`)

    return null
  }

  return trimmed
}

/** Records a problem against every row sharing a name with an earlier one. */
function flagDuplicates(
  problems: Problems,
  rows: readonly { index: number; value: string | null }[],
  field: (index: number) => string,
  label: string,
): void {
  const seen = new Map<string, number>()

  for (const row of rows) {
    if (row.value === null) {
      continue
    }

    const key = row.value.toLocaleLowerCase()

    if (seen.has(key)) {
      problems.add(field(row.index), `${label} is used twice.`)
    } else {
      seen.set(key, row.index)
    }
  }
}

// ── Pricing ────────────────────────────────────────────────────────────────

export function checkPricingDraft(draft: PricingDraft): SettingsCheck<PricingPayload> {
  const problems = new Problems()

  const unitTypes = draft.unitTypes.map((unitType, index) => ({
    slug: unitType.slug,
    base_rate_cents:
      readCents(problems, `unitTypes.${index}.baseRate`, unitType.baseRate, 'The nightly rate') ??
      0,
    max_pax:
      readCount(problems, `unitTypes.${index}.maxPax`, unitType.maxPax, 'Maximum guests', {
        min: 1,
        max: 99,
      }) ?? 1,
    car_parks:
      readCount(problems, `unitTypes.${index}.carParks`, unitType.carParks, 'Car parks', {
        max: 99,
      }) ?? 0,
  }))

  const { policy } = draft

  if (!CLOCK_TIME.test(policy.checkInTime.trim())) {
    problems.add('policy.checkInTime', 'Check-in time must be a 24-hour time, like 14:00.')
  }

  if (!CLOCK_TIME.test(policy.checkOutTime.trim())) {
    problems.add('policy.checkOutTime', 'Check-out time must be a 24-hour time, like 12:00.')
  }

  const payload: PolicyPayload = {
    pax_policy: policy.paxPolicy,
    extra_person_per_night_cents:
      readCents(
        problems,
        'policy.extraPersonPerNight',
        policy.extraPersonPerNight,
        'The extra person charge',
      ) ?? 0,
    pax_exempt_age_max:
      readCount(problems, 'policy.paxExemptAgeMax', policy.paxExemptAgeMax, 'The exempt age', {
        max: MAX_AGE - 1,
      }) ?? 0,
    sofa_bed_fee_cents:
      readCents(problems, 'policy.sofaBedFee', policy.sofaBedFee, 'The sofa bed fee') ?? 0,
    sofa_bed_stock: readOptionalCount(
      problems,
      'policy.sofaBedStock',
      policy.sofaBedStock,
      'Sofa beds available',
      { max: 999 },
    ),
    early_check_in_per_hour_cents:
      readCents(
        problems,
        'policy.earlyCheckInPerHour',
        policy.earlyCheckInPerHour,
        'The early check-in rate',
      ) ?? 0,
    late_check_out_per_hour_cents:
      readCents(
        problems,
        'policy.lateCheckOutPerHour',
        policy.lateCheckOutPerHour,
        'The late check-out rate',
      ) ?? 0,
    check_in_time: policy.checkInTime.trim(),
    check_out_time: policy.checkOutTime.trim(),
    security_deposit_cents:
      readCents(
        problems,
        'policy.securityDeposit',
        policy.securityDeposit,
        'The security deposit',
      ) ?? 0,
    max_advance_booking_days:
      readCount(
        problems,
        'policy.maxAdvanceBookingDays',
        policy.maxAdvanceBookingDays,
        'The advance booking window',
        { min: 1, max: 3650 },
      ) ?? 1,
  }

  return problems.any
    ? { ok: false, problems: problems.list }
    : { ok: true, value: { unitTypes, policy: payload } }
}

// ── Day pass ───────────────────────────────────────────────────────────────

/**
 * The rule `bandForAge()` depends on: the bands cover every age from zero with
 * no gap and no overlap, and exactly one — the last — is open-ended.
 *
 * Checked here rather than left to the database because it is the one settings
 * mistake whose consequence is silent. A gap between bands does not fail a
 * save; it fails a quote, weeks later, for a party whose child happens to be
 * the age nobody covered.
 */
function checkBandCoverage(problems: Problems, bands: readonly BandPayload[]): void {
  const ordered = [...bands].sort((a, b) => a.min_age - b.min_age)
  const first = ordered[0]

  if (!first) {
    problems.add('bands', 'There has to be at least one age band.')

    return
  }

  if (first.min_age !== 0) {
    problems.add('bands.0.minAge', 'The first band has to start at 0, so every age has a price.')
  }

  ordered.forEach((band, index) => {
    const next = ordered[index + 1]
    const field = `bands.${bands.indexOf(band)}.maxAgeExclusive`

    if (!next) {
      if (band.max_age_exclusive !== null) {
        problems.add(field, 'Leave the last band open-ended, so an older guest still has a price.')
      }

      return
    }

    if (band.max_age_exclusive === null) {
      problems.add(field, 'Only the last band can be open-ended.')

      return
    }

    if (band.max_age_exclusive !== next.min_age) {
      problems.add(
        field,
        `This band ends at ${band.max_age_exclusive} and the next starts at ${next.min_age} — they have to meet.`,
      )
    }
  })
}

function checkBands(problems: Problems, drafts: readonly BandDraft[]): readonly BandPayload[] {
  const bands = drafts.map((band, index) => {
    const minAge = readCount(
      problems,
      `bands.${index}.minAge`,
      band.minAge,
      'The age it starts at',
      {
        max: MAX_AGE,
      },
    )
    const maxAge = readOptionalCount(
      problems,
      `bands.${index}.maxAgeExclusive`,
      band.maxAgeExclusive,
      'The age it ends at',
      { max: MAX_AGE },
    )

    if (minAge !== null && maxAge !== null && maxAge <= minAge) {
      problems.add(`bands.${index}.maxAgeExclusive`, 'A band has to end after it starts.')
    }

    return {
      key: band.key,
      id: band.id,
      label:
        readLabel(problems, `bands.${index}.label`, band.label, 'The band name', MAX_BAND_LABEL) ??
        '',
      min_age: minAge ?? 0,
      max_age_exclusive: maxAge,
      price_cents: readCents(problems, `bands.${index}.price`, band.price, 'The price') ?? 0,
    }
  })

  flagDuplicates(
    problems,
    bands.map((band, index) => ({ index, value: band.label === '' ? null : band.label })),
    (index) => `bands.${index}.label`,
    'That band name',
  )

  if (drafts.length === 0) {
    problems.add('bands', 'There has to be at least one age band.')
  } else if (!problems.any) {
    checkBandCoverage(problems, bands)
  }

  return bands
}

function checkBundles(
  problems: Problems,
  drafts: readonly BundleDraft[],
  bandKeys: ReadonlySet<string>,
): readonly BundlePayload[] {
  const bundles = drafts.map((bundle, index) => {
    const lines = Object.entries(bundle.lines)
      .filter(([bandKey, headcount]) => bandKeys.has(bandKey) && headcount.trim() !== '')
      .map(([bandKey, headcount]) => ({
        band_key: bandKey,
        headcount:
          readCount(
            problems,
            `bundles.${index}.lines.${bandKey}`,
            headcount,
            'A bundle headcount',
            { max: 99 },
          ) ?? 0,
      }))
      .filter((bundleLine) => bundleLine.headcount > 0)

    if (lines.length === 0) {
      problems.add(`bundles.${index}.lines`, 'A bundle has to include at least one guest.')
    }

    return {
      id: bundle.id,
      label:
        readLabel(
          problems,
          `bundles.${index}.label`,
          bundle.label,
          'The bundle name',
          MAX_BUNDLE_LABEL,
        ) ?? '',
      price_cents: readCents(problems, `bundles.${index}.price`, bundle.price, 'The price') ?? 0,
      lines,
    }
  })

  flagDuplicates(
    problems,
    bundles.map((bundle, index) => ({ index, value: bundle.label === '' ? null : bundle.label })),
    (index) => `bundles.${index}.label`,
    'That bundle name',
  )

  return bundles
}

function checkFacilities(
  problems: Problems,
  drafts: readonly FacilityDraft[],
): readonly FacilityPayload[] {
  const facilities = drafts.map((facility, index) => ({
    id: facility.id,
    name:
      readLabel(
        problems,
        `facilities.${index}.name`,
        facility.name,
        'The facility name',
        MAX_FACILITY_NAME,
      ) ?? '',
    included_in_day_pass: facility.includedInDayPass,
    day_pass_capacity: readOptionalCount(
      problems,
      `facilities.${index}.capacity`,
      facility.capacity,
      'The capacity',
      { max: 100000 },
    ),
  }))

  flagDuplicates(
    problems,
    facilities.map((facility, index) => ({
      index,
      value: facility.name === '' ? null : facility.name,
    })),
    (index) => `facilities.${index}.name`,
    'That facility name',
  )

  return facilities
}

export function checkDayPassDraft(draft: DayPassDraft): SettingsCheck<DayPassPayload> {
  const problems = new Problems()

  const bands = checkBands(problems, draft.bands)
  const bandKeys = new Set(draft.bands.map((band) => band.key))
  const bundles = checkBundles(problems, draft.bundles, bandKeys)
  const facilities = checkFacilities(problems, draft.facilities)

  return problems.any
    ? { ok: false, problems: problems.list }
    : { ok: true, value: { bands, bundles, facilities } }
}

// ── Retention ──────────────────────────────────────────────────────────────

export function checkRetentionDraft(draft: RetentionDraft): SettingsCheck<RetentionPayload> {
  const problems = new Problems()
  const months: Record<string, number> = {}

  for (const kind of DOCUMENT_KINDS) {
    months[kind] =
      readCount(problems, `retention.${kind}`, draft[kind] ?? '', 'A retention period', {
        min: 1,
        max: MAX_RETENTION_MONTHS,
      }) ?? 1
  }

  return problems.any
    ? { ok: false, problems: problems.list }
    : { ok: true, value: months as RetentionPayload }
}

// ── Bank accounts ──────────────────────────────────────────────────────────

export function checkBankAccountsDraft(
  draft: BankAccountsDraft,
): SettingsCheck<readonly BankAccountPayload[]> {
  const problems = new Problems()

  const accounts = draft.map((account, index) => ({
    id: account.id,
    bank_name:
      readLabel(
        problems,
        `accounts.${index}.bankName`,
        account.bankName,
        'The bank name',
        MAX_BANK_NAME,
      ) ?? '',
    account_number:
      readLabel(
        problems,
        `accounts.${index}.accountNumber`,
        account.accountNumber,
        'The account number',
        MAX_ACCOUNT_NUMBER,
      ) ?? '',
  }))

  flagDuplicates(
    problems,
    accounts.map((account, index) => ({
      index,
      value: account.account_number === '' ? null : account.account_number,
    })),
    (index) => `accounts.${index}.accountNumber`,
    'That account number',
  )

  return problems.any ? { ok: false, problems: problems.list } : { ok: true, value: accounts }
}

// ── Drafts from what is stored ─────────────────────────────────────────────

/** Cents as a form value: '20000' becomes '200.00'. */
function amountField(amount: Cents): string {
  return (amount / 100).toFixed(2)
}

function countField(count: number | null): string {
  return count === null ? '' : String(count)
}

export function pricingDraftFrom(settings: PropertySettings): PricingDraft {
  return {
    unitTypes: settings.unitTypes.map((unitType) => ({
      slug: unitType.slug,
      name: unitType.name,
      baseRate: amountField(unitType.baseRateCents),
      maxPax: String(unitType.maxPax),
      carParks: String(unitType.carParks),
    })),
    policy: {
      paxPolicy: settings.policy.paxPolicy,
      extraPersonPerNight: amountField(settings.policy.extraPersonPerNightCents),
      paxExemptAgeMax: String(settings.policy.paxExemptAgeMax),
      sofaBedFee: amountField(settings.policy.sofaBedFeeCents),
      sofaBedStock: countField(settings.policy.sofaBedStock),
      earlyCheckInPerHour: amountField(settings.policy.earlyCheckInPerHourCents),
      lateCheckOutPerHour: amountField(settings.policy.lateCheckOutPerHourCents),
      checkInTime: settings.policy.checkInTime,
      checkOutTime: settings.policy.checkOutTime,
      securityDeposit: amountField(settings.policy.securityDepositCents),
      maxAdvanceBookingDays: String(settings.policy.maxAdvanceBookingDays),
    },
  }
}

export function dayPassDraftFrom(settings: PropertySettings): DayPassDraft {
  return {
    bands: [...settings.bands]
      .sort((a, b) => a.minAge - b.minAge)
      .map((band) => ({
        key: band.id,
        id: band.id,
        label: band.label,
        minAge: String(band.minAge),
        maxAgeExclusive: countField(band.maxAgeExclusive),
        price: amountField(band.priceCents),
      })),
    bundles: settings.bundles.map((bundle) => ({
      key: bundle.id,
      id: bundle.id,
      label: bundle.label,
      price: amountField(bundle.priceCents),
      lines: Object.fromEntries(
        bundle.lines.map((bundleLine) => [bundleLine.bandId, String(bundleLine.headcount)]),
      ),
    })),
    facilities: settings.facilities.map((facility) => ({
      key: facility.id,
      id: facility.id,
      name: facility.name,
      includedInDayPass: facility.includedInDayPass,
      capacity: countField(facility.dayPassCapacity),
    })),
  }
}

export function retentionDraftFrom(settings: PropertySettings): RetentionDraft {
  const months: Record<string, string> = {}

  for (const kind of DOCUMENT_KINDS) {
    const period = settings.retention.find((row) => row.kind === kind)

    months[kind] = period ? String(period.months) : ''
  }

  return months as RetentionDraft
}

export function bankAccountsDraftFrom(settings: PropertySettings): BankAccountsDraft {
  return settings.bankAccounts.map((account) => ({
    key: account.id,
    id: account.id,
    bankName: account.bankName,
    accountNumber: account.accountNumber,
  }))
}

// ── Dirty ──────────────────────────────────────────────────────────────────

/**
 * Whether a draft differs from what is stored, after trimming.
 *
 * What gates Save (design.md §Components: "an edit form's Save is dirty-gated
 * ... so an idle click cannot fire a no-op write or its audit event"). Trimming
 * is why retyping a value with a trailing space re-disables the button rather
 * than offering to save nothing.
 *
 * Keys are sorted before comparing so two drafts built in different orders —
 * one from the database, one assembled by the form — compare as equal.
 */
export function isSettingsDraftDirty<T>(draft: T, saved: T): boolean {
  return canonical(draft) !== canonical(saved)
}

function canonical(value: unknown): string {
  return JSON.stringify(normalise(value))
}

function normalise(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (Array.isArray(value)) {
    return value.map(normalise)
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, entry]) => [key, normalise(entry)]),
    )
  }

  return value
}
