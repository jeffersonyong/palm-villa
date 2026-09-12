import { describe, expect, test } from 'vitest'

import { palmVillaConfig } from './config'
import {
  bindingCapacity,
  bindingFacility,
  DAY_PASS_PARTY_MESSAGES,
  hasRoomFor,
  MAX_GUESTS_PER_BAND,
  partyFromCounts,
  placesLeft,
  type FacilityHeadroom,
} from './day-pass-capacity'

/**
 * The two figures a day pass turns on (capability A3): how many places are
 * left, and who is on the pass.
 *
 * The capacity half is unusual in this codebase because **nothing is
 * configured yet** — prd.md C2 records that no facility capacity has ever been
 * agreed, so every row ships null. The tests below therefore spend as much
 * effort on "no limit" as on a limit: the null path is the one production runs.
 */

function facility(overrides: Partial<FacilityHeadroom> = {}): FacilityHeadroom {
  return {
    slug: 'swimming-pool',
    name: 'Swimming pool',
    includedInDayPass: true,
    dayPassCapacity: null,
    ...overrides,
  }
}

describe('the capacity that binds', () => {
  test('is null when nothing has been configured, which is what ships today', () => {
    // prd.md C2. A null capacity is a number nobody has agreed, not a ceiling
    // of zero — reading it as zero would close the pass to everybody on the
    // day the feature launched.
    expect(bindingCapacity([facility(), facility({ slug: 'water-park' })])).toBeNull()
  })

  test('is the smallest among the facilities the pass admits', () => {
    // A pass opens every included facility, so the first to fill decides.
    expect(
      bindingCapacity([
        facility({ slug: 'swimming-pool', dayPassCapacity: 60 }),
        facility({ slug: 'playroom', dayPassCapacity: 25 }),
        facility({ slug: 'water-park', dayPassCapacity: 40 }),
      ]),
    ).toBe(25)
  })

  test('ignores a facility the pass does not admit', () => {
    // The gym is out (C1, 10 September 2026). Its capacity is a fact about
    // something this product does not sell, and letting it bind would refuse
    // passes on the strength of a room nobody bought access to.
    expect(
      bindingCapacity([
        facility({ slug: 'swimming-pool', dayPassCapacity: 60 }),
        facility({ slug: 'gym', includedInDayPass: false, dayPassCapacity: 4 }),
      ]),
    ).toBe(60)
  })

  test('ignores an included facility with no number on it', () => {
    // Mixed configuration is the likely first state: the owner types one
    // number and leaves the rest. The one he typed binds.
    expect(
      bindingCapacity([
        facility({ slug: 'swimming-pool', dayPassCapacity: 30 }),
        facility({ slug: 'playroom', dayPassCapacity: null }),
      ]),
    ).toBe(30)
  })

  test('a configured zero is a real ceiling, not an absent one', () => {
    // Closing a facility for the season by typing 0 must close the pass.
    expect(
      bindingCapacity([
        facility({ slug: 'swimming-pool', dayPassCapacity: 0 }),
        facility({ slug: 'playroom', dayPassCapacity: 30 }),
      ]),
    ).toBe(0)
  })

  test('names the facility the ceiling came from', () => {
    expect(
      bindingFacility([
        facility({ slug: 'swimming-pool', dayPassCapacity: 60 }),
        facility({ slug: 'playroom', name: 'Playroom', dayPassCapacity: 25 }),
      ])?.name,
    ).toBe('Playroom')
  })

  test('names nothing when nothing binds', () => {
    expect(bindingFacility([facility()])).toBeNull()
  })
})

describe('places left on a date', () => {
  test('is null when no limit is configured', () => {
    expect(placesLeft({ date: '2026-09-20', capacity: null, taken: 40 })).toBeNull()
  })

  test('is the ceiling less what is sold', () => {
    expect(placesLeft({ date: '2026-09-20', capacity: 30, taken: 12 })).toBe(18)
  })

  test('never goes negative when a capacity is lowered under what is sold', () => {
    // The owner cutting the pool to 10 after 25 passes are sold is a decision
    // about tomorrow. The passes already sold stand, and a customer is told
    // there are no places rather than minus fifteen.
    expect(placesLeft({ date: '2026-09-20', capacity: 10, taken: 25 })).toBe(0)
  })

  test('admits a party that exactly fills the last places', () => {
    expect(hasRoomFor({ date: '2026-09-20', capacity: 30, taken: 27 }, 3)).toBe(true)
    expect(hasRoomFor({ date: '2026-09-20', capacity: 30, taken: 27 }, 4)).toBe(false)
  })

  test('admits any party when nothing is configured', () => {
    expect(hasRoomFor({ date: '2026-09-20', capacity: null, taken: 900 }, 12)).toBe(true)
  })
})

