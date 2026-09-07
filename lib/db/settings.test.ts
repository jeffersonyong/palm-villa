import { afterEach, beforeAll, describe, expect, test } from 'vitest'

import { palmVillaConfig } from '@/lib/domain/config'
import { bnd } from '@/lib/domain/money'
import type { PropertySettings } from '@/lib/domain/settings'

import {
  readPropertySettings,
  saveBankAccounts,
  saveDayPassSettings,
  saveDocumentRetention,
  savePricingSettings,
} from './settings'
import { givenDepartedBooking, givenDocument, givenTransferBooking } from './test/factory'
import { auditEventsFor } from './test/inspect'
import { dataClient } from '@/lib/supabase/data'
import { currentPropertyId } from './property'

/**
 * The property settings, against the real database (capability F3).
 *
 * ── Why this file puts everything back ─────────────────────────────────────
 *
 * `clearTransactionalData` deliberately leaves settings alone: they are seeded
 * configuration, not transactional data, and every pricing test in the suite
 * depends on the seeded figures being there. This file is the one that changes
 * them on purpose, so it is the one that restores them — the position
 * units.test.ts takes for the unit registry, and for the same reason.
 *
 * Restoring writes its own audit events, which is correct and harmless: the
 * table is append-only by design and no test asserts a global count.
 */

/**
 * The settings, put back exactly as the seed leaves them.
 *
 * Unconditional, and it does not trust what is in the database when it starts.
 * An earlier run that failed part way through would otherwise be captured as
 * "the seed" by the next one, and every assertion about a seeded figure would
 * quietly measure the wreckage instead — which is precisely what happened the
 * first time this file was written against a snapshot.
 *
 * The row tables are rebuilt through `seed_property_settings()`, the same
 * function the migration and supabase/seed.sql call, so there is no second copy
 * of the bands, bundles, facilities or accounts here. The policy figures come
 * from `palmVillaConfig`, which lib/domain/config.ts documents as the statement
 * of what the property was seeded with — and lib/db/property-config.test.ts is
 * what keeps that claim true.
 */
async function restoreSeededSettings(): Promise<void> {
  const propertyId = await currentPropertyId()

  await dataClient().from('day_pass_bundle').delete().eq('property_id', propertyId)
  await dataClient().from('day_pass_age_band').delete().eq('property_id', propertyId)
  await dataClient().from('facility').delete().eq('property_id', propertyId)
  await dataClient().from('bank_account').delete().eq('property_id', propertyId)
  await dataClient().rpc('seed_property_settings', { p_property_id: propertyId })

  const token = (await readPropertySettings()).settingsUpdatedAt

  const restored = await savePricingSettings({
    expectedUpdatedAt: token,
    pricing: {
      unitTypes: palmVillaConfig.unitTypes.map((unitType) => ({
        slug: unitType.slug,
        base_rate_cents: unitType.baseRatePerNight,
        max_pax: unitType.maxPax,
        car_parks: unitType.carParks,
      })),
      policy: {
        pax_policy: palmVillaConfig.paxPolicy,
        extra_person_per_night_cents: palmVillaConfig.extraPersonPerNight,
        pax_exempt_age_max: palmVillaConfig.paxExemptAgeMax,
        sofa_bed_fee_cents: palmVillaConfig.sofaBedFlatFee,
        sofa_bed_stock: palmVillaConfig.sofaBedStock,
        early_check_in_per_hour_cents: palmVillaConfig.earlyCheckInPerHour,
        late_check_out_per_hour_cents: palmVillaConfig.lateCheckOutPerHour,
        check_in_time: palmVillaConfig.standardCheckInTime ?? '14:00',
        check_out_time: palmVillaConfig.standardCheckOutTime,
        security_deposit_cents: palmVillaConfig.securityDeposit,
        max_advance_booking_days: palmVillaConfig.maxAdvanceBookingDays,
      },
    },
    actorId: null,
  })

  if (!restored.ok) {
    throw new Error(`Could not restore the seeded pricing: ${restored.error.message}`)
  }

  const periods = await saveDocumentRetention({
    expectedUpdatedAt: restored.settingsUpdatedAt,
    months: {
      identity: 12,
      payment_slip: 84,
      inspection_photo: 24,
      accounting_pack: 84,
    },
    actorId: null,
  })

  if (!periods.ok) {
    throw new Error(`Could not restore the seeded retention: ${periods.error.message}`)
  }
}

beforeAll(restoreSeededSettings)
afterEach(restoreSeededSettings)

