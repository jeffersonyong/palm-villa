import { describe, expect, test } from 'vitest'

import { DATE_RANGE_PRESETS, REPORT_DATE_RANGE_PRESETS, matchingPreset } from './date-range-presets'

/**
 * A Wednesday in the middle of a 30-day month, deliberately: it leaves room on
 * both sides, so a preset that quietly reached into the wrong month would show
 * up rather than coinciding with a boundary.
 */
const TODAY = '2026-09-16'

function resolve(id: string, today = TODAY) {
  const preset = DATE_RANGE_PRESETS.find((candidate) => candidate.id === id)

  if (!preset) {
    throw new Error(`No preset ${id}`)
  }

  return preset.resolve(today)
}

describe('DATE_RANGE_PRESETS', () => {
  test('today and tomorrow are single days', () => {
    expect(resolve('today')).toEqual({ start: '2026-09-16', end: '2026-09-16' })
    expect(resolve('tomorrow')).toEqual({ start: '2026-09-17', end: '2026-09-17' })
  })

  test('next 7 days counts today as one of the seven', () => {
    // Both ends inclusive, so the span is today plus six — not today plus
    // seven, which would be eight days.
    expect(resolve('next-7')).toEqual({ start: '2026-09-16', end: '2026-09-22' })
  })

  test('the month presets span whole months', () => {
    expect(resolve('this-month')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(resolve('next-month')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(resolve('last-month')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  test('the month presets cross a year boundary', () => {
    expect(resolve('next-month', '2026-12-14')).toEqual({ start: '2027-01-01', end: '2027-01-31' })
    expect(resolve('last-month', '2026-01-14')).toEqual({ start: '2025-12-01', end: '2025-12-31' })
  })

  test('a short month ends on its real last day', () => {
    expect(resolve('this-month', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(resolve('this-month', '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  test('every preset returns a range that runs forwards', () => {
    for (const preset of DATE_RANGE_PRESETS) {
      const { start, end } = preset.resolve(TODAY)

      expect(start <= end, `${preset.id} runs backwards`).toBe(true)
    }
  })

  test('no two presets resolve to the same span', () => {
    // Two rail entries that select each other would make the highlight a lie.
    const spans = DATE_RANGE_PRESETS.map((preset) => {
      const { start, end } = preset.resolve(TODAY)

      return `${start}/${end}`
    })

    expect(new Set(spans).size).toBe(spans.length)
  })
})

describe('matchingPreset', () => {
  test('recognises a hand-picked range that happens to be a preset', () => {
    // The whole point of matching by value: a range picked off the grid that
    // is exactly this month *is* this month.
    expect(matchingPreset({ start: '2026-09-01', end: '2026-09-30' }, TODAY)?.id).toBe('this-month')
  })

  test('leaves an ordinary range unmatched', () => {
    expect(matchingPreset({ start: '2026-09-03', end: '2026-09-19' }, TODAY)).toBeUndefined()
  })

  test('a range one day off a preset is not that preset', () => {
    expect(matchingPreset({ start: '2026-09-01', end: '2026-09-29' }, TODAY)).toBeUndefined()
  })

  test('no range matches nothing', () => {
    expect(matchingPreset(null, TODAY)).toBeUndefined()
  })
})

/**
 * The reports rail looks backwards, and every span it offers has happened.
 *
 * A forward-looking preset on a screen about the past resolves to a period
 * with nothing in it — and worse, on the occupancy report, to a denominator of
 * nights nobody could have slept.
 */
describe('REPORT_DATE_RANGE_PRESETS', () => {
  function report(id: string, today = TODAY) {
    const preset = REPORT_DATE_RANGE_PRESETS.find((candidate) => candidate.id === id)

    if (!preset) {
      throw new Error(`No report preset with id ${id}.`)
    }

    return preset.resolve(today)
  }

  test('every span ends today or earlier', () => {
    for (const preset of REPORT_DATE_RANGE_PRESETS) {
      expect(preset.resolve(TODAY).end <= TODAY).toBe(true)
    }
  })

  test('resolves the six spans against a fixed day', () => {
    expect(report('today')).toEqual({ start: '2026-09-16', end: '2026-09-16' })
    expect(report('yesterday')).toEqual({ start: '2026-09-15', end: '2026-09-15' })
    expect(report('last-7')).toEqual({ start: '2026-09-10', end: '2026-09-16' })
    expect(report('month-to-date')).toEqual({ start: '2026-09-01', end: '2026-09-16' })
    expect(report('last-month')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
    expect(report('year-to-date')).toEqual({ start: '2026-01-01', end: '2026-09-16' })
  })

  test('month to date stops at today rather than running to the month end', () => {
    expect(report('month-to-date', '2026-09-02').end).toBe('2026-09-02')
  })

  test('crosses a month boundary backwards without arithmetic of its own', () => {
    expect(report('last-7', '2026-10-02')).toEqual({ start: '2026-09-26', end: '2026-10-02' })
    expect(report('yesterday', '2026-10-01')).toEqual({ start: '2026-09-30', end: '2026-09-30' })
    expect(report('last-month', '2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-31' })
  })

  test('on the first of a month, today wins the tie with month to date', () => {
    // Both resolve to the same single day, and matchingPreset returns the
    // first that matches — so the rail highlights one chip, not none.
    expect(
      matchingPreset(report('today', '2026-09-01'), '2026-09-01', REPORT_DATE_RANGE_PRESETS)?.id,
    ).toBe('today')
  })

  test('matches against the set it is given, not the default one', () => {
    const lastMonth = { start: '2026-08-01', end: '2026-08-31' }

    expect(matchingPreset(lastMonth, TODAY, REPORT_DATE_RANGE_PRESETS)?.id).toBe('last-month')
    // Year to date is not on the bookings rail at all.
    expect(matchingPreset(report('year-to-date'), TODAY)).toBeUndefined()
  })
})