describe('the party on a pass', () => {
  const bands = palmVillaConfig.dayPassAgeBands
  const infant = bands.find((band) => band.pricePerPerson === 0)
  const child = bands.find((band) => band.label.toLowerCase().includes('child'))
  const adult = bands.find((band) => band.pricePerPerson > 0 && band !== child)

  test('counts bodies, prices bands', () => {
    const result = partyFromCounts({ [adult!.id]: 2, [child!.id]: 1 }, palmVillaConfig)

    expect(result.ok).toBe(true)

    if (!result.ok) return

    expect(result.headcount).toBe(3)
    expect(result.party).toEqual({ [adult!.id]: 2, [child!.id]: 1 })
  })

  test('a free band still occupies a place', () => {
    // The whole reason headcount is stored rather than derived from the price:
    // an infant admitted free is a body at the pool, and a capacity that
    // ignored them would let a facility fill past its own ceiling.
    if (!infant) {
      // The seed has an under-1 band at zero; if that ever changes this test
      // should be rewritten rather than silently skipped.
      throw new Error('expected a zero-priced band in the seeded config')
    }

    const result = partyFromCounts({ [adult!.id]: 2, [infant.id]: 1 }, palmVillaConfig)

    expect(result.ok).toBe(true)

    if (!result.ok) return

    expect(result.headcount).toBe(3)
    expect(result.chargeableGuests).toBe(2)
    expect(result.exemptGuests).toBe(1)
  })

  test('keeps each band label as it was sold', () => {
    // A receipt describes a moment. Renaming "Child 1–11" later must not
    // rewrite what a customer was sold last month — the opposite of a unit ref,
    // which is a door and does get relabelled (prd.md §7.1).
    const result = partyFromCounts({ [child!.id]: 2 }, palmVillaConfig)

    expect(result.ok).toBe(true)

    if (!result.ok) return

    expect(result.snapshot).toEqual([{ bandId: child!.id, label: child!.label, count: 2 }])
  })

  test('lists the bands in the order they are configured', () => {
    const result = partyFromCounts({ [child!.id]: 1, [adult!.id]: 2 }, palmVillaConfig)

    expect(result.ok).toBe(true)

    if (!result.ok) return

    const order = result.snapshot.map((line) => line.bandId)
    const configured = bands.map((band) => band.id).filter((id) => order.includes(id))

    expect(order).toEqual(configured)
  })

  test('drops a band nobody chose rather than recording a zero', () => {
    const result = partyFromCounts({ [adult!.id]: 2, [child!.id]: 0 }, palmVillaConfig)

    expect(result.ok).toBe(true)

    if (!result.ok) return

    expect(result.snapshot).toHaveLength(1)
    expect(result.party).toEqual({ [adult!.id]: 2 })
  })

  test('refuses a party of nobody', () => {
    expect(partyFromCounts({}, palmVillaConfig)).toEqual({ ok: false, error: 'no_guests' })
    expect(partyFromCounts({ [adult!.id]: 0 }, palmVillaConfig)).toEqual({
      ok: false,
      error: 'no_guests',
    })
  })

  test('refuses a band that is not configured', () => {
    // The owner can remove a band while somebody has the form open.
    expect(partyFromCounts({ 'not-a-band': 2 }, palmVillaConfig)).toEqual({
      ok: false,
      error: 'unknown_age_band',
    })
  })

  test('refuses a negative or fractional count', () => {
    expect(partyFromCounts({ [adult!.id]: -1 }, palmVillaConfig)).toEqual({
      ok: false,
      error: 'negative_quantity',
    })
    expect(partyFromCounts({ [adult!.id]: 1.5 }, palmVillaConfig)).toEqual({
      ok: false,
      error: 'negative_quantity',
    })
  })

  test('refuses a count past the ceiling the form itself applies', () => {
    // The date control and the count fields are guide rails for a customer,
    // not a gate: a hand-made POST reached the writer with whatever it liked.
    // `1e6` is an integer, so every other check here passed it, and a held
    // pass for a hundred thousand heads fills a capacity the day one is set.
    expect(partyFromCounts({ [adult!.id]: MAX_GUESTS_PER_BAND + 1 }, palmVillaConfig)).toEqual({
      ok: false,
      error: 'too_many_guests',
    })
    expect(partyFromCounts({ [adult!.id]: 1e6 }, palmVillaConfig)).toEqual({
      ok: false,
      error: 'too_many_guests',
    })
  })

  test('admits a party exactly at the ceiling', () => {
    const result = partyFromCounts({ [adult!.id]: MAX_GUESTS_PER_BAND }, palmVillaConfig)

    expect(result.ok).toBe(true)
    expect(result.ok && result.headcount).toBe(MAX_GUESTS_PER_BAND)
  })

  test('has a sentence for every refusal it can return', () => {
    // The action indexes DAY_PASS_PARTY_MESSAGES by the error it got back, so
    // a new member of the union with no message renders `undefined` at a
    // customer.
    for (const error of ['unknown_age_band', 'no_guests', 'negative_quantity', 'too_many_guests']) {
      expect(DAY_PASS_PARTY_MESSAGES[error as keyof typeof DAY_PASS_PARTY_MESSAGES]).toBeTruthy()
    }
  })
})
