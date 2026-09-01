import { describe, expect, test } from 'vitest'

import { palmVillaConfig, type PropertyConfig } from '../config'
import { bnd } from '../money'
import { partyFromAges, priceStay, type StayPricingInput } from './stay'

/**
 * Stay pricing tests.
 *
 * Coverage here is mandatory, not pragmatic (architecture.md §2). The arithmetic
 * is checked against prd.md §8.2 by hand rather than against the implementation,
 * so a wrong formula fails rather than being enshrined.
 */

/** A fixed "today" so the advance-booking window never depends on the clock. */
const TODAY = '2026-09-01'

function input(overrides: Partial<StayPricingInput> = {}): StayPricingInput {
  return {
    unitTypeId: 'three-bedroom',
    checkIn: '2026-09-12',
    checkOut: '2026-09-14',
    party: { chargeableGuests: 4, exemptGuests: 0 },
    sofaBeds: 0,
    earlyCheckInHours: 0,
    lateCheckOutHours: 0,
    ...overrides,
  }
}

function withConfig(overrides: Partial<PropertyConfig>): PropertyConfig {
  return { ...palmVillaConfig, ...overrides }
}

describe('priceStay — base accommodation', () => {
  test('charges the nightly rate once per night', () => {
    const result = priceStay(input(), palmVillaConfig, TODAY)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.nights).toBe(2)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toMatchObject({
      type: 'accommodation',
      quantity: 2,
      unitPrice: bnd(200),
      amount: bnd(400),
    })
    expect(result.total).toBe(bnd(400))
  })

  test.each([
    ['two-bedroom', 180],
    ['three-bedroom', 200],
    ['four-bedroom', 250],
    ['semi-detached', 320],
  ])('%s is priced at the rate in prd.md §7.1', (unitTypeId, nightlyRate) => {
    const result = priceStay(
      input({ unitTypeId, checkIn: '2026-09-12', checkOut: '2026-09-13' }),
      palmVillaConfig,
      TODAY,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.total).toBe(bnd(nightlyRate))
  })

  test('the security deposit is returned separately and never summed into the total', () => {
    const result = priceStay(input(), palmVillaConfig, TODAY)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // prd.md §11: the deposit is a refundable liability, not revenue.
    expect(result.securityDeposit).toBe(bnd(100))
    expect(result.total).toBe(bnd(400))
    expect(result.lines.some((entry) => entry.amount === bnd(100))).toBe(false)
  })
})

describe('priceStay — prd.md §18 N2, the two readings of max pax', () => {
  // A 3-bedroom states max 8. Nine chargeable guests is one above.
  const overCapacity = input({ party: { chargeableGuests: 9, exemptGuests: 0 } })

  test('surcharge_threshold: the party books and pays BND 7 per extra guest per night', () => {
    const config = withConfig({ paxPolicy: 'surcharge_threshold' })
    const result = priceStay(overCapacity, config, TODAY)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const extra = result.lines.find((entry) => entry.type === 'extra_person')
    expect(extra).toMatchObject({ quantity: 2, unitPrice: bnd(7), amount: bnd(14) })

    // 200 × 2 nights + 7 × 1 guest × 2 nights
    expect(result.total).toBe(bnd(414))
  })

  test('hard_cap: the same party cannot book at all', () => {
    const config = withConfig({ paxPolicy: 'hard_cap' })
    const result = priceStay(overCapacity, config, TODAY)

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('exceeds_max_pax')
  })

  test('at exactly max pax both policies agree, and no extra-person line appears', () => {
    const atCapacity = input({ party: { chargeableGuests: 8, exemptGuests: 0 } })

    for (const paxPolicy of ['hard_cap', 'surcharge_threshold'] as const) {
      const result = priceStay(atCapacity, withConfig({ paxPolicy }), TODAY)

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.total).toBe(bnd(400))
      expect(result.lines.some((entry) => entry.type === 'extra_person')).toBe(false)
    }
  })
})

