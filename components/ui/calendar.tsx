'use client'

import { useState } from 'react'

import {
  isMonthOutOfBounds,
  MonthGrid,
  MonthHeader,
  orderRange,
  useCalendarFocus,
  type DayBounds,
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
 * `selection="stay"` is the exception, and it is not a different look: the
 * grid, the band and the ends are drawn identically. What changes is what the
 * two days *mean*. A span's ends are the same kind of thing, so they sort; a
 * stay's are an arrival and a departure, so they cannot.
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
  /**
   * What the two ends are, which is the whole of the difference.
   *
   * `span` is the filter's pair — two days of the same kind, taken in either
   * order and sorted, and one day clicked twice is a one-day range.
   *
   * `stay` is an arrival and a departure, and design.md §Components (the
   * booking calendar) settles how those behave: a second click that is not
   * after the first **re-anchors** rather than swapping the ends, because a
   * day before the arrival is not a check-out morning anybody meant to name.
   * A second click on the anchor itself is zero nights, which is not a stay —
   * it is left as a half-made selection, so a mis-click costs one click
   * rather than two. The range it emits is half-open: `end` is the departure
   * morning, the day the guest leaves and the night nobody sleeps in.
   */
  selection?: 'span' | 'stay'
  /**
   * The days on offer. A filter is never bounded — staff look backwards as
   * often as forwards — so this is open at both ends by default. A stay is
   * bounded, by the booking window.
   */
  bounds?: DayBounds
  className?: string
}

export function RangeCalendar({
  value,
  onSelect,
  onDraftChange,
  months = 2,
  selection = 'span',
  bounds = {},
  className,
}: RangeCalendarProps) {
  const isStay = selection === 'stay'
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
    bounds,
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
  const active: StayDateRange | null = provisional
    ? // A stay paints nothing backwards. Pointing before the arrival is a
      // re-anchor about to happen, and a band running the wrong way says the
      // opposite — that those days are about to be booked.
      isStay && hovered !== null && hovered < anchor
      ? { start: anchor, end: anchor }
      : orderRange(anchor, hovered ?? anchor)
    : value

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

    if (isStay && day <= anchor) {
      // Not a departure. The click becomes a new arrival rather than being
      // ignored: a clerk who clicks an earlier day has almost always changed
      // their mind about where the stay starts.
      const isSameDay = day === anchor

      setAnchor(day)
      setHovered(day)

      if (!isSameDay) {
        onDraftChange?.(day)
      }

      return
    }

    setAnchor(null)
    setHovered(null)
    onDraftChange?.(null)
    onSelect(isStay ? { start: anchor, end: day } : orderRange(anchor, day))
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
            // Both arrows step the *lead* month — the trailing month's Next is
            // the lead's — so both ask about the month the lead is about to
            // become, never about the far edge of the window. Asking about the
            // trailing month would strand the last bookable month below `md`,
            // where only the lead is on screen.
            disablePrevious={isMonthOutOfBounds(shiftMonth(leadMonth, -1), bounds)}
            disableNext={isMonthOutOfBounds(shiftMonth(leadMonth, 1), bounds)}
            onPrevious={() => setLeadMonth(shiftMonth(leadMonth, -1))}
            onNext={() => setLeadMonth(shiftMonth(leadMonth, 1))}
          />
          <MonthGrid
            month={month}
            today={today}
            bounds={bounds}
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
