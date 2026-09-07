import { describe, expect, test } from 'vitest'

import { bnd } from './money'
import {
  bankAccountsDraftFrom,
  checkBankAccountsDraft,
  checkDayPassDraft,
  checkPricingDraft,
  checkRetentionDraft,
  dayPassDraftFrom,
  isSettingsDraftDirty,
  pricingDraftFrom,
  retentionDraftFrom,
  type BandDraft,
  type DayPassDraft,
  type PricingDraft,
} from './settings-checks'
import type { PropertySettings } from './settings'

/**
 * The settings validators (capability F3).
 *
 * The band coverage rules carry most of the weight here: they are the only
 * settings mistake whose consequence is silent and late — a gap between bands
 * does not fail the save, it fails a quote weeks later for the one party whose
 * child is the age nobody covered.
 */

const CHILD = '22222222-2222-4222-8222-222222222222'
const ADULT = '33333333-3333-4333-8333-333333333333'

function settings(): PropertySettings {
  return {
    propertyId: 'p1',
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
        id: 'a2',
        slug: 'three-bedroom',
        name: '3-bedroom',
        baseRateCents: bnd(200),
        maxPax: 8,
        carParks: 2,
      },
    ],
    bands: [
      { id: CHILD, label: 'Child', minAge: 0, maxAgeExclusive: 12, priceCents: bnd(5) },
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
    ],
    retention: [
      { kind: 'identity', months: 12 },
      { kind: 'payment_slip', months: 84 },
      { kind: 'inspection_photo', months: 24 },
      { kind: 'accounting_pack', months: 84 },
    ],
    bankAccounts: [
      { id: 'k1', bankName: 'BIBD', accountNumber: '0018-02-0010611', sortOrder: 1 },
    ],
  }
}

function fieldsOf(result: ReturnType<typeof checkDayPassDraft>): readonly string[] {
  return result.ok ? [] : result.problems.map((problem) => problem.field)
}

describe('checkPricingDraft', () => {
  test('accepts what the seed stores, unchanged', () => {
    const result = checkPricingDraft(pricingDraftFrom(settings()))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.unitTypes[0]).toEqual({
      slug: 'three-bedroom',
      base_rate_cents: bnd(200),
      max_pax: 8,
      car_parks: 2,
    })
    expect(result.value.policy.security_deposit_cents).toBe(bnd(100))
    expect(result.value.policy.sofa_bed_stock).toBeNull()
  })

  test('refuses an amount with a comma rather than repairing it', () => {
    const draft = pricingDraftFrom(settings())
    const withComma: PricingDraft = {
      ...draft,
      unitTypes: [{ ...draft.unitTypes[0]!, baseRate: '1,200.00' }],
    }

    const result = checkPricingDraft(withComma)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.field)).toContain('unitTypes.0.baseRate')
  })

  test('refuses a clock time that is not one', () => {
    const draft = pricingDraftFrom(settings())

    const result = checkPricingDraft({
      ...draft,
      policy: { ...draft.policy, checkInTime: '2pm' },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.field)).toContain('policy.checkInTime')
  })

  test('reads a blank sofa bed stock as unknown, not as none', () => {
    const draft = pricingDraftFrom(settings())

    const result = checkPricingDraft({
      ...draft,
      policy: { ...draft.policy, sofaBedStock: '  ' },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.policy.sofa_bed_stock).toBeNull()
  })

  test('reports every bad field at once, not just the first', () => {
    const draft = pricingDraftFrom(settings())

    const result = checkPricingDraft({
      unitTypes: [{ ...draft.unitTypes[0]!, baseRate: 'free', maxPax: '0' }],
      policy: { ...draft.policy, securityDeposit: 'BND 100' },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.field)).toEqual([
      'unitTypes.0.baseRate',
      'unitTypes.0.maxPax',
      'policy.securityDeposit',
    ])
  })
})

