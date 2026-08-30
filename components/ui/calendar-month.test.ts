import { describe, expect, test } from 'vitest'

import {
  CELLS_IN_GRID,
  firstDayOfMonth,
  formatCalendarMonth,
  formatDayLabel,
  isCalendarMonth,
  monthGrid,
  monthOf,
  shiftMonth,
} from './calendar-month'

describe('isCalendarMonth', () => {
  test('accepts a well-formed month', () => {
    expect(isCalendarMonth('2026-09')).toBe(true)
    expect(isCalendarMonth('2026-01')).toBe(true)
    expect(isCalendarMonth('2026-12')).toBe(true)
  })

  test('rejects anything that is not one', () => {
    expect(isCalendarMonth('2026-00')).toBe(false)
    expect(isCalendarMonth('2026-13')).toBe(false)
    expect(isCalendarMonth('2026-9')).toBe(false)
    expect(isCalendarMonth('2026-09-01')).toBe(false)
  })
})

describe('monthOf', () => {
  test('takes the month a stay date falls in', () => {
    expect(monthOf('2026-09-12')).toBe('2026-09')
  })
})

describe('firstDayOfMonth', () => {
  test('returns the first as a stay date', () => {
    expect(firstDayOfMonth('2026-09')).toBe('2026-09-01')
  })
})

describe('shiftMonth', () => {
  test('moves within a year', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10')
    expect(shiftMonth('2026-09', -1)).toBe('2026-08')
  })

  test('wraps the year in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  test('crosses more than a year', () => {
    expect(shiftMonth('2026-05', 14)).toBe('2027-07')
    expect(shiftMonth('2026-05', -17)).toBe('2024-12')
  })

  test('does not slide off a long month', () => {
    // The reason this is index arithmetic and not `Date` arithmetic: adding a
    // month to 31 January with a Date lands on 2 or 3 March.
    expect(shiftMonth(monthOf('2026-01-31'), 1)).toBe('2026-02')
  })
})

describe('monthGrid', () => {
  test('is always six rows of seven, so the panel never changes height', () => {
    expect(monthGrid('2026-02')).toHaveLength(CELLS_IN_GRID)
    expect(monthGrid('2026-08')).toHaveLength(CELLS_IN_GRID)
  })

  test('starts the week on Monday', () => {
    // 1 September 2026 is a Tuesday, so Monday's column leads with a blank.
    const grid = monthGrid('2026-09')

    expect(grid[0]).toBeNull()
    expect(grid[1]).toBe('2026-09-01')
  })

  test('a month beginning on a Monday has no lead blanks', () => {
    // 1 June 2026 is a Monday.
    expect(monthGrid('2026-06')[0]).toBe('2026-06-01')
  })

  test('a month beginning on a Sunday fills the whole first row with blanks', () => {
    // 1 February 2026 is a Sunday, the last column of a Monday-first week.
    const grid = monthGrid('2026-02')

    expect(grid.slice(0, 6).every((cell) => cell === null)).toBe(true)
    expect(grid[6]).toBe('2026-02-01')
  })

  test('ends the month on its real last day', () => {
    expect(monthGrid('2026-09').filter(Boolean)).toHaveLength(30)
    expect(monthGrid('2026-08').filter(Boolean)).toHaveLength(31)
    expect(monthGrid('2026-02').filter(Boolean)).toHaveLength(28)
  })

  test('knows a leap February', () => {
    const grid = monthGrid('2028-02')

    expect(grid.filter(Boolean)).toHaveLength(29)
    expect(grid.filter(Boolean).at(-1)).toBe('2028-02-29')
  })

  test('every cell that is not blank is a date in the month, in order', () => {
    const days = monthGrid('2026-09').filter((cell): cell is string => cell !== null)

    expect(days[0]).toBe('2026-09-01')
    expect(days.at(-1)).toBe('2026-09-30')
    expect([...days].sort()).toEqual(days)
  })
})

describe('formatCalendarMonth', () => {
  test('names the month and year', () => {
    expect(formatCalendarMonth('2026-09')).toBe('September 2026')
  })
})

describe('formatDayLabel', () => {
  test('spells the date out for a screen reader', () => {
    expect(formatDayLabel('2026-09-12')).toBe('Saturday, 12 September 2026')
  })
})
