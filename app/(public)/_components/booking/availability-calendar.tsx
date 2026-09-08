'use client'

import { useState } from 'react'

import {
  MonthHeader,
  isOutOfBounds,
  orderRange,
  useCalendarFocus,
  type DayBounds,
  type StayDateRange,
} from '@/components/ui/calendar-grid'
import {
  WEEKDAYS,
  formatDayLabel,
  monthGrid,
  monthOf,
  shiftMonth,
  type CalendarMonth,
} from '@/components/ui/calendar-month'
import { formatStayRange, nightsBetween, type StayDate } from '@/lib/domain/dates'
import { formatCents, type Cents } from '@/lib/domain/money'
import { cn } from '@/lib/utils'

/**
 * The public availability calendar (capability A1, design.md §Components).
 *
 * A different component from the portal's range picker and from its booking
 * calendar, and design.md required it to be specified before it was built —
 * because it is the one calendar in the product that carries **information in
 * the cell**. A staff member filtering a list already knows the dates they
 * want; a customer is choosing them, and the two things they are choosing on
 * are what is free and what it costs.
 *
 * So a cell is a night: the numeral, and under it the rate for the unit type
 * on the segmented control above. A night nobody can sell says *Full* where
 * the rate would be — no strike-through and no red, because a sold-out
 * Saturday is a fact rather than a warning, and colouring it would make a
 * calendar of ordinary weekends look like a page of errors.
 *
 * **The second click is the check-out morning.** That is the one place this
 * differs from the range picker, whose ends are both inclusive: a stay
 * `[12, 15)` is three nights and the 15th belongs to nobody, so the 15th is
 * drawn as an end, is not charged, and does not have to be free. The footer
 * says the nights out loud for exactly that reason.
 */

export interface AvailabilityCalendarProps {
  /** Free units per night, per unit-type slug. Serialised from the server. */
  nightsFree: Readonly<Record<string, Readonly<Record<string, number>>>>
  /** The type whose prices and availability the grid is painting. */
  unitTypeSlug: string
  /** That type's nightly rate, in cents. */
  ratePerNight: Cents
  today: StayDate
  bounds: DayBounds
  value: StayDateRange | null
  onSelect: (range: StayDateRange) => void
  months?: number
  className?: string
}