describe('checkDayPassDraft — age band coverage', () => {
  function bands(rows: readonly Partial<BandDraft>[]): DayPassDraft {
    return {
      bands: rows.map((row, index) => ({
        key: row.key ?? `k${index}`,
        id: row.id ?? null,
        label: row.label ?? `Band ${index}`,
        minAge: row.minAge ?? '0',
        maxAgeExclusive: row.maxAgeExclusive ?? '',
        price: row.price ?? '5.00',
      })),
      bundles: [],
      facilities: [],
    }
  }

  test('accepts bands that cover every age from zero', () => {
    const result = checkDayPassDraft(
      bands([
        { label: 'Child', minAge: '0', maxAgeExclusive: '12' },
        { label: 'Adult', minAge: '12', maxAgeExclusive: '' },
      ]),
    )

    expect(result.ok).toBe(true)
  })

  test('refuses bands that leave a gap', () => {
    const result = checkDayPassDraft(
      bands([
        { label: 'Child', minAge: '0', maxAgeExclusive: '11' },
        { label: 'Adult', minAge: '12', maxAgeExclusive: '' },
      ]),
    )

    expect(fieldsOf(result)).toContain('bands.0.maxAgeExclusive')
  })

  test('refuses bands that overlap', () => {
    const result = checkDayPassDraft(
      bands([
        { label: 'Child', minAge: '0', maxAgeExclusive: '14' },
        { label: 'Adult', minAge: '12', maxAgeExclusive: '' },
      ]),
    )

    expect(fieldsOf(result)).toContain('bands.0.maxAgeExclusive')
  })

  test('refuses bands that do not start at zero, so no age is unpriced', () => {
    const result = checkDayPassDraft(
      bands([
        { label: 'Child', minAge: '1', maxAgeExclusive: '12' },
        { label: 'Adult', minAge: '12', maxAgeExclusive: '' },
      ]),
    )

    expect(fieldsOf(result)).toContain('bands.0.minAge')
  })

  test('refuses a closed last band, so an older guest still has a price', () => {
    const result = checkDayPassDraft(
      bands([
        { label: 'Child', minAge: '0', maxAgeExclusive: '12' },
        { label: 'Adult', minAge: '12', maxAgeExclusive: '65' },
      ]),
    )

    expect(fieldsOf(result)).toContain('bands.1.maxAgeExclusive')
  })

  test('refuses an open-ended band that is not the last', () => {
    const result = checkDayPassDraft(
      bands([
        { label: 'Child', minAge: '0', maxAgeExclusive: '' },
        { label: 'Adult', minAge: '12', maxAgeExclusive: '' },
      ]),
    )

    expect(fieldsOf(result)).toContain('bands.0.maxAgeExclusive')
  })

  test('refuses two bands with the same name', () => {
    const result = checkDayPassDraft(
      bands([
        { label: 'Adult', minAge: '0', maxAgeExclusive: '12' },
        { label: 'adult', minAge: '12', maxAgeExclusive: '' },
      ]),
    )

    expect(fieldsOf(result)).toContain('bands.1.label')
  })

  test('refuses no bands at all', () => {
    expect(fieldsOf(checkDayPassDraft(bands([])))).toContain('bands')
  })
})

