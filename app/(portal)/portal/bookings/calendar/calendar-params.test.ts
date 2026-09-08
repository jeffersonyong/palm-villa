import { describe, expect, test } from 'vitest'

import { CALENDAR_PATH, calendarHref, readMonth } from './calendar-params'

const TODAY = '2026-09-08'

describe('readMonth', () => {
  test('takes a well-formed month from the URL', () => {
    expect(readMonth('2026-11', TODAY)).toBe('2026-11')
    expect(readMonth('2000-01', TODAY)).toBe('2000-01')
    expect(readMonth('2099-12', TODAY)).toBe('2099-12')
  })

  test("falls back to today's month when nothing was asked for", () => {
    expect(readMonth(undefined, TODAY)).toBe('2026-09')
  })

  test('falls back rather than erroring on garbage', () => {
    expect(readMonth('garbage', TODAY)).toBe('2026-09')
    expect(readMonth('2026-13', TODAY)).toBe('2026-09')
    expect(readMonth('2026-09-01', TODAY)).toBe('2026-09')
    expect(readMonth('', TODAY)).toBe('2026-09')
  })

  test('falls back on a month the arithmetic could not step from', () => {
    // `shiftMonth` throws below year zero, and `isCalendarMonth('0000-01')` is
    // true — this is the bound that keeps the previous arrow from a 500.
    expect(readMonth('0000-01', TODAY)).toBe('2026-09')
    expect(readMonth('1999-12', TODAY)).toBe('2026-09')
    expect(readMonth('2100-01', TODAY)).toBe('2026-09')
  })
})

describe('calendarHref', () => {
  test('is the bare path when nothing is set', () => {
    expect(calendarHref(null, [])).toBe(CALENDAR_PATH)
  })

  test('writes the month on its own', () => {
    expect(calendarHref('2026-11', [])).toBe(`${CALENDAR_PATH}?month=2026-11`)
  })

  test('writes the types on their own, repeating the param', () => {
    expect(calendarHref(null, ['three-bedroom', 'semi-detached'])).toBe(
      `${CALENDAR_PATH}?type=three-bedroom&type=semi-detached`,
    )
  })

  test('writes the month before the types', () => {
    expect(calendarHref('2026-11', ['four-bedroom'])).toBe(
      `${CALENDAR_PATH}?month=2026-11&type=four-bedroom`,
    )
  })
})
