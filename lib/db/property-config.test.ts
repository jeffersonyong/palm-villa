import { describe, expect, test } from 'vitest'

import { palmVillaConfig } from '@/lib/domain/config'

import { getPropertyConfig } from './property-config'

/**
 * The live configuration the pricing engine prices with (capability F3).
 *
 * This file replaces `inventory.test.ts`'s "unit type rates match
 * lib/domain/config.ts exactly", and widens it from four rates to the whole
 * of `PropertyConfig`. The claim under test is the one lib/domain/config.ts
 * makes about itself: that `palmVillaConfig` is a true statement of what the
 * property was seeded with. Two things depend on it — every pure pricing test
 * prices against that fixture, and lib/db/settings.test.ts restores the
 * database from it — so if the seed and the fixture drift, both go quietly
 * wrong rather than failing.
 *
 * Identifiers are compared by slug and by label rather than by id: the database
 * issues uuids for bands and bundles, and the fixture cannot know them.
 *
 * Like the 48-unit assertions in inventory.test.ts, this measures the SEED. A
 * database somebody has been changing settings in by hand will fail it until
 * `npm run db:reset`.
 */

describe('getPropertyConfig', () => {
  test('agrees with the configuration the seed documents', async () => {
    const config = await getPropertyConfig()

    expect(config.name).toBe(palmVillaConfig.name)

    expect(
      config.unitTypes.map((unitType) => ({
        id: unitType.id,
        name: unitType.name,
        baseRatePerNight: unitType.baseRatePerNight,
        maxPax: unitType.maxPax,
        carParks: unitType.carParks,
      })),
    ).toEqual(
      palmVillaConfig.unitTypes.map((unitType) => ({
        id: unitType.id,
        name: unitType.name,
        baseRatePerNight: unitType.baseRatePerNight,
        maxPax: unitType.maxPax,
        carParks: unitType.carParks,
      })),
    )

    expect({
      paxPolicy: config.paxPolicy,
      extraPersonPerNight: config.extraPersonPerNight,
      paxExemptAgeMax: config.paxExemptAgeMax,
      sofaBedFlatFee: config.sofaBedFlatFee,
      sofaBedStock: config.sofaBedStock,
      earlyCheckInPerHour: config.earlyCheckInPerHour,
      lateCheckOutPerHour: config.lateCheckOutPerHour,
      standardCheckInTime: config.standardCheckInTime,
      standardCheckOutTime: config.standardCheckOutTime,
      securityDeposit: config.securityDeposit,
      maxAdvanceBookingDays: config.maxAdvanceBookingDays,
    }).toEqual({
      paxPolicy: palmVillaConfig.paxPolicy,
      extraPersonPerNight: palmVillaConfig.extraPersonPerNight,
      paxExemptAgeMax: palmVillaConfig.paxExemptAgeMax,
      sofaBedFlatFee: palmVillaConfig.sofaBedFlatFee,
      sofaBedStock: palmVillaConfig.sofaBedStock,
      earlyCheckInPerHour: palmVillaConfig.earlyCheckInPerHour,
      lateCheckOutPerHour: palmVillaConfig.lateCheckOutPerHour,
      standardCheckInTime: palmVillaConfig.standardCheckInTime,
      standardCheckOutTime: palmVillaConfig.standardCheckOutTime,
      securityDeposit: palmVillaConfig.securityDeposit,
      maxAdvanceBookingDays: palmVillaConfig.maxAdvanceBookingDays,
    })

    expect(
      config.dayPassAgeBands.map((band) => ({
        label: band.label,
        minAge: band.minAge,
        maxAgeExclusive: band.maxAgeExclusive,
        pricePerPerson: band.pricePerPerson,
      })),
    ).toEqual(
      palmVillaConfig.dayPassAgeBands.map((band) => ({
        label: band.label,
        minAge: band.minAge,
        maxAgeExclusive: band.maxAgeExclusive,
        pricePerPerson: band.pricePerPerson,
      })),
    )
  })

  test('resolves each bundle composition to bands that exist', async () => {
    const config = await getPropertyConfig()
    const bandsByLabel = new Map(config.dayPassAgeBands.map((band) => [band.id, band.label]))

    const asLabels = config.dayPassBundles.map((bundle) => ({
      label: bundle.label,
      price: bundle.price,
      composition: Object.fromEntries(
        Object.entries(bundle.composition).map(([bandId, headcount]) => [
          bandsByLabel.get(bandId) ?? `unknown:${bandId}`,
          headcount,
        ]),
      ),
    }))

    // The stored composition is keyed by uuid so a band can be renamed without
    // breaking a bundle. Read back through the bands, it has to be the two
    // shapes prd.md §8.1 confirms.
    expect(asLabels).toEqual([
      { label: '2 adults + 1 child', price: 2000, composition: { Adult: 2, Child: 1 } },
      { label: '2 adults + 2 children', price: 2500, composition: { Adult: 2, Child: 2 } },
    ])
  })

  test('carries the database uuid as the property id, not the fixture slug', async () => {
    const config = await getPropertyConfig()

    expect(config.propertyId).not.toBe(palmVillaConfig.propertyId)
    expect(config.propertyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })
})