describe('priceStay — extras', () => {
  test('the worked example from the plan: 5 guests over an 8-cap unit is wrong; 9 is one over', () => {
    // 3-bedroom, 2 nights, 9 chargeable guests (1 above the stated 8), 1 sofa bed.
    //   accommodation   200 × 2       = 400.00
    //   extra person    7 × 1 × 2     =  14.00
    //   sofa bed        28 × 1        =  28.00
    //                                 -------
    //                                   442.00
    const result = priceStay(
      input({ party: { chargeableGuests: 9, exemptGuests: 0 }, sofaBeds: 1 }),
      palmVillaConfig,
      TODAY,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.total).toBe(bnd(442))
  })

  test('sofa beds are a flat fee per bed, not per night', () => {
    const oneNight = priceStay(
      input({ checkOut: '2026-09-13', sofaBeds: 2 }),
      palmVillaConfig,
      TODAY,
    )
    const twoNights = priceStay(input({ sofaBeds: 2 }), palmVillaConfig, TODAY)

    expect(oneNight.ok && twoNights.ok).toBe(true)
    if (!oneNight.ok || !twoNights.ok) return

    const feeOf = (lines: typeof oneNight.lines) =>
      lines.find((entry) => entry.type === 'sofa_bed')?.amount

    expect(feeOf(oneNight.lines)).toBe(bnd(56))
    expect(feeOf(twoNights.lines)).toBe(bnd(56))
  })

  test('late check-out is charged per hour at BND 15', () => {
    const result = priceStay(input({ lateCheckOutHours: 3 }), palmVillaConfig, TODAY)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.lines.find((entry) => entry.type === 'late_check_out')?.amount).toBe(bnd(45))
    expect(result.total).toBe(bnd(445))
  })

  test('sofa beds beyond configured stock are refused once stock is known (N8)', () => {
    const result = priceStay(input({ sofaBeds: 3 }), withConfig({ sofaBedStock: 2 }), TODAY)

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('sofa_bed_stock_exceeded')
  })

  test('unknown stock does not constrain, so the fee still prices', () => {
    const result = priceStay(input({ sofaBeds: 3 }), withConfig({ sofaBedStock: null }), TODAY)

    expect(result.ok).toBe(true)
  })
})

describe('priceStay — prd.md §18 N6, early check-in is undefined', () => {
  test('is refused while the standard check-in time is unknown', () => {
    const result = priceStay(input({ earlyCheckInHours: 2 }), palmVillaConfig, TODAY)

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('early_check_in_undefined')
  })

  test('prices at BND 10 per hour once a check-in time is configured', () => {
    const config = withConfig({ standardCheckInTime: '14:00' })
    const result = priceStay(input({ earlyCheckInHours: 2 }), config, TODAY)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.lines.find((entry) => entry.type === 'early_check_in')?.amount).toBe(bnd(20))
  })
})

