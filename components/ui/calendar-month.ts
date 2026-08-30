import { parseStayDate, type StayDate } from '@/lib/domain/dates'

/**
 * The arithmetic behind the calendar grid.
 *
 * Kept out of the component and pure, the same way `pagination-range.ts` sits
 * beside `pagination.tsx`: month boundaries and leap years are the part of a
 * calendar that is actually easy to get wrong, and they are far cheaper to
 * assert than to click through.
 *
 * Everything here works in `YYYY-MM` / `YYYY-MM-DD` strings and does its
 * arithmetic in UTC, for the reason `lib/domain/dates.ts` gives: a stay date is
 * a calendar date, and routing one through a real timezone is how a booking
 * silently moves a day.
 */

/** A calendar month in `YYYY-MM` form. */
export type CalendarMonth = string

/**
 * Six rows of seven. Fixed, not fitted to the month: a grid that grew a row
 * between September and November would make the panel jump height as you page
 * through it.
 */
export const CELLS_IN_GRID = 42

/**
 * One cell of a month grid.
 *
 * Every cell carries a real date — the leading and trailing ones belong to the
 * neighbouring months and render muted. Blanks were the first shape of this and
 * were wrong twice over: a half-empty first row reads as a rendering fault
 * rather than a design, and a range crossing a month boundary broke into two
 * disconnected bands with a hole where the week actually continues.
 */
export interface CalendarCell {
  date: StayDate
  /** False for the spill days from the previous or next month. */
  inMonth: boolean
}

/** Monday-first, which is how Brunei — and the rest of `en-GB` — reads a week. */
export const WEEKDAYS = [
  { short: 'Mo', long: 'Monday' },
  { short: 'Tu', long: 'Tuesday' },
  { short: 'We', long: 'Wednesday' },
  { short: 'Th', long: 'Thursday' },
  { short: 'Fr', long: 'Friday' },
  { short: 'Sa', long: 'Saturday' },
  { short: 'Su', long: 'Sunday' },
] as const

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function isCalendarMonth(value: string): value is CalendarMonth {
  return MONTH_PATTERN.test(value)
}

export function parseCalendarMonth(value: string): CalendarMonth {
  if (!isCalendarMonth(value)) {
    throw new Error(`Not a valid calendar month: ${value}. Expected YYYY-MM.`)
  }

  return value
}

/** The month a stay date falls in. */
export function monthOf(date: StayDate): CalendarMonth {
  return parseStayDate(date).slice(0, 7)
}

/** The first day of a month, as a stay date. */
export function firstDayOfMonth(month: CalendarMonth): StayDate {
  return `${parseCalendarMonth(month)}-01`
}

/**
 * Moves a month by `delta` months, wrapping the year.
 *
 * Done on a month index rather than by adding to a `Date`, which is the classic
 * way to turn 31 January + 1 month into 3 March.
 */
export function shiftMonth(month: CalendarMonth, delta: number): CalendarMonth {
  const parsed = parseCalendarMonth(month)
  const total = Number(parsed.slice(0, 4)) * 12 + (Number(parsed.slice(5, 7)) - 1) + delta

  if (total < 0) {
    throw new Error(`Calendar month out of range: ${month} shifted by ${delta}.`)
  }

  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${pad((total % 12) + 1)}`
}

/**
 * The 42 cells of a month grid, Monday-first, every one of them a real date.
 *
 * The two months shown side by side therefore overlap at their edges — the last
 * days of January appear again as February's lead. That duplication is the
 * price of a grid with no holes in it, and it is the right way round: a
 * calendar week is a continuous run of days, and a picker that drew it with
 * gaps would be lying about the week.
 */
export function monthGrid(month: CalendarMonth): readonly CalendarCell[] {
  const parsed = parseCalendarMonth(month)
  const year = Number(parsed.slice(0, 4))
  const index = Number(parsed.slice(5, 7)) - 1

  // getUTCDay is Sunday-first; shift it so Monday is 0.
  const lead = (new Date(Date.UTC(year, index, 1)).getUTCDay() + 6) % 7
  // Day 0 of the next month is the last day of this one.
  const dayCount = new Date(Date.UTC(year, index + 1, 0)).getUTCDate()

  return Array.from({ length: CELLS_IN_GRID }, (_, cell) => {
    const day = cell - lead + 1
    const inMonth = day >= 1 && day <= dayCount

    return {
      // Date.UTC normalises day 0 and day 32 into the neighbouring month, which
      // is exactly what the spill cells need.
      date: new Date(Date.UTC(year, index, day)).toISOString().slice(0, 10),
      inMonth,
    }
  })
}

/** The days of the month itself, without the spill. */
export function daysInMonth(month: CalendarMonth): readonly StayDate[] {
  return monthGrid(month)
    .filter((cell) => cell.inMonth)
    .map((cell) => cell.date)
}

/** The last day of a month, as a stay date. */
export function lastDayOfMonth(month: CalendarMonth): StayDate {
  const days = daysInMonth(month)

  // A month always has days, but the type does not know that.
  return days[days.length - 1] ?? firstDayOfMonth(month)
}

/** The grid's heading, e.g. `September 2026`. */
export function formatCalendarMonth(month: CalendarMonth): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${parseCalendarMonth(month)}-01T00:00:00Z`))
}

/**
 * The accessible name of a day cell, e.g. `Friday 12 September 2026`.
 *
 * Spelt out in full because the visible label is a bare numeral: without this a
 * screen reader announces "12" with no month, and every month sounds alike.
 */
export function formatDayLabel(date: StayDate): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${parseStayDate(date)}T00:00:00Z`))
}
