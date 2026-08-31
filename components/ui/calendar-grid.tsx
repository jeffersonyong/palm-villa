'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { addDays, type StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

import {
  daysInMonth,
  firstDayOfMonth,
  formatCalendarMonth,
  formatDayLabel,
  lastDayOfMonth,
  monthGrid,
  monthOf,
  shiftMonth,
  WEEKDAYS,
  type CalendarCell,
  type CalendarMonth,
} from './calendar-month'

/**
 * The parts every calendar in the product is assembled from.
 *
 * There are two pickers — a two-month range (`RangeCalendar`, worn by the
 * filter chips) and a single day (`DayCalendar`, worn by form fields) — and
 * they must not drift apart. A staff member picking a stay on the bookings
 * filter and one picking a statement date on a payment form are looking at the
 * same grid: the same Monday-first six rows, the same 36px cell, the same today
 * dot, the same ink fill on what is chosen. So the month header, the grid, the
 * day cell and the keyboard model live here once, and each picker supplies only
 * the part that is genuinely different — how many days a click may choose.
 *
 * The single-day picker is what brought the bounds below. A filter is
 * unbounded; a form field for "check-in" is not — never before today, never
 * past the booking window. Bounds are stay-date strings on the same closed
 * interval the rest of the domain uses, so a caller passes exactly what it
 * would have put on a native date input's `min`/`max` and gets the same
 * meaning back.
 */

/** An inclusive span of stay dates. */
export interface StayDateRange {
  start: StayDate
  end: StayDate
}

/** The two ends of a selection, smallest first. */
export function orderRange(a: StayDate, b: StayDate): StayDateRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a }
}

/**
 * The days a picker will accept. Both ends inclusive; either may be absent,
 * which means unbounded on that side.
 */
export interface DayBounds {
  min?: StayDate
  max?: StayDate
}

export function isOutOfBounds(day: StayDate, { min, max }: DayBounds): boolean {
  return (min !== undefined && day < min) || (max !== undefined && day > max)
}

/** Pulls a day back inside the bounds, so keyboard motion stops at the edge. */
export function clampDay(day: StayDate, { min, max }: DayBounds): StayDate {
  if (min !== undefined && day < min) {
    return min
  }

  if (max !== undefined && day > max) {
    return max
  }

  return day
}

/** True when no day of the month is selectable — used to retire an arrow. */
export function isMonthOutOfBounds(month: CalendarMonth, bounds: DayBounds): boolean {
  return (
    isOutOfBounds(lastDayOfMonth(month), { min: bounds.min }) ||
    isOutOfBounds(firstDayOfMonth(month), { max: bounds.max })
  )
}

/**
 * Roving tabindex over the day grid, plus the keys that move it.
 *
 * One day is reachable by Tab and the arrow keys move between them: 42 tab
 * stops in a single month — 84 in the range picker — would make the keyboard
 * path through the screen unusable.
 *
 * Focus is restored in an effect rather than on the keystroke, because the day
 * being moved to may not be rendered yet: arrowing off the edge of the visible
 * window has to bring its month forward first. Below `md` the range picker's
 * trailing month is `display: none`, and a hidden element cannot take focus, so
 * a day that exists but is not on screen is treated the same way — page to it,
 * then focus on the next pass.
 */
