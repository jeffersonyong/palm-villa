import { describe, expect, test } from 'vitest'

import { palmVillaConfig } from './config'
import { bnd } from './money'
import { configFromSettings, includedFacilities, retentionMonths } from './settings'
import type { PropertySettings } from './settings'

/**
 * The projection from stored settings to the pricing engine's config.
 *
 * The engine is tested elsewhere against `palmVillaConfig`; what is tested here
 * is that a database row set produces exactly that object, because everything
 * downstream — every rate, every band, every bundle — is priced through it.
 */

const UNDER_ONE = '11111111-1111-4111-8111-111111111111'
const CHILD = '22222222-2222-4222-8222-222222222222'
const ADULT = '33333333-3333-4333-8333-333333333333'

/** The seed, as `property_settings()` returns it after mapping. */
function seededSettings(): PropertySettings {
  return {
    propertyId: '44444444-4444-4444-8444-444444444444',
    name: 'Palm Villa',
    timeZone: 'Asia/Brunei',
    currency: 'BND',
    settingsUpdatedAt: '2026-09-12T02:00:00.000Z',
    policy: {
      paxPolicy: 'surcharge_threshold',
      extraPersonPerNightCents: bnd(7),
      paxExemptAgeMax: 3,
      sofaBedFeeCents: bnd(28),
      sofaBedStock: null,
      earlyCheckInPerHourCents: bnd(10),
      lateCheckOutPerHourCents: bnd(15),
      checkInTime: '14:00',
      checkOutTime: '12:00',
      securityDepositCents: bnd(100),
      maxAdvanceBookingDays: 62,
    },
    unitTypes: [
      {
        id: 'a1',
        slug: 'two-bedroom',
        name: '2-bedroom',
        baseRateCents: bnd(180),
        maxPax: 6,
        carParks: 2,
      },
      {
        id: 'a2',
        slug: 'three-bedroom',
        name: '3-bedroom',
        baseRateCents: bnd(200),
        maxPax: 8,
        carParks: 2,
      },
      {
        id: 'a3',
        slug: 'four-bedroom',
        name: '4-bedroom',
        baseRateCents: bnd(250),
        maxPax: 10,
        carParks: 2,
      },
      {
        id: 'a4',
        slug: 'semi-detached',
        name: 'Semi-detached',
        baseRateCents: bnd(320),
        maxPax: 20,
        carParks: 4,
      },
    ],
    bands: [
      { id: UNDER_ONE, label: 'Under 1', minAge: 0, maxAgeExclusive: 1, priceCents: bnd(0) },
      { id: CHILD, label: 'Child', minAge: 1, maxAgeExclusive: 12, priceCents: bnd(5) },
      { id: ADULT, label: 'Adult', minAge: 12, maxAgeExclusive: null, priceCents: bnd(10) },
    ],
    bundles: [
      {
        id: 'b1',
        label: '2 adults + 1 child',
        priceCents: bnd(20),
        sortOrder: 1,
        lines: [
          { bandId: ADULT, headcount: 2 },
          { bandId: CHILD, headcount: 1 },
        ],
      },
      {
        id: 'b2',
        label: '2 adults + 2 children',
        priceCents: bnd(25),
        sortOrder: 2,
        lines: [
          { bandId: ADULT, headcount: 2 },
          { bandId: CHILD, headcount: 2 },
        ],
      },
    ],
    facilities: [
      {
        id: 'f1',
        slug: 'swimming-pool',
        name: 'Swimming pool',
        includedInDayPass: true,
        dayPassCapacity: null,
        sortOrder: 1,
      },
      {
        id: 'f2',
        slug: 'gym',
        name: 'Gym',
        includedInDayPass: false,
        dayPassCapacity: null,
        sortOrder: 2,
      },
    ],
    retention: [
      { kind: 'identity', months: 12 },
      { kind: 'payment_slip', months: 84 },
    ],
    bankAccounts: [{ id: 'k1', bankName: 'BIBD', accountNumber: '0018-02-0010611', sortOrder: 1 }],
  }
}

describe('configFromSettings', () => {
  test('reproduces the seeded configuration the pricing engine is tested against', () => {
    const config = configFromSettings(seededSettings())

    // Everything but the identifiers, which are uuids in the database and
    // slugs in the fixture. The figures are the contract.
    expect(config.unitTypes.map((type) => [type.id, type.baseRatePerNight, type.maxPax])).toEqual(
      palmVillaConfig.unitTypes.map((type) => [type.id, type.baseRatePerNight, type.maxPax]),
    )
    expect(config.extraPersonPerNight).toBe(palmVillaConfig.extraPersonPerNight)
    expect(config.securityDeposit).toBe(palmVillaConfig.securityDeposit)
    expect(config.paxPolicy).toBe(palmVillaConfig.paxPolicy)
    expect(config.standardCheckInTime).toBe(palmVillaConfig.standardCheckInTime)
    expect(config.maxAdvanceBookingDays).toBe(palmVillaConfig.maxAdvanceBookingDays)
    expect(config.dayPassAgeBands.map((band) => band.pricePerPerson)).toEqual(
      palmVillaConfig.dayPassAgeBands.map((band) => band.pricePerPerson),
    )
  })

  test('keys a unit type by its slug, because that is what a booking carries', () => {
    const config = configFromSettings(seededSettings())

    expect(config.unitTypes.map((type) => type.id)).toEqual([
      'two-bedroom',
      'three-bedroom',
      'four-bedroom',
      'semi-detached',
    ])
  })

  test('keys an age band by its uuid, so renaming a band cannot break a bundle', () => {
    const config = configFromSettings(seededSettings())

    expect(config.dayPassAgeBands.map((band) => band.id)).toEqual([UNDER_ONE, CHILD, ADULT])
    expect(config.dayPassBundles[0]?.composition).toEqual({ [ADULT]: 2, [CHILD]: 1 })
  })

  test('orders bands by the age they start at, whatever order they arrive in', () => {
    const settings = seededSettings()
    const shuffled: PropertySettings = {
      ...settings,
      bands: [settings.bands[2]!, settings.bands[0]!, settings.bands[1]!],
    }

    expect(configFromSettings(shuffled).dayPassAgeBands.map((band) => band.minAge)).toEqual([
      0, 1, 12,
    ])
  })

  test('carries an unknown sofa bed stock through as null rather than zero', () => {
    // Zero would mean "there are none, refuse every request"; null means
    // nobody has counted them (open-questions.md N8).
    expect(configFromSettings(seededSettings()).sofaBedStock).toBeNull()
  })
})

describe('includedFacilities', () => {
  test('lists only what a day pass admits', () => {
    expect(includedFacilities(seededSettings()).map((facility) => facility.name)).toEqual([
      'Swimming pool',
    ])
  })
})

describe('retentionMonths', () => {
  test('finds a configured period', () => {
    expect(retentionMonths(seededSettings(), 'identity')).toBe(12)
  })

  test('returns null for a kind with no row, rather than inventing a period', () => {
    expect(retentionMonths(seededSettings(), 'accounting_pack')).toBeNull()
  })
})
