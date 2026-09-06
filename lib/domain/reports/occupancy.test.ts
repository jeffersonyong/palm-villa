import { describe, expect, test } from 'vitest'

import {
  clippedNights,
  formatOccupancyRate,
  occupancyByType,
  occupancyByUnit,
  occupancyTotals,
  type OccupancyRow,
  type ReportUnit,
} from './occupancy'

const RANGE = { start: '2026-09-01', end: '2026-09-08' } as const

function unit(id: string, ref: string, typeId = 'three-bedroom'): ReportUnit {
  return {
    id,
    ref,
    unitTypeId: typeId,
    unitTypeName: typeId === 'three-bedroom' ? '3-bedroom' : 'Semi-detached',
    outOfServiceSince: null,
  }
}

function row(overrides: Partial<OccupancyRow> = {}): OccupancyRow {
  return {
    unitId: 'unit-1',
    status: 'completed',
    start: '2026-09-02',
    end: '2026-09-05',
    ...overrides,
  }
}

describe('clippedNights', () => {
  test('counts the nights a stay contributes inside the range', () => {
    expect(clippedNights(row(), RANGE)).toBe(3)
  })

  test('clips a stay that straddles both ends of the range', () => {
    expect(clippedNights(row({ start: '2026-08-20', end: '2026-09-20' }), RANGE)).toBe(7)
  })

  test('a stay that only touches the range contributes nothing', () => {
    // Half-open: this one ends as the range begins, and that one begins as it
    // ends. Neither sleeps a night inside it.
    expect(clippedNights(row({ start: '2026-08-25', end: '2026-09-01' }), RANGE)).toBe(0)
    expect(clippedNights(row({ start: '2026-09-08', end: '2026-09-12' }), RANGE)).toBe(0)
  })

  test('an open-ended lease runs to the end of the range', () => {
    expect(clippedNights(row({ start: '2026-09-03', end: null, status: 'leased' }), RANGE)).toBe(5)
  })

  test('ignores a status that is not occupancy', () => {
    // A hold blocks a unit but nobody has slept there or paid for it, and a
    // cancelled row is not occupancy at all.
    for (const status of ['held', 'cancelled', 'expired', 'no_show', 'draft']) {
      expect(clippedNights(row({ status }), RANGE)).toBe(0)
    }
  })
})

describe('occupancyByUnit', () => {
  test('sums a unit’s stays and never double-counts a changeover day', () => {
    const rows = [
      row({ unitId: 'unit-1', start: '2026-09-01', end: '2026-09-04' }),
      row({ unitId: 'unit-1', start: '2026-09-04', end: '2026-09-06' }),
    ]

    const byUnit = occupancyByUnit([unit('unit-1', '3B-01')], rows, RANGE)

    expect(byUnit[0]).toMatchObject({ occupiedNights: 5, availableNights: 7 })
    expect(byUnit[0]?.rate).toBeCloseTo(5 / 7)
  })

  test('a unit with no stays reads as empty rather than absent', () => {
    const byUnit = occupancyByUnit([unit('unit-9', '3B-09')], [], RANGE)

    expect(byUnit[0]).toMatchObject({ occupiedNights: 0, rate: 0 })
  })

  test('a unit out of service still counts its nights as available', () => {
    const broken = { ...unit('unit-2', '3B-02'), outOfServiceSince: '2026-09-02' }

    // The denominator does not shrink: a building that broke down should not
    // report as fuller than one that did not (prd.md §14 [A]).
    expect(occupancyByUnit([broken], [], RANGE)[0]?.availableNights).toBe(7)
  })
})

describe('occupancyByType', () => {
  const units = [unit('unit-1', '3B-01'), unit('unit-2', '3B-02'), unit('sd-1', 'SD-01', 'semi')]
  const types = [
    { id: 'three-bedroom', name: '3-bedroom' },
    { id: 'semi', name: 'Semi-detached' },
    { id: 'two-bedroom', name: '2-bedroom' },
  ]

  test('rolls its units up and multiplies the denominator by their count', () => {
    const byUnit = occupancyByUnit(units, [row({ unitId: 'unit-1' })], RANGE)
    const byType = occupancyByType(types, byUnit, RANGE)

    expect(byType[0]).toMatchObject({ unitCount: 2, occupiedNights: 3, availableNights: 14 })
  })

  test('a type with no units has no rate rather than a rate of zero', () => {
    // The 2-bedroom is seeded with zero units pending N1. It was not empty; it
    // was absent, and 0% would report a failure it never had the chance to have.
    const byType = occupancyByType(types, occupancyByUnit(units, [], RANGE), RANGE)

    expect(byType[2]).toMatchObject({ unitCount: 0, availableNights: 0, rate: null })
  })
})

describe('occupancyTotals', () => {
  test('the building’s line is the sum of the types’ lines', () => {
    const units = [unit('unit-1', '3B-01'), unit('sd-1', 'SD-01', 'semi')]
    const types = [
      { id: 'three-bedroom', name: '3-bedroom' },
      { id: 'semi', name: 'Semi-detached' },
    ]
    const rows = [
      row({ unitId: 'unit-1' }),
      row({ unitId: 'sd-1', start: '2026-09-01', end: '2026-09-08' }),
    ]

    const totals = occupancyTotals(
      occupancyByType(types, occupancyByUnit(units, rows, RANGE), RANGE),
    )

    expect(totals).toEqual({ occupiedNights: 10, availableNights: 14, rate: 10 / 14 })
  })
})

describe('formatOccupancyRate', () => {
  test('renders a whole percentage, and an absent rate as a dash', () => {
    expect(formatOccupancyRate(0.715)).toBe('72%')
    expect(formatOccupancyRate(0)).toBe('0%')
    expect(formatOccupancyRate(null)).toBe('—')
  })
})
