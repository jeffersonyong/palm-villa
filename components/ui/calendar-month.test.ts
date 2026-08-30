import { describe, expect, test } from 'vitest'

import {
  CELLS_IN_GRID,
  daysInMonth,
  firstDayOfMonth,
  formatCalendarMonth,
  formatDayLabel,
  isCalendarMonth,
  lastDayOfMonth,
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
    // 1 September 2026 is a Tuesday, so Monday's column carries 31 August.
    const grid = monthGrid('2026-09')

    expect(grid[0]).toEqual({ date: '2026-08-31', inMonth: false })
    expect(grid[1]).toEqual({ date: '2026-09-01', inMonth: true })
  })

  test('a month beginning on a Monday leads with its own first day', () => {
    // 1 June 2026 is a Monday.
    expect(monthGrid('2026-06')[0]).toEqual({ date: '2026-06-01', inMonth: true })
  })

  test('a month beginning on a Sunday spills a full week back', () => {
    // 1 February 2026 is a Sunday, the last column of a Monday-first week.
    const grid = monthGrid('2026-02')

    expect(grid.slice(0, 6).every((cell) => !cell.inMonth)).toBe(true)
    expect(grid[0]?.date).toBe('2026-01-26')
    expect(grid[5]?.date).toBe('2026-01-31')
    expect(grid[6]).toEqual({ date: '2026-02-01', inMonth: true })
  })

  test('every cell carries a real date, in an unbroken daily run', () => {
    const grid = monthGrid('2026-02')

    grid.forEach((cell, index) => {
      if (index === 0) {
        return
      }

      const previous = new Date(`${grid[index - 1]!.date}T00:00:00Z`).getTime()
      const current = new Date(`${cell.date}T00:00:00Z`).getTime()

      expect(current - previous).toBe(86_400_000)
    })
  })

  test('spills forward across a year boundary', () => {
    const grid = monthGrid('2026-12')

    // 31 December 2026 is a Thursday, so the last row runs into January.
    expect(grid.at(-1)?.date.slice(0, 4)).toBe('2027')
    expect(grid.at(-1)?.inMonth).toBe(false)
  })
})

describe('daysInMonth', () => {
  test('counts the month itself, not the spill', () => {
    expect(daysInMonth('2026-09')).toHaveLength(30)
    expect(daysInMonth('2026-08')).toHaveLength(31)
    expect(daysInMonth('2026-02')).toHaveLength(28)
  })

  test('knows a leap February', () => {
    const days = daysInMonth('2028-02')

    expect(days).toHaveLength(29)
    expect(days.at(-1)).toBe('2028-02-29')
  })

  test('runs first to last, in order', () => {
    const days = daysInMonth('2026-09')

    expect(days[0]).toBe('2026-09-01')
    expect(days.at(-1)).toBe('2026-09-30')
    expect([...days].sort()).toEqual(days)
  })
})

describe('lastDayOfMonth', () => {
  test('lands on the real last day of each month length', () => {
    expect(lastDayOfMonth('2026-09')).toBe('2026-09-30')
    expect(lastDayOfMonth('2026-08')).toBe('2026-08-31')
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28')
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29')
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
