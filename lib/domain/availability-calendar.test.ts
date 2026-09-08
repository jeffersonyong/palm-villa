import { describe, expect, test } from 'vitest'

import {
  firstBlockedNight,
  freeOn,
  nightlyFreeCounts,
  occupiesUnit,
  publicBookingWindow,
  unitsByType,
  type CalendarOccupancyRange,
  type CalendarUnit,
} from './availability-calendar'

/**
 * The count behind the public calendar (capability A1).
 *
 * What these tests are really protecting is agreement with the exclusion
 * constraint. Every case below has a mirror in the database — the same status
 * rule, the same half-open nights, the same treatment of a lease with no end —
 * and a night drawn as free that the constraint then refuses is the one
 * failure a customer experiences as the site lying to them.
 */

const WINDOW = { start: '2026-09-10', end: '2026-09-15' }

function units(overrides: Partial<CalendarUnit>[] = []): CalendarUnit[] {
  const base: CalendarUnit[] = [
    { id: 'u1', unitTypeSlug: 'three-bedroom', serviceable: true },
    { id: 'u2', unitTypeSlug: 'three-bedroom', serviceable: true },
    { id: 'u3', unitTypeSlug: 'four-bedroom', serviceable: true },
  ]

  return overrides.length === 0
    ? base
    : base.map((unit, index) => ({ ...unit, ...(overrides[index] ?? {}) }))
}

function occupancy(overrides: Partial<CalendarOccupancyRange> = {}): CalendarOccupancyRange {
  return {
    unitId: 'u1',
    start: '2026-09-11',
    end: '2026-09-13',
    status: 'confirmed',
    ...overrides,
  }
}

describe('which statuses hold a unit', () => {
  test.each([
    ['held', true],
    ['awaiting_payment_verification', true],
    ['confirmed', true],
    ['checked_in', true],
    ['completed', true],
    ['no_show', true],
    ['leased', true],
    ['draft', true],
    ['expired', false],
    ['cancelled', false],
  ])('%s occupies the unit: %s', (status, expected) => {
    expect(occupiesUnit(status)).toBe(expected)
  })

  test('a held night is taken, which is the whole point of the public flow', () => {
    // A public booking is created `held` and nothing expires it (N7). If this
    // read called a held night free, two customers would be quoted the same
    // room and the second would be refused after filling in the form.
    const counts = nightlyFreeCounts({
      window: WINDOW,
      units: units(),
      occupancies: [occupancy({ status: 'held' })],
    })

    expect(freeOn(counts, '2026-09-11', 'three-bedroom')).toBe(1)
  })
})

