import type { PaxPolicy, PropertyConfig } from './config'
import type { DocumentKind } from './document'
import type { Cents } from './money'

/**
 * The property's settings, as they are stored (capability F3).
 *
 * This is the read model `property_settings()` returns, camelCased — the whole
 * of what the settings screen edits, and a superset of what the pricing engine
 * needs. `configFromSettings()` at the foot derives the engine's
 * `PropertyConfig` from it, which is what keeps the figures a quote uses and
 * the figures the screen shows from coming apart: there is one read, and the
 * config is a projection of it rather than a second source.
 *
 * Everything here is a plain serialisable value. The settings screen is a
 * client component and takes these as props.
 */

export interface PolicySettings {
  paxPolicy: PaxPolicy
  extraPersonPerNightCents: Cents
  paxExemptAgeMax: number
  sofaBedFeeCents: Cents
  /** Null means "unknown, do not constrain" (open-questions.md N8). */
  sofaBedStock: number | null
  earlyCheckInPerHourCents: Cents
  lateCheckOutPerHourCents: Cents
  /** `HH:MM`, 24-hour. */
  checkInTime: string
  checkOutTime: string
  securityDepositCents: Cents
  maxAdvanceBookingDays: number
}

export interface UnitTypeSettings {
  /** The row's uuid. The engine keys unit types by `slug`, not by this. */
  id: string
  slug: string
  name: string
  baseRateCents: Cents
  maxPax: number
  carParks: number
}

export interface AgeBandSettings {
  id: string
  label: string
  minAge: number
  /** Null on the last band, meaning "and above". */
  maxAgeExclusive: number | null
  priceCents: Cents
}

export interface BundleLineSettings {
  bandId: string
  headcount: number
}

export interface BundleSettings {
  id: string
  label: string
  priceCents: Cents
  sortOrder: number
  lines: readonly BundleLineSettings[]
}

export interface FacilitySettings {
  id: string
  /** Derived from the name at creation and never moved by a rename. */
  slug: string
  name: string
  includedInDayPass: boolean
  /** Headroom for day-pass visitors. Null until the client agrees one (C2). */
  dayPassCapacity: number | null
  sortOrder: number
}

export interface RetentionSettings {
  kind: DocumentKind
  months: number
}

export interface BankAccountSettings {
  id: string
  bankName: string
  accountNumber: string
  sortOrder: number
}

export interface PropertySettings {
  propertyId: string
  name: string
  timeZone: string
  currency: string
  /**
   * The optimistic concurrency token. Every save states the value the screen
   * was opened on and is refused if it has moved — so it is carried through the
   * form and never derived, compared or formatted.
   */
  settingsUpdatedAt: string
  policy: PolicySettings
  unitTypes: readonly UnitTypeSettings[]
  bands: readonly AgeBandSettings[]
  bundles: readonly BundleSettings[]
  facilities: readonly FacilitySettings[]
  retention: readonly RetentionSettings[]
  bankAccounts: readonly BankAccountSettings[]
}

/**
 * The pricing engine's view of the settings.
 *
 * Two translations are worth naming. A unit type is keyed by **slug**, because
 * that is what a booking, a URL and the public content module all carry —
 * `unitTypeById()` is called with `'three-bedroom'`, never with a uuid. An age
 * band is keyed by its **uuid**, because a band has no slug and its label is
 * editable: a bundle composition keyed by "Child" would break the moment
 * somebody renamed the band, where a uuid survives every rename.
 *
 * Bands come back ordered by `minAge` from the database, and `bandForAge()`
 * takes the first band that covers an age, so the order matters. It is sorted
 * again here rather than trusted: the cost is nothing and the failure it
 * prevents — a party priced into the wrong band — is silent.
 */
export function configFromSettings(settings: PropertySettings): PropertyConfig {
  return {
    propertyId: settings.propertyId,
    name: settings.name,

    unitTypes: settings.unitTypes.map((unitType) => ({
      id: unitType.slug,
      slug: unitType.slug,
      name: unitType.name,
      baseRatePerNight: unitType.baseRateCents,
      maxPax: unitType.maxPax,
      carParks: unitType.carParks,
    })),

    paxPolicy: settings.policy.paxPolicy,
    extraPersonPerNight: settings.policy.extraPersonPerNightCents,
    paxExemptAgeMax: settings.policy.paxExemptAgeMax,

    sofaBedFlatFee: settings.policy.sofaBedFeeCents,
    sofaBedStock: settings.policy.sofaBedStock,

    earlyCheckInPerHour: settings.policy.earlyCheckInPerHourCents,
    lateCheckOutPerHour: settings.policy.lateCheckOutPerHourCents,
    standardCheckInTime: settings.policy.checkInTime,
    standardCheckOutTime: settings.policy.checkOutTime,

    securityDeposit: settings.policy.securityDepositCents,

    maxAdvanceBookingDays: settings.policy.maxAdvanceBookingDays,

    dayPassAgeBands: [...settings.bands]
      .sort((a, b) => a.minAge - b.minAge)
      .map((band) => ({
        id: band.id,
        label: band.label,
        minAge: band.minAge,
        maxAgeExclusive: band.maxAgeExclusive,
        pricePerPerson: band.priceCents,
      })),

    dayPassBundles: settings.bundles.map((bundle) => ({
      id: bundle.id,
      label: bundle.label,
      composition: Object.fromEntries(
        bundle.lines.map((bundleLine) => [bundleLine.bandId, bundleLine.headcount]),
      ),
      price: bundle.priceCents,
    })),
  }
}

/** The facilities a day pass admits, in display order (prd.md §7.2). */
export function includedFacilities(
  settings: PropertySettings,
): readonly FacilitySettings[] {
  return settings.facilities.filter((facility) => facility.includedInDayPass)
}

/** The retention period for a kind, or null when none is configured. */
export function retentionMonths(
  settings: PropertySettings,
  kind: DocumentKind,
): number | null {
  return settings.retention.find((period) => period.kind === kind)?.months ?? null
}
