import { isCalendarMonth, monthOf, type CalendarMonth } from '@/components/ui/calendar-month'
import type { StayDate } from '@/lib/domain/dates'

/**
 * The calendar's URL state: which month, which unit types, and whether the
 * units with nothing on them are shown.
 *
 * Shared by the server page and the control-line island, so it imports
 * nothing that only one side can load — the same reason the audit screen's
 * page-size module has no `'use client'`.
 *
 * The month is the *view*, not a filter. The current month is the absence of
 * the param, which is the rule every list screen follows for its default: an
 * unfiltered view and its first page share a URL, and here the month you
 * would open on anyway does too.
 */

export const CALENDAR_PATH = '/portal/bookings/calendar'

/**
 * The months a URL may name. `isCalendarMonth('0000-01')` is true, and
 * `shiftMonth` throws below year zero — so a hand-edited URL plus the previous
 * arrow could 500 the page. Bounded to a century either side of now, which is
 * wider than any booking will ever be and narrower than the failure.
 */
const EARLIEST_MONTH = '2000-01'
const LATEST_MONTH = '2099-12'

/**
 * The month to show. Anything unusable — garbage, a real month outside the
 * bounds above — falls back to today's month rather than erroring, matching
 * `readStayWindow`'s contract for the list screens.
 */
export function readMonth(value: string | undefined, today: StayDate): CalendarMonth {
  if (
    value !== undefined &&
    isCalendarMonth(value) &&
    value >= EARLIEST_MONTH &&
    value <= LATEST_MONTH
  ) {
    return value
  }

  return monthOf(today)
}

/**
 * Whether every unit is drawn, or only the ones something happens in.
 *
 * The concise grid is the default and writes no param, which is the rule the
 * month already follows: the view a reader opens on unasked has the bare path.
 * `?units=all` is the widened one.
 */
export const ALL_UNITS = 'all'

export function readShowAllUnits(value: string | undefined): boolean {
  return value === ALL_UNITS
}

/**
 * The calendar's own route for a month, a set of unit types, and whether the
 * empty units are shown. A null month is "the current one" and writes no
 * param; no params at all is the bare path.
 */
export function calendarHref(
  month: CalendarMonth | null,
  types: readonly string[],
  showAllUnits = false,
): string {
  const params = new URLSearchParams()

  if (month !== null) {
    params.set('month', month)
  }

  for (const type of types) {
    params.append('type', type)
  }

  if (showAllUnits) {
    params.set('units', ALL_UNITS)
  }

  const query = params.toString()

  return query === '' ? CALENDAR_PATH : `${CALENDAR_PATH}?${query}`
}
