'use client'

import { useState } from 'react'

import {
  MonthGrid,
  MonthHeader,
  orderRange,
  useCalendarFocus,
  type StayDateRange,
} from '@/components/ui/calendar-grid'
import { todayInBrunei, type StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

import { monthOf, shiftMonth, type CalendarMonth } from './calendar-month'

export type { StayDateRange }

/**
 * A two-month range calendar (design.md §Components — Date range).
 *
 * The interaction is the whole point: click a day, click another, done. There
 * is no "from" field and no "to" field to keep in step, no second control to
 * tab to, and no way to enter a range that ends before it starts — the
 * component takes the two clicks in either order and sorts them.
 *
 * Both ends are **inclusive**: the days you point at are the days you get.
 * Callers that need the half-open occupancy convention convert at their own
 * boundary, which is the honest place for it — see the bookings list.
 *
 * Everything visual lives in `calendar-grid.tsx`, shared with the single-day
 * picker: the band between the ends is `canvas-soft`, the same faint gray as a
 * selected chip; the two ends are the action fill, which on the operations
 * surfaces is ink and never teal; today is a dot, not a colour. The grid is
 * always six rows and every cell of it holds a real day — the spill from the
 * neighbouring months included, muted but fully selectable — so the panel never
 * changes height and a range crossing a month boundary stays one unbroken band
 * instead of two pieces with a hole between.
 */

interface RangeCalendarProps {
  /** The committed range, or `null` when the filter is off. */
  value: StayDateRange | null
  /** Fires once, when the second click completes a range. */
  onSelect: (range: StayDateRange) => void
  /**
   * The day the first click landed on, reported so a surrounding panel can say
   * which half of the range is still outstanding. `null` between selections.
   */
  onDraftChange?: (anchor: StayDate | null) => void
  /** How many months to show side by side. The second is hidden below `md`. */
  months?: number
  className?: string
}

export function RangeCalendar({
  value,
  onSelect,
  onDraftChange,
  months = 2,
  className,
}: RangeCalendarProps) {
  const [today] = useState(() => todayInBrunei())

  // The left-hand month. Opens on the committed range, otherwise on today.
  const [leadMonth, setLeadMonth] = useState<CalendarMonth>(() => monthOf(value?.start ?? today))
  /** The first click of an in-progress selection; `null` between selections. */
  const [anchor, setAnchor] = useState<StayDate | null>(null)
  const [hovered, setHovered] = useState<StayDate | null>(null)

  const provisional = anchor !== null

  const { gridRef, focusedDay, setFocusedDay, reveal, handleNavigationKey } = useCalendarFocus({
    initialDay: value?.start ?? today,
    months,
    leadMonth,
    setLeadMonth,
    // A filter is never bounded: staff look backwards as often as forwards.
    bounds: {},
    onFocusedDayChange: (day) => {
      if (provisional) {
        setHovered(day)
      }
    },
  })

  const visibleMonths = Array.from({ length: months }, (_, offset) => shiftMonth(leadMonth, offset))

  /**
   * What the grid paints right now: the committed range, or — while a
   * selection is in progress — the anchor stretched to whichever day the
   * pointer or keyboard is on.
   */
  const active: StayDateRange | null = provisional ? orderRange(anchor, hovered ?? anchor) : value

  function pick(day: StayDate, shouldReveal = false) {
    if (shouldReveal) {
      reveal(monthOf(day))
    }

    setFocusedDay(day)

    if (anchor === null) {
      setAnchor(day)
      setHovered(day)
      onDraftChange?.(day)
      return
    }

    setAnchor(null)
    setHovered(null)
    onDraftChange?.(null)
    onSelect(orderRange(anchor, day))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (handleNavigationKey(event)) {
      return
    }

    if (event.key === 'Escape' && provisional) {
      // Abandon a half-made selection without closing the popover around it.
      event.stopPropagation()
      setAnchor(null)
      setHovered(null)
      onDraftChange?.(null)
    }
  }

  return (
    <div
      ref={gridRef}
      className={cn('flex items-start', className)}
      onKeyDown={handleKeyDown}
      onPointerLeave={() => {
        if (provisional) {
          setHovered(anchor)
        }
      }}
    >
      {visibleMonths.map((month, index) => (
        <div
          key={month}
          className={cn(
            'shrink-0',
            index > 0 && 'ml-lg hidden border-l border-divider pl-lg md:block',
          )}
        >
          <MonthHeader
            month={month}
            // The lone visible month below `md` has to carry both arrows.
            showPrevious={index === 0}
            showNext={index === months - 1 || index === 0}
            nextClassName={index === 0 && months > 1 ? 'md:hidden' : undefined}
            onPrevious={() => setLeadMonth(shiftMonth(leadMonth, -1))}
            onNext={() => setLeadMonth(shiftMonth(leadMonth, 1))}
          />
          <MonthGrid
            month={month}
            today={today}
            active={active}
            provisional={provisional}
            anchor={anchor}
            focusedDay={focusedDay}
            onPick={pick}
            onHover={setHovered}
          />
        </div>
      ))}
    </div>
  )
}