/** The day-pass payload for what is currently stored — the "change nothing" save. */
function dayPassAsStored(settings: PropertySettings) {
  return {
    bands: settings.bands.map((band) => ({
      key: band.id,
      id: band.id,
      label: band.label,
      min_age: band.minAge,
      max_age_exclusive: band.maxAgeExclusive,
      price_cents: band.priceCents,
    })),
    bundles: settings.bundles.map((bundle) => ({
      id: bundle.id,
      label: bundle.label,
      price_cents: bundle.priceCents,
      lines: bundle.lines.map((bundleLine) => ({
        band_key: bundleLine.bandId,
        headcount: bundleLine.headcount,
      })),
    })),
    facilities: settings.facilities.map((facility) => ({
      id: facility.id,
      name: facility.name,
      included_in_day_pass: facility.includedInDayPass,
      day_pass_capacity: facility.dayPassCapacity,
    })),
  }
}

function pricingAsStored(settings: PropertySettings) {
  return {
    unitTypes: settings.unitTypes.map((unitType) => ({
      slug: unitType.slug,
      base_rate_cents: unitType.baseRateCents,
      max_pax: unitType.maxPax,
      car_parks: unitType.carParks,
    })),
    policy: {
      pax_policy: settings.policy.paxPolicy,
      extra_person_per_night_cents: settings.policy.extraPersonPerNightCents,
      pax_exempt_age_max: settings.policy.paxExemptAgeMax,
      sofa_bed_fee_cents: settings.policy.sofaBedFeeCents,
      sofa_bed_stock: settings.policy.sofaBedStock,
      early_check_in_per_hour_cents: settings.policy.earlyCheckInPerHourCents,
      late_check_out_per_hour_cents: settings.policy.lateCheckOutPerHourCents,
      check_in_time: settings.policy.checkInTime,
      check_out_time: settings.policy.checkOutTime,
      security_deposit_cents: settings.policy.securityDepositCents,
      max_advance_booking_days: settings.policy.maxAdvanceBookingDays,
    },
  }
}

describe('readPropertySettings', () => {
  test('returns the seeded configuration in one read', async () => {
    const settings = await readPropertySettings()

    expect(settings.name).toBe('Palm Villa')
    expect(settings.timeZone).toBe('Asia/Brunei')
    expect(settings.policy.securityDepositCents).toBe(bnd(100))
    expect(settings.unitTypes).toHaveLength(4)
    expect(settings.bands.map((band) => band.label)).toEqual(['Under 1', 'Child', 'Adult'])
    expect(settings.bundles).toHaveLength(2)
    expect(settings.facilities).toHaveLength(7)
    expect(settings.retention).toHaveLength(4)
    expect(settings.bankAccounts.map((account) => account.bankName)).toEqual(['BIBD', 'Baiduri'])
  })

  test('seeds the facilities the client confirmed, and no capacity for any of them', async () => {
    const settings = await readPropertySettings()
    const included = settings.facilities
      .filter((facility) => facility.includedInDayPass)
      .map((facility) => facility.name)

    // prd.md §7.2, answered 10 September 2026. The sauna is out because he
    // named it neither way, which is the half that cannot mis-sell a pass.
    expect(included).toEqual(['Swimming pool', 'Water park', "Indoor children's playground"])
    expect(settings.facilities.every((facility) => facility.dayPassCapacity === null)).toBe(true)
  })

  test('gives a facility a slug that survives its name', async () => {
    const settings = await readPropertySettings()
    const playroom = settings.facilities.find((facility) => facility.name.startsWith('Indoor'))

    expect(playroom?.slug).toBe('indoor-childrens-playground')
  })
})