describe('counting free units per night', () => {
  test('an empty building offers every unit on every night', () => {
    const counts = nightlyFreeCounts({ window: WINDOW, units: units(), occupancies: [] })

    expect(freeOn(counts, '2026-09-10', 'three-bedroom')).toBe(2)
    expect(freeOn(counts, '2026-09-14', 'four-bedroom')).toBe(1)
  })

  test('a stay takes its nights and leaves the check-out day free', () => {
    // Half-open, exactly as `daterange(start, end, '[)')` is: [11, 13) takes
    // the 11th and the 12th, and the 13th is available for the next guest.
    const counts = nightlyFreeCounts({
      window: WINDOW,
      units: units(),
      occupancies: [occupancy({ start: '2026-09-11', end: '2026-09-13' })],
    })

    expect(freeOn(counts, '2026-09-10', 'three-bedroom')).toBe(2)
    expect(freeOn(counts, '2026-09-11', 'three-bedroom')).toBe(1)
    expect(freeOn(counts, '2026-09-12', 'three-bedroom')).toBe(1)
    expect(freeOn(counts, '2026-09-13', 'three-bedroom')).toBe(2)
  })

  test('an expired or cancelled booking releases its nights', () => {
    const counts = nightlyFreeCounts({
      window: WINDOW,
      units: units(),
      occupancies: [
        occupancy({ status: 'cancelled' }),
        occupancy({ unitId: 'u2', status: 'expired' }),
      ],
    })

    expect(freeOn(counts, '2026-09-11', 'three-bedroom')).toBe(2)
  })

  test('a lease with no end date occupies every night from its start', () => {
    // N19: `daterange(start, null)` is unbounded above, and a plain
    // `end > night` comparison is null rather than true for such a row — the
    // trap that made available_units() report a leased unit as free once.
    const counts = nightlyFreeCounts({
      window: WINDOW,
      units: units(),
      occupancies: [occupancy({ start: '2026-09-12', end: null, status: 'leased' })],
    })

    expect(freeOn(counts, '2026-09-11', 'three-bedroom')).toBe(2)
    expect(freeOn(counts, '2026-09-12', 'three-bedroom')).toBe(1)
    expect(freeOn(counts, '2026-09-14', 'three-bedroom')).toBe(1)
  })

  test('a unit out of service is in neither figure', () => {
    // Not free and not taken: it is not inventory at all. That differs from the
    // occupancy report, which keeps it in the denominator so a building that
    // broke down does not read as fuller than one that did not.
    const counts = nightlyFreeCounts({
      window: WINDOW,
      units: units([{}, { serviceable: false }]),
      occupancies: [],
    })

    expect(freeOn(counts, '2026-09-11', 'three-bedroom')).toBe(1)
  })

  test('an occupancy stretching past both ends of the window is clipped, not dropped', () => {
    const counts = nightlyFreeCounts({
      window: WINDOW,
      units: units(),
      occupancies: [occupancy({ start: '2026-08-01', end: '2026-10-01' })],
    })

    expect(freeOn(counts, '2026-09-10', 'three-bedroom')).toBe(1)
    expect(freeOn(counts, '2026-09-14', 'three-bedroom')).toBe(1)
  })

  test('an occupancy that misses the window entirely changes nothing', () => {
    const counts = nightlyFreeCounts({
      window: WINDOW,
      units: units(),
      occupancies: [occupancy({ start: '2026-08-01', end: '2026-08-05' })],
    })

    expect(freeOn(counts, '2026-09-10', 'three-bedroom')).toBe(2)
  })

  test('an occupancy on a unit nobody counts is ignored', () => {
    // A stay on an out-of-service unit — the completed booking that was in the
    // room before it broke. Counting it would take a free night off a type
    // whose figure never included that unit in the first place.
    const counts = nightlyFreeCounts({
      window: WINDOW,
      units: units([{}, { serviceable: false }]),
      occupancies: [occupancy({ unitId: 'u2' })],
    })

    expect(freeOn(counts, '2026-09-11', 'three-bedroom')).toBe(1)
  })

  test('never reports a negative count', () => {
    const counts = nightlyFreeCounts({
      window: WINDOW,
      units: [{ id: 'u1', unitTypeSlug: 'three-bedroom', serviceable: true }],
      occupancies: [occupancy(), occupancy({ unitId: 'u1' })],
    })

    expect(freeOn(counts, '2026-09-11', 'three-bedroom')).toBe(0)
  })

  test('a type with no units is absent rather than zero-filled', () => {
    const counts = nightlyFreeCounts({ window: WINDOW, units: units(), occupancies: [] })

    // The 2-bedroom type exists in config and has no units until N1 is
    // answered. `freeOn` answers zero for it, which is what the screen needs.
    expect(freeOn(counts, '2026-09-11', 'two-bedroom')).toBe(0)
  })
})

describe('unitsByType', () => {
  test('counts serviceable units only', () => {
    expect(unitsByType(units([{}, { serviceable: false }]))).toEqual(
      new Map([
        ['three-bedroom', 1],
        ['four-bedroom', 1],
      ]),
    )
  })
})

describe('the first night that blocks a range', () => {
  const counts = nightlyFreeCounts({
    window: WINDOW,
    units: [{ id: 'u1', unitTypeSlug: 'three-bedroom', serviceable: true }],
    occupancies: [occupancy({ start: '2026-09-12', end: '2026-09-13' })],
  })

  test('names the night, so the screen can say which one', () => {
    expect(
      firstBlockedNight({ start: '2026-09-10', end: '2026-09-14' }, 'three-bedroom', counts),
    ).toBe('2026-09-12')
  })

  test('is null when every night has something free', () => {
    expect(
      firstBlockedNight({ start: '2026-09-10', end: '2026-09-12' }, 'three-bedroom', counts),
    ).toBeNull()
  })

  test('ignores the check-out day, which nobody sleeps in', () => {
    // A stay ending on the 12th does not need the 12th.
    expect(
      firstBlockedNight({ start: '2026-09-10', end: '2026-09-12' }, 'three-bedroom', counts),
    ).toBeNull()
  })

  test('is null for a range with no nights in it', () => {
    expect(
      firstBlockedNight({ start: '2026-09-12', end: '2026-09-12' }, 'three-bedroom', counts),
    ).toBeNull()
  })
})

describe('the window a public calendar may show', () => {
  test('runs from today to one day past the furthest bookable night', () => {
    // 62 days is the seeded advance window (prd.md §9.1 [C], two months). The
    // window is half-open, so the end is the day after the last night anybody
    // can book — a guest booking to the edge checks out on it.
    expect(publicBookingWindow('2026-09-10', 62)).toEqual({
      start: '2026-09-10',
      end: '2026-11-12',
    })
  })

  test('always offers at least tonight, even on a nonsense setting', () => {
    expect(publicBookingWindow('2026-09-10', 0)).toEqual({
      start: '2026-09-10',
      end: '2026-09-12',
    })
  })
})
