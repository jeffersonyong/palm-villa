'use client'

import { useState } from 'react'

import {
  clampDay,
  isMonthOutOfBounds,
  MonthGrid,
  MonthHeader,
  useCalendarFocus,
  type DayBounds,
} from '@/components/ui/calendar-grid'
import { todayInBrunei, type StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

import { monthOf, shiftMonth, type CalendarMonth } from './calendar-month'

/**
 * A single-month, single-day calendar — the grid inside `DateField`.
 *
 * The same six rows, the same 36px cell, the same today dot and the same ink
 * fill as the range picker, because they are literally the same components; the
 * only thing that changes is that one click is the whole answer. The chosen day
 * is handed to `MonthGrid` as a range whose ends are equal, which draws a single
 * filled cell and no band — the band only exists where the two ends differ.
 *
 * One month, not two: a form field is asking for one day, and a second month
 * beside it would be offering a span that cannot be picked here.
 *
 * `bounds` is what a native date input's `min`/`max` used to carry. Days outside
 * it are rendered but not offered — visible, so a staff member can see that the
 * 3rd exists and is simply not bookable, rather than finding a hole in the week
 * — and an arrow retires once there is nothing selectable beyond it.
 */

interface DayCalendarProps {
  /** The chosen day, or `null` when nothing is set. */
  value: StayDate | null
  /** Fires on the click — one click is the whole selection. */
  onSelect: (day: StayDate) => void
  bounds?: DayBounds
  className?: string
}

export function DayCalendar({ value, onSelect, bounds = {}, className }: DayCalendarProps) {
  const [today] = useState(() => todayInBrunei())

  // Opens on the chosen day, otherwise on today — pulled inside the bounds, so
  // a field whose window starts next month does not open on an empty grid.
  const [leadMonth, setLeadMonth] = useState<CalendarMonth>(() =>
    monthOf(value ?? clampDay(today, bounds)),
  )

  const { gridRef, focusedDay, setFocusedDay, reveal, handleNavigationKey } = useCalendarFocus({
    initialDay: value ?? clampDay(today, bounds),
    months: 1,
    leadMonth,
    setLeadMonth,
    bounds,
  })

  function pick(day: StayDate, shouldReveal = false) {
    if (shouldReveal) {
      reveal(monthOf(day))
    }

    setFocusedDay(day)
    onSelect(day)
  }

  return (
    <div ref={gridRef} className={cn('inline-block', className)} onKeyDown={handleNavigationKey}>
      <MonthHeader
        month={leadMonth}
        showPrevious
        showNext
        disablePrevious={isMonthOutOfBounds(shiftMonth(leadMonth, -1), bounds)}
        disableNext={isMonthOutOfBounds(shiftMonth(leadMonth, 1), bounds)}
        onPrevious={() => setLeadMonth(shiftMonth(leadMonth, -1))}
        onNext={() => setLeadMonth(shiftMonth(leadMonth, 1))}
      />
      <MonthGrid
        month={leadMonth}
        today={today}
        // A single day is a range whose ends are equal: one filled cell, no band.
        active={value ? { start: value, end: value } : null}
        focusedDay={focusedDay}
        bounds={bounds}
        onPick={pick}
      />
    </div>
  )
}