describe('savePricingSettings', () => {
  test('changes a rate and records only what moved', async () => {
    const settings = await readPropertySettings()
    const pricing = pricingAsStored(settings)
    const threeBed = settings.unitTypes.find((unitType) => unitType.slug === 'three-bedroom')

    const result = await savePricingSettings({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      pricing: {
        ...pricing,
        unitTypes: pricing.unitTypes.map((unitType) =>
          unitType.slug === 'three-bedroom'
            ? { ...unitType, base_rate_cents: bnd(220) }
            : unitType,
        ),
      },
      actorId: null,
    })

    expect(result).toMatchObject({ ok: true, changed: 1 })

    // `auditEventsFor` reads oldest-first and setup.ts never clears
    // `audit_event` — it is append-only by design — so the event this test
    // wrote is the last one, not the only one.
    const events = await auditEventsFor(threeBed!.id)

    expect(events.at(-1)).toMatchObject({
      action: 'unit_type.updated',
      before: { base_rate_cents: bnd(200) },
      after: { base_rate_cents: bnd(220) },
    })

    const after = await readPropertySettings()

    expect(
      after.unitTypes.find((unitType) => unitType.slug === 'three-bedroom')?.baseRateCents,
    ).toBe(bnd(220))
  })

  test('writes nothing and does not move the token when nothing changed', async () => {
    const settings = await readPropertySettings()

    const result = await savePricingSettings({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      pricing: pricingAsStored(settings),
      actorId: null,
    })

    expect(result).toEqual({
      ok: true,
      changed: 0,
      settingsUpdatedAt: settings.settingsUpdatedAt,
    })
  })

  test('refuses a save whose token has moved, and changes nothing', async () => {
    const settings = await readPropertySettings()
    const pricing = pricingAsStored(settings)

    await savePricingSettings({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      pricing: {
        ...pricing,
        policy: { ...pricing.policy, security_deposit_cents: bnd(150) },
      },
      actorId: null,
    })

    // The second save still holds the token the screen was opened on.
    const second = await savePricingSettings({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      pricing: {
        ...pricing,
        policy: { ...pricing.policy, security_deposit_cents: bnd(999) },
      },
      actorId: null,
    })

    expect(second).toMatchObject({ ok: false, error: { code: 'changed' } })

    const after = await readPropertySettings()

    expect(after.policy.securityDepositCents).toBe(bnd(150))
  })

  test('refuses a unit type that does not exist', async () => {
    const settings = await readPropertySettings()

    const result = await savePricingSettings({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      pricing: {
        ...pricingAsStored(settings),
        unitTypes: [
          { slug: 'penthouse', base_rate_cents: bnd(500), max_pax: 2, car_parks: 1 },
        ],
      },
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'unit_type_not_found' } })
  })
})

describe('saveDayPassSettings', () => {
  test('adds a band and a bundle that uses it, in one save', async () => {
    const settings = await readPropertySettings()
    const stored = dayPassAsStored(settings)
    const adult = settings.bands.find((band) => band.maxAgeExclusive === null)

    const result = await saveDayPassSettings({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      dayPass: {
        ...stored,
        bands: [
          ...stored.bands.map((band) =>
            band.id === adult!.id ? { ...band, max_age_exclusive: 60 } : band,
          ),
          {
            key: 'new-senior',
            id: null,
            label: 'Senior',
            min_age: 60,
            max_age_exclusive: null,
            price_cents: bnd(7),
          },
        ],
        bundles: [
          ...stored.bundles,
          {
            id: null,
            label: '2 seniors',
            price_cents: bnd(12),
            lines: [{ band_key: 'new-senior', headcount: 2 }],
          },
        ],
      },
      actorId: null,
    })

    expect(result).toMatchObject({ ok: true })

    const after = await readPropertySettings()
    const senior = after.bands.find((band) => band.label === 'Senior')
    const bundle = after.bundles.find((row) => row.label === '2 seniors')

    expect(senior?.minAge).toBe(60)
    expect(bundle?.lines).toEqual([{ bandId: senior!.id, headcount: 2 }])
  })

  test('refuses removing a band a bundle still uses, and names it', async () => {
    const settings = await readPropertySettings()
    const stored = dayPassAsStored(settings)
    const child = settings.bands.find((band) => band.label === 'Child')

    const result = await saveDayPassSettings({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      dayPass: {
        ...stored,
        bands: stored.bands
          .filter((band) => band.id !== child!.id)
          .map((band) => (band.min_age === 0 ? { ...band, max_age_exclusive: 12 } : band)),
      },
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'band_in_use' } })
    if (result.ok) return
    expect(result.error.message).toContain('Child')

    expect((await readPropertySettings()).bands).toHaveLength(3)
  })

  test('refuses bands that leave an age uncovered', async () => {
    const settings = await readPropertySettings()
    const stored = dayPassAsStored(settings)

    const result = await saveDayPassSettings({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      dayPass: {
        ...stored,
        bands: stored.bands.map((band) =>
          band.min_age === 0 ? { ...band, min_age: 2 } : band,
        ),
      },
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'bands_not_contiguous' } })
  })

  test('records a facility being taken out of the day pass', async () => {
    const settings = await readPropertySettings()
    const stored = dayPassAsStored(settings)
    const waterPark = settings.facilities.find((facility) => facility.name === 'Water park')

    const result = await saveDayPassSettings({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      dayPass: {
        ...stored,
        facilities: stored.facilities.map((facility) =>
          facility.id === waterPark!.id
            ? { ...facility, included_in_day_pass: false }
            : facility,
        ),
      },
      actorId: null,
    })

    expect(result).toMatchObject({ ok: true, changed: 1 })

    const events = await auditEventsFor(waterPark!.id)

    expect(events.at(-1)).toMatchObject({
      action: 'facility.updated',
      before: { included_in_day_pass: true },
      after: { included_in_day_pass: false },
    })
  })

  test('keeps a facility slug across a rename', async () => {
    const settings = await readPropertySettings()
    const stored = dayPassAsStored(settings)
    const gym = settings.facilities.find((facility) => facility.name === 'Gym')

    await saveDayPassSettings({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      dayPass: {
        ...stored,
        facilities: stored.facilities.map((facility) =>
          facility.id === gym!.id ? { ...facility, name: 'Fitness room' } : facility,
        ),
      },
      actorId: null,
    })

    const after = await readPropertySettings()
    const renamed = after.facilities.find((facility) => facility.id === gym!.id)

    // What a public page joins on must not move when the sign on the door does
    // (architecture.md §8, capability F7).
    expect(renamed?.name).toBe('Fitness room')
    expect(renamed?.slug).toBe('gym')
  })
})

