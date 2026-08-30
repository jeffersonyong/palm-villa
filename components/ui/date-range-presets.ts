import type { StayDateRange } from '@/components/ui/calendar'
import { addDays, todayInBrunei, type StayDate } from '@/lib/domain/dates'

import { lastDayOfMonth, monthOf, shiftMonth, firstDayOfMonth } from './calendar-month'

/**
 * The named spans on the date picker's rail.
 *
 * Almost every range a staff member wants is one of a handful, and paging a
 * calendar to reconstruct "this month" by hand is the kind of work a filter is
 * supposed to remove. The rail is a shortcut to the same value the grid
 * produces — never a separate mode — so a preset and a hand-picked range are
 * indistinguishable once chosen, and a preset that happens to match the current
 * range simply shows as selected.
 *
 * Six of them, weighted forwards. A bookings list is read to answer "who is
 * coming", so the past gets one entry — last month, for reconciliation — and
 * anything further back is a hand-picked range.
 *
 * Pure, and resolved against a date passed in rather than the clock, so the
 * whole set is assertable.
 */

export interface DateRangePreset {
  id: string
  label: string
  resolve: (today: StayDate) => StayDateRange
}

export const DATE_RANGE_PRESETS: readonly DateRangePreset[] = [
  {
    id: 'today',
    label: 'Today',
    resolve: (today) => ({ start: today, end: today }),
  },
  {
    id: 'tomorrow',
    label: 'Tomorrow',
    resolve: (today) => ({ start: addDays(today, 1), end: addDays(today, 1) }),
  },
  {
    id: 'next-7',
    label: 'Next 7 days',
    // Inclusive of today, so seven days means today plus six.
    resolve: (today) => ({ start: today, end: addDays(today, 6) }),
  },
  {
    id: 'this-month',
    label: 'This month',
    resolve: (today) => monthSpan(monthOf(today)),
  },
  {
    id: 'next-month',
    label: 'Next month',
    resolve: (today) => monthSpan(shiftMonth(monthOf(today), 1)),
  },
  {
    id: 'last-month',
    label: 'Last month',
    resolve: (today) => monthSpan(shiftMonth(monthOf(today), -1)),
  },
]

function monthSpan(month: string): StayDateRange {
  return { start: firstDayOfMonth(month), end: lastDayOfMonth(month) }
}

/**
 * Which preset, if any, the given range already is.
 *
 * Matched by value rather than remembered as a mode: a range picked off the
 * grid that happens to be exactly this month *is* this month, and a picker that
 * insisted otherwise would be arguing with what the reader can see.
 */
export function matchingPreset(
  range: StayDateRange | null,
  today: StayDate = todayInBrunei(),
): DateRangePreset | undefined {
  if (!range) {
    return undefined
  }

  return DATE_RANGE_PRESETS.find((preset) => {
    const resolved = preset.resolve(today)

    return resolved.start === range.start && resolved.end === range.end
  })
}