export function useCalendarFocus({
  initialDay,
  months,
  leadMonth,
  setLeadMonth,
  bounds,
  onFocusedDayChange,
}: {
  initialDay: StayDate
  /** How many months the grid shows side by side. */
  months: number
  leadMonth: CalendarMonth
  setLeadMonth: (month: CalendarMonth) => void
  bounds: DayBounds
  /** Fires when the keyboard moves focus, for a picker tracking a hover. */
  onFocusedDayChange?: (day: StayDate) => void
}) {
  const [focusedDay, setFocusedDay] = useState(initialDay)
  const shouldRestoreFocus = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!shouldRestoreFocus.current) {
      return
    }

    const target = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-day="${CSS.escape(focusedDay)}"]`,
    )

    const isHidden = !target || target.offsetParent === null
    const month = monthOf(focusedDay)

    if (isHidden && month !== leadMonth) {
      setLeadMonth(month)
      return
    }

    shouldRestoreFocus.current = false
    target?.focus()
  }, [focusedDay, leadMonth, setLeadMonth])

  /** Brings a month into the visible window, by the shortest move. */
  function reveal(month: CalendarMonth) {
    if (month < leadMonth) {
      setLeadMonth(month)
    } else if (month > shiftMonth(leadMonth, months - 1)) {
      setLeadMonth(shiftMonth(month, -(months - 1)))
    }
  }

  function moveFocus(next: StayDate) {
    // Clamped, not blocked: arrowing past the first bookable day should land on
    // it rather than doing nothing, which reads as a dead key.
    const day = clampDay(next, bounds)

    shouldRestoreFocus.current = true
    setFocusedDay(day)
    reveal(monthOf(day))
    onFocusedDayChange?.(day)
  }

  /**
   * Handles the grid's navigation keys, reporting whether it consumed one so a
   * picker can layer its own keys (Escape, say) on top.
   */
  function handleNavigationKey(event: React.KeyboardEvent): boolean {
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
      return true
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

      return true
    }

    return false
  }

  return { gridRef, focusedDay, setFocusedDay, reveal, moveFocus, handleNavigationKey }
}

interface MonthHeaderProps {
  month: CalendarMonth
  showPrevious: boolean
  showNext: boolean
  /** Retires an arrow that would page into months with nothing selectable. */
  disablePrevious?: boolean
  disableNext?: boolean
  nextClassName?: string
  onPrevious: () => void
  onNext: () => void
}

export function MonthHeader({
  month,
  showPrevious,
  showNext,
  disablePrevious,
  disableNext,
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
          disabled={disablePrevious}
          onClick={onPrevious}
        />
      ) : null}
      <span className="text-body-sm-strong text-foreground">{formatCalendarMonth(month)}</span>
      {showNext ? (
        <StepButton
          className={cn('absolute right-0', nextClassName)}
          label="Next month"
          icon={ChevronRight}
          disabled={disableNext}
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
  disabled,
  onClick,
}: {
  label: string
  icon: typeof ChevronLeft
  className?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-control-sm items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors outline-none',
        'hover:bg-muted hover:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
        // An arrow at the edge of the bookable window fades rather than
        // disappearing, the way pagination's do — the header keeps its shape
        // instead of reflowing as you reach the end.
        'disabled:pointer-events-none disabled:opacity-40',
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
  /**
   * What the grid paints. A single-day picker passes the chosen day as a
   * degenerate range, which draws one filled cell and no band.
   */
  active: StayDateRange | null
  /** True while a range is half-picked — the far end stays a drawn chip. */
  provisional?: boolean
  anchor?: StayDate | null
  focusedDay: StayDate
  bounds?: DayBounds
  /** `shouldReveal` asks the parent to bring the day's month into view. */
  onPick: (day: StayDate, shouldReveal: boolean) => void
  onHover?: (day: StayDate) => void
}

export function MonthGrid({
  month,
  today,
  active,
  provisional = false,
  anchor = null,
  focusedDay,
  bounds,
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
                bounds={bounds}
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
  provisional = false,
  anchor = null,
  focusedDay,
  bounds,
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
  const isDisabled = bounds !== undefined && isOutOfBounds(day, bounds)

  // A spill day is still a real day and still selectable — it just belongs to
  // a month this grid is not about, so it recedes. Inside the band it comes
  // back to the resting colour, because a muted numeral on the band would read
  // as disabled.
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
        disabled={isDisabled}
        // Only the month's own selectable days are in the roving order. A spill
        // day is a duplicate of a cell the neighbouring grid also renders, and
        // putting both in the sequence would land the same date twice.
        tabIndex={day === focusedDay && !isSpill && !isDisabled ? 0 : -1}
        aria-label={formatDayLabel(day)}
        aria-pressed={isFilled || isSoftEnd}
        onClick={() => {
          // Clicking into a neighbouring month brings that month into view, so
          // the click does not appear to do nothing when the day it selected
          // scrolls out from under the pointer.
          onPick(day, monthOf(day) !== month)
        }}
        onPointerEnter={() => onHover?.(day)}
        onFocus={() => onHover?.(day)}
        className={cn(
          'relative flex size-9 items-center justify-center rounded-md text-body-sm transition-colors outline-none',
          'hover:bg-muted',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover',
          dayTextClasses({ isFilled, isSoftEnd, isToday, isRecessed: isSpill && !isInBand }),
          (isToday || isSoftEnd || isFilled) && 'font-medium',
          // Both selected treatments pin their own fill on hover, so a day
          // already chosen does not flicker to the hover surface under the
          // pointer.
          isSoftEnd && 'border border-border bg-card hover:bg-card',
          isFilled && 'bg-primary hover:bg-primary',
          // Last, so it wins over everything above it: a day outside the window
          // is not offered at all — no surface, no pointer, no weight — and it
          // sits one step below the spill so the two never read alike.
          'disabled:pointer-events-none disabled:bg-transparent disabled:font-normal disabled:text-muted-foreground/45',
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

/**
 * A day's text colour, as exactly one class rather than a stack of them.
 *
 * **Two legible steps: the month's own days, and the spill.** An earlier
 * version put resting days on `copy` and kept `foreground` back for today and
 * the ends, but `copy` and `muted-foreground` are only 1.8:1 apart on white —
 * too close to tell at 14px in a grid where the two sit one cell apart, while
 * the step above them was twice as big. So the month's own days now take
 * `foreground` outright and the spill stays `muted-foreground`: ~3.7:1 between
 * them in light, ~3.2:1 in dark, both shades still clearing AA. Emphasis does
 * not need the colour — today has its dot and weight, a hovered day has the
 * surface, an end in progress has its drawn chip, and a chosen end is a fill.
 *
 * Dark takes the spill at 80%, because `muted-foreground` there is already
 * lifted toward `canvas-soft` and lands too near white on an ink ground.
 *
 * Returned as one value because a base utility and a `dark:` one for the same
 * property are *not* a conflict `tailwind-merge` resolves — both survive into
 * the stylesheet and source order decides the winner. Layering them works until
 * one day it quietly does not.
 */
function dayTextClasses({
  isFilled,
  isSoftEnd,
  isToday,
  isRecessed,
}: {
  isFilled: boolean
  isSoftEnd: boolean
  isToday: boolean
  isRecessed: boolean
}): string {
  if (isFilled) {
    return 'text-primary-foreground hover:text-primary-foreground'
  }

  // A spill day recedes — unless it is today, or an end of the selection in
  // progress, both of which are marked wherever in the grid they fall.
  if (isRecessed && !isToday && !isSoftEnd) {
    return 'text-muted-foreground hover:text-foreground dark:text-muted-foreground/80'
  }

  return 'text-foreground'
}