export function AvailabilityCalendar({
  nightsFree,
  unitTypeSlug,
  ratePerNight,
  today,
  bounds,
  value,
  onSelect,
  months = 2,
  className,
}: AvailabilityCalendarProps) {
  const [leadMonth, setLeadMonth] = useState<CalendarMonth>(() => monthOf(value?.start ?? today))
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

  const active: StayDateRange | null = provisional ? orderRange(anchor, hovered ?? anchor) : value
  const visibleMonths = Array.from({ length: months }, (_, offset) => shiftMonth(leadMonth, offset))

  function freeOn(day: StayDate): number {
    return nightsFree[day]?.[unitTypeSlug] ?? 0
  }

  function pick(day: StayDate, shouldReveal = false) {
    if (shouldReveal) {
      reveal(monthOf(day))
    }

    setFocusedDay(day)

    // A first click has to land on a night somebody can actually have. A
    // second click is a check-out morning, which nobody sleeps in, so it is
    // allowed to be full.
    if (anchor === null) {
      if (freeOn(day) < 1) {
        return
      }

      setAnchor(day)
      setHovered(day)
      return
    }

    if (day === anchor) {
      // Zero nights is not a stay. Left as a half-made selection rather than
      // cleared, so a mis-click costs one click rather than two.
      return
    }

    const range = orderRange(anchor, day)

    setAnchor(null)
    setHovered(null)
    onSelect(range)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (handleNavigationKey(event)) {
      return
    }

    if (event.key === 'Escape' && provisional) {
      event.stopPropagation()
      setAnchor(null)
      setHovered(null)
    }
  }

  return (
    <div className={className}>
      <div
        ref={gridRef}
        className="flex items-start"
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
              'min-w-0 shrink-0',
              index > 0 && 'ml-xl hidden border-l border-divider pl-xl md:block',
            )}
          >
            <MonthHeader
              month={month}
              showPrevious={index === 0}
              showNext={index === months - 1 || index === 0}
              nextClassName={index === 0 && months > 1 ? 'md:hidden' : undefined}
              onPrevious={() => setLeadMonth(shiftMonth(leadMonth, -1))}
              onNext={() => setLeadMonth(shiftMonth(leadMonth, 1))}
            />

            <table className="mt-xs border-separate border-spacing-x-0 border-spacing-y-[3px]">
              <thead>
                <tr>
                  {WEEKDAYS.map((weekday) => (
                    <th
                      key={weekday.long}
                      scope="col"
                      className="pb-sm micro-label text-muted-foreground"
                    >
                      <span className="sr-only">{weekday.long}</span>
                      <span aria-hidden>{weekday.short}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_unused, row) => (
                  <tr key={row}>
                    {monthGrid(month)
                      .slice(row * 7, row * 7 + 7)
                      .map((cell) => (
                        <NightCell
                          key={cell.date}
                          date={cell.date}
                          inMonth={cell.inMonth}
                          today={today}
                          free={freeOn(cell.date)}
                          ratePerNight={ratePerNight}
                          active={active}
                          provisional={provisional}
                          anchor={anchor}
                          focused={focusedDay === cell.date}
                          outOfBounds={isOutOfBounds(cell.date, bounds)}
                          onPick={pick}
                          onHover={setHovered}
                        />
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <CalendarFooter
        active={active}
        provisional={provisional}
        anchor={anchor}
        unitTypeSlug={unitTypeSlug}
      />
    </div>
  )
}

interface NightCellProps {
  date: StayDate
  inMonth: boolean
  today: StayDate
  free: number
  ratePerNight: Cents
  active: StayDateRange | null
  provisional: boolean
  anchor: StayDate | null
  focused: boolean
  outOfBounds: boolean
  onPick: (day: StayDate, shouldReveal: boolean) => void
  onHover: (day: StayDate) => void
}

/**
 * One night.
 *
 * The states are the range picker's, plus one this calendar alone has: a night
 * with nothing free. It is drawn rather than hidden — a customer can see the
 * 14th exists and is simply gone, which is what stops the grid looking broken
 * — and it is not a tab stop, because tabbing through a fortnight of sold-out
 * Saturdays to reach the one free week is not navigation.
 */
function NightCell({
  date,
  inMonth,
  today,
  free,
  ratePerNight,
  active,
  provisional,
  anchor,
  focused,
  outOfBounds,
  onPick,
  onHover,
}: NightCellProps) {
  const isStart = active?.start === date
  // The check-out morning. Only an end when the range actually spans nights —
  // a half-made selection has both ends on one day, which is a start.
  const isEnd = active?.end === date && active.start !== active.end
  const isBetween = active !== null && date > active.start && date < active.end
  const isFilled = isStart || isEnd
  const isSoftEnd = provisional && isEnd && anchor !== date
  const isFull = free < 1
  const selectable = !outOfBounds && (!isFull || provisional)

  return (
    <td className="p-0">
      <button
        type="button"
        disabled={!selectable}
        tabIndex={focused && selectable ? 0 : -1}
        aria-label={`${formatDayLabel(date)}${isFull ? ', full' : ''}`}
        aria-pressed={isFilled}
        onClick={() => onPick(date, !inMonth)}
        onPointerEnter={() => {
          if (provisional) {
            onHover(date)
          }
        }}
        className={cn(
          'flex h-12 w-11 flex-col items-center justify-center gap-[1px] text-body-sm transition-colors outline-none',
          // The band, drawn on the cell rather than around it so a week reads
          // as one strip (§Components — Date range).
          isBetween && 'bg-muted',
          isStart && 'rounded-l-md',
          isEnd && 'rounded-r-md',
          isFilled && !isSoftEnd && 'bg-primary text-primary-foreground',
          // A far end still being chosen is pagination's "you are here": a
          // drawn chip, so provisional and committed never look alike.
          isSoftEnd && 'rounded-md border border-border bg-card text-foreground',
          !isFilled && !isBetween && selectable && 'rounded-md hover:bg-muted',
          !isFilled && inMonth && 'text-foreground',
          !isFilled && !inMonth && 'text-muted-foreground',
          outOfBounds && 'opacity-40',
          selectable ? 'cursor-pointer' : 'cursor-default',
          'focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {/* Today is a weight rather than the dot the other calendars use: the
            cell below the numeral is spoken for by the rate, and a mark under
            that would be a third line in a 48px cell. */}
        <span className={cn('tabular-nums', date === today && !isFilled && 'font-medium')}>
          {Number(date.slice(8, 10))}
        </span>

        {/* The rate, or the fact there is nothing to sell. Hidden on an
            out-of-window day, where a price would be an offer. */}
        {outOfBounds ? null : isFull ? (
          <span
            className={cn(
              'micro-label',
              isFilled && !isSoftEnd ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            Full
          </span>
        ) : (
          <span
            className={cn(
              'text-[10px] tabular-nums',
              isFilled && !isSoftEnd ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            {formatCents(ratePerNight).replace('.00', '')}
          </span>
        )}
      </button>
    </td>
  )
}

function CalendarFooter({
  active,
  provisional,
  anchor,
  unitTypeSlug,
}: {
  active: StayDateRange | null
  provisional: boolean
  anchor: StayDate | null
  unitTypeSlug: string
}) {
  const nights = active ? nightsBetween(active.start, active.end) : 0

  return (
    <p
      className="mt-lg border-t border-divider pt-md text-body-sm text-muted-foreground"
      aria-live="polite"
      data-unit-type={unitTypeSlug}
    >
      {provisional && anchor ? (
        <>Now pick the day you leave.</>
      ) : active && nights > 0 ? (
        <>
          <span className="text-foreground">
            {nights} {nights === 1 ? 'night' : 'nights'}
          </span>{' '}
          · {formatStayRange(active.start, active.end)}
        </>
      ) : (
        <>Pick the day you arrive, then the day you leave. Prices are per night.</>
      )}
    </p>
  )
}