describe('priceStay — booking window and validation', () => {
  test('accepts a booking at the edge of the two-month window', () => {
    const result = priceStay(
      input({ checkIn: '2026-11-02', checkOut: '2026-11-03' }),
      palmVillaConfig,
      TODAY,
    )

    expect(result.ok).toBe(true)
  })

  test('refuses a booking beyond the two-month window (prd.md §9.1)', () => {
    const result = priceStay(
      input({ checkIn: '2026-11-04', checkOut: '2026-11-05' }),
      palmVillaConfig,
      TODAY,
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('outside_advance_window')
  })

  test('refuses a check-in in the past', () => {
    const result = priceStay(
      input({ checkIn: '2026-08-30', checkOut: '2026-08-31' }),
      palmVillaConfig,
      TODAY,
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('outside_advance_window')
  })

  test.each([
    ['same day', '2026-09-12', '2026-09-12'],
    ['reversed', '2026-09-14', '2026-09-12'],
  ])('refuses a %s date range', (_label, checkIn, checkOut) => {
    const result = priceStay(input({ checkIn, checkOut }), palmVillaConfig, TODAY)

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('invalid_date_range')
  })

  test('refuses a party of only exempt guests', () => {
    const result = priceStay(
      input({ party: { chargeableGuests: 0, exemptGuests: 2 } }),
      palmVillaConfig,
      TODAY,
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('no_guests')
  })

  test('refuses an unknown unit type', () => {
    const result = priceStay(input({ unitTypeId: 'penthouse' }), palmVillaConfig, TODAY)

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('unknown_unit_type')
  })
})

describe('partyFromAges — prd.md §8.2, guests aged 3 and below are not counted', () => {
  test('splits at the exempt age, inclusive', () => {
    const party = partyFromAges([34, 31, 8, 3, 1], palmVillaConfig)

    expect(party).toEqual({ chargeableGuests: 3, exemptGuests: 2 })
  })

  test('a four-year-old is chargeable', () => {
    expect(partyFromAges([4], palmVillaConfig).chargeableGuests).toBe(1)
  })

  test('exempt guests do not push a party over max pax', () => {
    // Eight chargeable plus two toddlers still fits an 8-cap 3-bedroom.
    const result = priceStay(
      input({ party: partyFromAges([20, 20, 20, 20, 20, 20, 20, 20, 2, 1], palmVillaConfig) }),
      withConfig({ paxPolicy: 'hard_cap' }),
      TODAY,
    )

    expect(result.ok).toBe(true)
  })
})

describe('priceStay — staff discount', () => {
  const reason = 'Repeat guest, third stay this year'

  test('adds the discount as a negative line, and the total is still the sum', () => {
    // Arrange — two nights of a 3-bedroom, less BND 40.
    const undiscounted = priceStay(input(), palmVillaConfig, TODAY)

    // Act
    const result = priceStay(
      input({ discount: { kind: 'amount', value: bnd(40), reason } }),
      palmVillaConfig,
      TODAY,
    )

    // Assert
    expect(result.ok && undiscounted.ok).toBe(true)
    if (!result.ok || !undiscounted.ok) return

    expect(result.total).toBe(undiscounted.total - bnd(40))
    expect(result.lines.at(-1)).toMatchObject({ type: 'discount', amount: -bnd(40) })
    expect(result.lines.reduce((sum, entry) => sum + entry.amount, 0)).toBe(result.total)
  })

  test('a percentage is taken against the priced lines, not the deposit', () => {
    const result = priceStay(
      input({ discount: { kind: 'percent', value: 10, reason } }),
      palmVillaConfig,
      TODAY,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const subtotal = result.lines
      .filter((entry) => entry.type !== 'discount')
      .reduce((sum, entry) => sum + entry.amount, 0)

    expect(result.total).toBe(subtotal - Math.round(subtotal / 10))
    // The refundable BND 100 is untouched: discounting it would be a shortfall
    // at release time, not a discount (prd.md §11).
    expect(result.securityDeposit).toBe(palmVillaConfig.securityDeposit)
  })

  test('the discount is applied after every extra, so an extra is discounted too', () => {
    const withExtras = input({ sofaBeds: 1, lateCheckOutHours: 2 })

    const plain = priceStay(withExtras, palmVillaConfig, TODAY)
    const discounted = priceStay(
      { ...withExtras, discount: { kind: 'percent', value: 50, reason } },
      palmVillaConfig,
      TODAY,
    )

    expect(plain.ok && discounted.ok).toBe(true)
    if (!plain.ok || !discounted.ok) return

    expect(discounted.total).toBe(plain.total - Math.round(plain.total / 2))
  })

  test('a discount worth more than the stay is refused, not clamped', () => {
    const result = priceStay(
      input({ discount: { kind: 'amount', value: bnd(100_000), reason } }),
      palmVillaConfig,
      TODAY,
    )

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe('invalid_discount')
  })

  test('a discount with no reason is refused', () => {
    const result = priceStay(
      input({ discount: { kind: 'amount', value: bnd(40), reason: '  ' } }),
      palmVillaConfig,
      TODAY,
    )

    expect(!result.ok && result.error.code).toBe('invalid_discount')
  })

  test('no discount leaves the lines exactly as they were', () => {
    const result = priceStay(input({ discount: null }), palmVillaConfig, TODAY)

    expect(result.ok).toBe(true)
    expect(result.ok && result.lines.some((entry) => entry.type === 'discount')).toBe(false)
  })
})