describe('saveDocumentRetention', () => {
  const STAY = { unitRef: '3B-07', checkIn: '2026-10-02', checkOut: '2026-10-05' }

  test('re-anchors an identity document already on file', async () => {
    const departed = await givenDepartedBooking(STAY)
    const documentId = await givenDocument({ kind: 'identity', bookingId: departed.booking.id })
    const settings = await readPropertySettings()

    const result = await saveDocumentRetention({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      months: { identity: 6, payment_slip: 84, inspection_photo: 24, accounting_pack: 84 },
      actorId: null,
    })

    expect(result).toMatchObject({ ok: true, changed: 1 })

    const { data } = await dataClient()
      .from('document')
      .select('retain_until')
      .eq('id', documentId)
      .single()

    // Six months after check-out, at midnight in Brunei — 16:00 UTC the day
    // before, which is what makes the timezone half of this worth asserting.
    expect((data as { retain_until: string }).retain_until).toBe('2027-04-04T16:00:00+00:00')
  })

  test('records which period changed, and how many files moved with it', async () => {
    const departed = await givenDepartedBooking(STAY)

    await givenDocument({ kind: 'identity', bookingId: departed.booking.id })

    const settings = await readPropertySettings()
    const propertyId = await currentPropertyId()

    await saveDocumentRetention({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      months: { identity: 6, payment_slip: 84, inspection_photo: 24, accounting_pack: 84 },
      actorId: null,
    })

    const events = await auditEventsFor(propertyId)
    const retention = events.findLast(
      (event) => event.action === 'document_retention.updated',
    )

    // `kind` survives on both sides deliberately: it is what the event is
    // about, so a diff that stripped it would leave "12 became 6" governing
    // nothing nameable.
    expect(retention).toMatchObject({
      before: { kind: 'identity', months: 12 },
      after: { kind: 'identity', months: 6, documents_rescheduled: 1 },
    })
  })

  test('anchors a slip on when it was taken, not on the stay', async () => {
    const { booking, payment } = await givenTransferBooking(STAY)
    const documentId = await givenDocument({
      kind: 'payment_slip',
      bookingId: booking.id,
      paymentId: payment.id,
    })

    const settings = await readPropertySettings()

    await saveDocumentRetention({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      months: { identity: 12, payment_slip: 12, inspection_photo: 24, accounting_pack: 84 },
      actorId: null,
    })

    const { data } = await dataClient()
      .from('document')
      .select('uploaded_at, retain_until')
      .eq('id', documentId)
      .single()

    const row = data as { uploaded_at: string; retain_until: string }
    const expected = new Date(row.uploaded_at)

    expected.setUTCMonth(expected.getUTCMonth() + 12)

    expect(new Date(row.retain_until).getTime()).toBe(expected.getTime())
  })

  test('refuses a period nobody could have meant', async () => {
    const settings = await readPropertySettings()

    const result = await saveDocumentRetention({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      months: { identity: 0, payment_slip: 84, inspection_photo: 24, accounting_pack: 84 },
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'months_invalid' } })
    if (result.ok) return
    expect(result.error.message).toContain('identity')
  })
})

describe('saveBankAccounts', () => {
  test('adds, edits and removes, recording each', async () => {
    const settings = await readPropertySettings()
    const bibd = settings.bankAccounts.find((account) => account.bankName === 'BIBD')

    const result = await saveBankAccounts({
      expectedUpdatedAt: settings.settingsUpdatedAt,
      accounts: [
        { id: bibd!.id, bank_name: 'BIBD', account_number: '0018-02-9999999' },
        { id: null, bank_name: 'Standard Chartered', account_number: '11-22-33' },
      ],
      actorId: null,
    })

    expect(result).toMatchObject({ ok: true, changed: 3 })

    const after = await readPropertySettings()

    expect(after.bankAccounts.map((account) => account.bankName)).toEqual([
      'BIBD',
      'Standard Chartered',
    ])

    const events = await auditEventsFor(bibd!.id)

    expect(events.at(-1)).toMatchObject({
      action: 'bank_account.updated',
      before: { account_number: '0018-02-0010611' },
      after: { account_number: '0018-02-9999999' },
    })
  })
})
