'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { addDays, todayInBrunei, type StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

import {
  daysInMonth,
  formatCalendarMonth,
  formatDayLabel,
  monthGrid,
  monthOf,
  shiftMonth,
  WEEKDAYS,
  type CalendarCell,
  type CalendarMonth,
} from './calendar-month'

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
 * Everything visual here is already in the system. The band between the ends is
 * `canvas-soft`, the same faint gray as a selected chip; the two ends are the
 * action fill, which on the operations surfaces is ink and never teal; today is
 * a dot, not a colour. The grid is always six rows and every cell of it holds a
 * real day — the spill from the neighbouring months included, muted but fully
 * selectable — so the panel never changes height and a range crossing a month
 * boundary stays one unbroken band instead of two pieces with a hole between.
 */

/** An inclusive span of stay dates. */
export interface StayDateRange {
  start: StayDate
  end: StayDate
}

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

function orderRange(a: StayDate, b: StayDate): StayDateRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a }
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

  // Roving tabindex: one day is reachable by Tab and the arrow keys move
  // between them. 84 tab stops in a two-month panel would make the keyboard
  // path through this screen unusable.
  const [focusedDay, setFocusedDay] = useState<StayDate>(() => value?.start ?? today)
  const shouldRestoreFocus = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!shouldRestoreFocus.current) {
      return
    }

    const target = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-day="${CSS.escape(focusedDay)}"]`,
    )

    // Below `md` the trailing month is `display: none`, and a hidden element
    // cannot take focus — arrowing into it would drop focus to the body. When
    // the day the keyboard asked for is not on screen, bring its month to the
    // front instead and focus on the next pass.
    const isHidden = !target || target.offsetParent === null
    const month = monthOf(focusedDay)

    if (isHidden && month !== leadMonth) {
      setLeadMonth(month)
      return
    }

    shouldRestoreFocus.current = false
    target?.focus()
  }, [focusedDay, leadMonth])

  const visibleMonths = Array.from({ length: months }, (_, offset) => shiftMonth(leadMonth, offset))

  /**
   * What the grid paints right now: the committed range, or — while a
   * selection is in progress — the anchor stretched to whichever day the
   * pointer or keyboard is on.
   */
  const provisional = anchor !== null
  const active: StayDateRange | null = provisional ? orderRange(anchor, hovered ?? anchor) : value

  /** Brings a month into the visible window, by the shortest move. */
  function reveal(month: CalendarMonth) {
    if (month < leadMonth) {
      setLeadMonth(month)
    } else if (month > shiftMonth(leadMonth, months - 1)) {
      setLeadMonth(shiftMonth(month, -(months - 1)))
    }
  }

  function moveFocus(next: StayDate) {
    shouldRestoreFocus.current = true
    setFocusedDay(next)
    // Follow the focus if it walks off either edge of the visible months.
    reveal(monthOf(next))

    if (provisional) {
      setHovered(next)
    }
  }

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
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }

    const step = steps[event.key]

    if (step !== undefined) {
      event.preventDefault()
      moveFocus(addDays(focusedDay, step))
      return
    }

    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const month = shiftMonth(monthOf(focusedDay), event.key === 'PageUp' ? -1 : 1)
      // Clamp to the month's length so 31 March never lands in April.
      const days = daysInMonth(month)
      const day = days[Math.min(Number(focusedDay.slice(8, 10)), days.length) - 1]

      if (day) {
        moveFocus(day)
      }

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

interface MonthHeaderProps {
  month: CalendarMonth
  showPrevious: boolean
  showNext: boolean
  nextClassName?: string
  onPrevious: () => void
  onNext: () => void
}

function MonthHeader({
  month,
  showPrevious,
  showNext,
  nextClassName,
  onPrevious,
  onNext,
}: MonthHeaderProps) {
  return (
    <div className="relative flex h-control items-center justify-center">
      {showPrevious ? (
        <StepButton
          className="absolute left-0"
          label="Previous month"
          icon={ChevronLeft}
          onClick={onPrevious}
        />
      ) : null}
      <span className="text-body-sm-strong text-foreground">{formatCalendarMonth(month)}</span>
      {showNext ? (
        <StepButton
          className={cn('absolute right-0', nextClassName)}
          label="Next month"
          icon={ChevronRight}
          onClick={onNext}
        />
      ) : null}
    </div>
  )
}

function StepButton({
  label,
  icon: Icon,
  className,
  onClick,
}: {
  label: string
  icon: typeof ChevronLeft
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors outline-none',
        'hover:bg-muted hover:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  )
}

interface MonthGridProps {
  month: CalendarMonth
  today: StayDate
  active: StayDateRange | null
  provisional: boolean
  anchor: StayDate | null
  focusedDay: StayDate
  /** `shouldReveal` asks the parent to bring the day's month into view. */
  onPick: (day: StayDate, shouldReveal: boolean) => void
  onHover: (day: StayDate) => void
}

function MonthGrid({
  month,
  today,
  active,
  provisional,
  anchor,
  focusedDay,
  onPick,
  onHover,
}: MonthGridProps) {
  const cells = monthGrid(month)

  return (
    <table
      // Weeks are separated by a small vertical gap and nothing horizontal:
      // the band across a week has to stay one continuous strip, but stacked
      // weeks read as a solid block without a little air between them.
      className="mt-xs border-separate border-spacing-x-0 border-spacing-y-[3px]"
    >
      <thead>
        <tr>
          {WEEKDAYS.map((weekday) => (
            <th key={weekday.long} scope="col" className="pb-sm micro-label text-muted-foreground">
              <span className="sr-only">{weekday.long}</span>
              <span aria-hidden>{weekday.short}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <tr key={row}>
            {cells.slice(row * 7, row * 7 + 7).map((cell, column) => (
              <DayCell
                key={cell.date}
                cell={cell}
                column={column}
                month={month}
                today={today}
                active={active}
                provisional={provisional}
                anchor={anchor}
                focusedDay={focusedDay}
                onPick={onPick}
                onHover={onHover}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface DayCellProps extends MonthGridProps {
  cell: CalendarCell
  column: number
}

function DayCell({
  cell,
  column,
  month,
  today,
  active,
  provisional,
  anchor,
  focusedDay,
  onPick,
  onHover,
}: DayCellProps) {
  const day = cell.date

  const isStart = active !== null && day === active.start
  const isEnd = active !== null && day === active.end
  const isSpan = active !== null && active.start !== active.end
  const isBetween = active !== null && day > active.start && day < active.end
  const isInBand = isSpan && (isBetween || isStart || isEnd)

  // While a selection is in progress only the anchor is filled; the far end
  // stays a drawn chip, so "committed" and "where my pointer is" never look
  // alike. The band runs under the fill and is hidden by it, which is what
  // gives a continuous strip with a solid cap at each end.
  const isFilled = provisional ? day === anchor : isStart || isEnd
  const isSoftEnd = provisional && !isFilled && (isStart || isEnd)
  const isToday = day === today

  // A spill day is still a real day and still selectable — it just belongs to
  // a month this grid is not about, so it recedes. Inside the band it comes
  // back to `copy`, because a muted numeral on the band would read as disabled.
  const isSpill = !cell.inMonth

  return (
    <td
      className={cn(
        'size-9 p-0',
        isInBand && 'bg-muted',
        // Soft ends at the week's edges, and at the range's own ends, so the
        // strip never runs into a hard corner.
        isInBand && (isStart || column === 0) && 'rounded-l-md',
        isInBand && (isEnd || column === 6) && 'rounded-r-md',
      )}
    >
      <button
        type="button"
        data-day={day}
        data-spill={isSpill || undefined}
        // Only the month's own days are in the roving order. A spill day is a
        // duplicate of a cell the neighbouring grid also renders, and putting
        // both in the sequence would land the same date twice.
        tabIndex={day === focusedDay && !isSpill ? 0 : -1}
        aria-label={formatDayLabel(day)}
        aria-pressed={isFilled || isSoftEnd}
        onClick={() => {
          // Clicking into a neighbouring month brings that month into view, so
          // the click does not appear to do nothing when the day it selected
          // scrolls out from under the pointer.
          onPick(day, monthOf(day) !== month)
        }}
        onPointerEnter={() => onHover(day)}
        onFocus={() => onHover(day)}
        className={cn(
          'relative flex size-9 items-center justify-center rounded-md text-body-sm transition-colors outline-none',
          'text-copy hover:bg-muted hover:text-foreground',
          isSpill && !isInBand && 'text-muted-foreground/70',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover',
          isToday && !isFilled && !isSoftEnd && 'font-medium text-foreground',
          // Both selected treatments pin their own hover. Without it the row's
          // generic `hover:text-foreground` still applies — a hover variant and
          // a base colour are not a conflict tailwind-merge resolves — and ink
          // text lands on the ink fill, which is a day you cannot read.
          isSoftEnd &&
            'border border-border bg-card font-medium text-foreground hover:bg-card hover:text-foreground',
          isFilled &&
            'bg-primary font-medium text-primary-foreground hover:bg-primary hover:text-primary-foreground',
        )}
      >
        {/* The numeral is centred in the cell and stays centred: the today mark
            is taken out of the flow rather than stacked under it, which is what
            was pushing every numeral in the grid a couple of pixels high. */}
        {Number(day.slice(8, 10))}
        {isToday ? (
          <span
            aria-hidden
            className="absolute bottom-[5px] left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-current opacity-70"
          />
        ) : null}
      </button>
    </td>
  )
}