describe('checkDayPassDraft — bundles and facilities', () => {
  test('accepts what the seed stores, unchanged', () => {
    const result = checkDayPassDraft(dayPassDraftFrom(settings()))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.bundles[0]?.lines).toEqual([
      { band_key: ADULT, headcount: 2 },
      { band_key: CHILD, headcount: 1 },
    ])
    expect(result.value.facilities[0]?.included_in_day_pass).toBe(true)
    expect(result.value.facilities[0]?.day_pass_capacity).toBeNull()
  })

  test('drops a bundle line whose headcount is blank or zero', () => {
    const draft = dayPassDraftFrom(settings())

    const result = checkDayPassDraft({
      ...draft,
      bundles: [{ ...draft.bundles[0]!, lines: { [ADULT]: '2', [CHILD]: '0' } }],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.bundles[0]?.lines).toEqual([{ band_key: ADULT, headcount: 2 }])
  })

  test('refuses a bundle that includes nobody', () => {
    const draft = dayPassDraftFrom(settings())

    const result = checkDayPassDraft({
      ...draft,
      bundles: [{ ...draft.bundles[0]!, lines: { [ADULT]: '', [CHILD]: '' } }],
    })

    expect(fieldsOf(result)).toContain('bundles.0.lines')
  })

  test('ignores a bundle line naming a band the submission no longer carries', () => {
    // The band is gone from the form, so its column is gone too. The line is
    // dropped here and the DATABASE is what refuses the removal, naming the
    // bundle — this check exists so the payload is well-formed either way.
    const draft = dayPassDraftFrom(settings())

    const result = checkDayPassDraft({
      ...draft,
      bands: draft.bands.filter((band) => band.key !== CHILD),
      bundles: [{ ...draft.bundles[0]!, lines: { [ADULT]: '2', [CHILD]: '1' } }],
    })

    if (!result.ok) return
    expect(result.value.bundles[0]?.lines).toEqual([{ band_key: ADULT, headcount: 2 }])
  })

  test('refuses two facilities with the same name', () => {
    const draft = dayPassDraftFrom(settings())

    const result = checkDayPassDraft({
      ...draft,
      facilities: [
        draft.facilities[0]!,
        { key: 'new-1', id: null, name: 'Swimming Pool', includedInDayPass: true, capacity: '' },
      ],
    })

    expect(fieldsOf(result)).toContain('facilities.1.name')
  })

  test('accepts a capacity, and reads a blank one as not yet agreed', () => {
    const draft = dayPassDraftFrom(settings())

    const result = checkDayPassDraft({
      ...draft,
      facilities: [{ ...draft.facilities[0]!, capacity: '80' }],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.facilities[0]?.day_pass_capacity).toBe(80)
  })
})

describe('checkRetentionDraft', () => {
  test('accepts the four seeded periods', () => {
    const result = checkRetentionDraft(retentionDraftFrom(settings()))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      identity: 12,
      payment_slip: 84,
      inspection_photo: 24,
      accounting_pack: 84,
    })
  })

  test('refuses a period of zero months', () => {
    const result = checkRetentionDraft({ ...retentionDraftFrom(settings()), identity: '0' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.field)).toContain('retention.identity')
  })

  test('refuses a blank period rather than treating it as forever', () => {
    const result = checkRetentionDraft({ ...retentionDraftFrom(settings()), payment_slip: '' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.field)).toContain('retention.payment_slip')
  })
})

describe('checkBankAccountsDraft', () => {
  test('accepts the seeded account', () => {
    const result = checkBankAccountsDraft(bankAccountsDraftFrom(settings()))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value[0]).toEqual({
      id: 'k1',
      bank_name: 'BIBD',
      account_number: '0018-02-0010611',
    })
  })

  test('refuses the same account number twice', () => {
    const result = checkBankAccountsDraft([
      ...bankAccountsDraftFrom(settings()),
      { key: 'new-1', id: null, bankName: 'Baiduri', accountNumber: '0018-02-0010611' },
    ])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.field)).toContain('accounts.1.accountNumber')
  })

  test('refuses a blank account number', () => {
    const result = checkBankAccountsDraft([
      { key: 'new-1', id: null, bankName: 'Baiduri', accountNumber: '   ' },
    ])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.field)).toContain('accounts.0.accountNumber')
  })

  test('accepts no accounts at all — a property may not have said yet', () => {
    expect(checkBankAccountsDraft([]).ok).toBe(true)
  })
})

describe('isSettingsDraftDirty', () => {
  test('is clean for the draft as it was loaded', () => {
    const saved = pricingDraftFrom(settings())

    expect(isSettingsDraftDirty(pricingDraftFrom(settings()), saved)).toBe(false)
  })

  test('is clean when a value is retyped with surrounding space', () => {
    // What stops Save re-enabling after an edit that changes nothing, and with
    // it the no-op write and its audit event.
    const saved = pricingDraftFrom(settings())

    expect(
      isSettingsDraftDirty(
        { ...saved, policy: { ...saved.policy, checkInTime: ' 14:00 ' } },
        saved,
      ),
    ).toBe(false)
  })

  test('is dirty when a figure moves', () => {
    const saved = pricingDraftFrom(settings())

    expect(
      isSettingsDraftDirty(
        { ...saved, unitTypes: [{ ...saved.unitTypes[0]!, baseRate: '220.00' }] },
        saved,
      ),
    ).toBe(true)
  })

  test('is dirty when a row is added or removed', () => {
    const saved = bankAccountsDraftFrom(settings())

    expect(isSettingsDraftDirty([], saved)).toBe(true)
  })

  test('ignores the order keys happen to sit in', () => {
    const saved = bankAccountsDraftFrom(settings())
    const rebuilt = saved.map((account) => ({
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      id: account.id,
      key: account.key,
    }))

    expect(isSettingsDraftDirty(rebuilt, saved)).toBe(false)
  })
})
