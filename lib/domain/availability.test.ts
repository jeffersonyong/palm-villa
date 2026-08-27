import { describe, expect, test } from 'vitest'

import { isFree, isValidRange, nightsIn, overlaps, type DateRange } from './availability'

/**
 * Range tests.
 *
 * The boundary cases are the point. Half-open semantics must match the
 * `daterange(..., '[)')` in architecture.md §5.2 exactly — if this file and the
 * database disagree about whether checkout day is free, the preview will offer
 * a unit the database then refuses, or hide one it would have accepted.
 */

const range = (start: string, end: string): DateRange => ({ start, end })

describe('overlaps — half-open [start, end)', () => {
  test('back-to-back bookings do not overlap (checkout day = next check-in day)', () => {
    expect(overlaps(range('2026-09-12', '2026-09-14'), range('2026-09-14', '2026-09-16'))).toBe(
      false,
    )
  })

  test('a one-night gap does not overlap', () => {
    expect(overlaps(range('2026-09-12', '2026-09-14'), range('2026-09-15', '2026-09-16'))).toBe(
      false,
    )
  })

  test('identical ranges overlap', () => {
    expect(overlaps(range('2026-09-12', '2026-09-14'), range('2026-09-12', '2026-09-14'))).toBe(
      true,
    )
  })

  test('a range fully inside another overlaps', () => {
    expect(overlaps(range('2026-09-12', '2026-09-20'), range('2026-09-14', '2026-09-16'))).toBe(
      true,
    )
  })

  test('a single overlapping night overlaps', () => {
    expect(overlaps(range('2026-09-12', '2026-09-15'), range('2026-09-14', '2026-09-18'))).toBe(
      true,
    )
  })

  test('is symmetric', () => {
    const a = range('2026-09-12', '2026-09-15')
    const b = range('2026-09-14', '2026-09-18')

    expect(overlaps(a, b)).toBe(overlaps(b, a))
  })
})

describe('isFree', () => {
  const existing = [range('2026-09-12', '2026-09-14'), range('2026-09-20', '2026-09-22')]

  test('a gap between two bookings is free', () => {
    expect(isFree(range('2026-09-14', '2026-09-20'), existing)).toBe(true)
  })

  test('a range clashing with any one booking is not free', () => {
    expect(isFree(range('2026-09-21', '2026-09-23'), existing)).toBe(false)
  })

  test('everything is free against no existing bookings', () => {
    expect(isFree(range('2026-09-12', '2026-09-14'), [])).toBe(true)
  })
})

describe('isValidRange', () => {
  test.each([
    ['one night', '2026-09-12', '2026-09-13', true],
    ['same day', '2026-09-12', '2026-09-12', false],
    ['reversed', '2026-09-14', '2026-09-12', false],
  ])('%s', (_label, start, end, expected) => {
    expect(isValidRange(range(start, end))).toBe(expected)
  })
})

describe('nightsIn', () => {
  test('lists occupied nights, excluding the check-out day', () => {
    expect(nightsIn(range('2026-09-12', '2026-09-15'))).toEqual([
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
    ])
  })

  test('crosses a month boundary', () => {
    expect(nightsIn(range('2026-09-30', '2026-10-02'))).toEqual(['2026-09-30', '2026-10-01'])
  })
})
