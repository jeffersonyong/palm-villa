'use client'

import type { Route } from 'next'
import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { MonthHeader } from '@/components/ui/calendar-grid'
import { shiftMonth, type CalendarMonth } from '@/components/ui/calendar-month'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { MultiSelectFilter, type MultiSelectOption } from '@/components/ui/multi-select-filter'
import { cn } from '@/lib/utils'

import { calendarHref } from './calendar-params'

/**
 * The calendar's controls: which units are shown, and which month.
 *
 * Two components rather than one, because they belong at opposite ends of the
 * control line. Every list screen on the surface reads the same way across
 * that row — what narrows the list on the left, what you can *do* on the
 * right — and the month is not a narrowing. It is the view itself moving, so
 * it sits with the actions, beside the primary. The type filter and "Show
 * empty units" are what narrow the grid, so they sit where every other
 * screen's chips do. The page composes them; neither knows where it is.
 *
 * URL state, like every filter row on the surface — a month can be kept in a
 * tab or sent to whoever is asking about it. The current values arrive as
 * props rather than through `useSearchParams`, so the controls can only ever
 * show what the server actually applied.
 *
 * The month arrows are the date picker's own `MonthHeader`: the same 28px
 * chrome-on-something-else squares design.md gives a calendar's arrows, and
 * the same title, so the two calendars in the product read as one. There is
 * no "Today": the arrows are how the month moves, the screen opens on this
 * month unasked, and a shortcut back to where you started is a control that
 * earns its place on a picker a customer meets once rather than on a grid the
 * desk lives in.
 *
 * Clear keeps the month, and keeps the empty rows as they are. The month is
 * the view, not a filter — clearing the type narrowing should widen the
 * building, not jump to a different month — and "Show empty units" is how much
 * of the grid is drawn rather than which units qualify for it.
 */

interface UnitTypeOption {
  id: string
  name: string
}

interface CalendarViewProps {
  month: CalendarMonth
  /** The month today falls in — the one the screen opens on unasked. */
  todayMonth: CalendarMonth
  /** The chosen unit types, in canonical order. Empty means the whole building. */
  types: readonly string[]
  /** Whether the units with nothing on them this month are drawn. */
  showAllUnits: boolean
}

/**
 * Navigating the calendar, shared by the two clusters.
 *
 * Each holds its own transition rather than one being threaded through the
 * page between them: the control a reader touched is the one that should
 * answer, and a month arrow dimming the type chips it did not change said the
 * wrong thing about what was happening.
 */
function useCalendarNavigation({
  todayMonth,
  showAllUnits,
}: Pick<CalendarViewProps, 'todayMonth' | 'showAllUnits'>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  /**
   * Rebuilds the whole query from one place. The current month is written as
   * the absence of the param, so the view a reader opens on unasked and the
   * same view reached by the arrows share a URL.
   *
   * The arrows are buttons rather than links, so nothing prefetches the
   * neighbouring months — and `router.prefetch` was tried and removed: this
   * route is dynamic with its state in search params, and it issued no
   * request at all. Next's own router cache is what makes stepping cheap
   * after the first move (measured 469ms, then ~200ms a step).
   */
  function go(nextMonth: CalendarMonth, nextTypes: readonly string[], nextShowAll = showAllUnits) {
    const href = calendarHref(
      nextMonth === todayMonth ? null : nextMonth,
      nextTypes,
      nextShowAll,
    ) as Route

    startTransition(() => {
      // `push`, not `replace`: back should undo a step through the months.
      router.push(href, { scroll: false })
    })
  }

  return { go, isPending }
}

/** The busy treatment both clusters wear while a navigation is in flight. */
const PENDING = 'transition-opacity duration-150 motion-reduce:transition-none'

/**
 * Which units are drawn: the type narrowing, the empty rows, and the way out.
 *
 * The left of the control line, where every other list screen keeps the
 * controls that narrow it.
 */
export function CalendarUnitControls({
  month,
  todayMonth,
  types,
  unitTypes,
  showAllUnits,
}: CalendarViewProps & {
  /** Every unit type, for the Type panel's options. */
  unitTypes: readonly UnitTypeOption[]
}) {
  const { go, isPending } = useCalendarNavigation({ todayMonth, showAllUnits })

  // Words only, as on the units board: a type is not a state, and the
  // semantic hues mean status and nothing else.
  const typeOptions: readonly MultiSelectOption<string>[] = unitTypes.map((type) => ({
    value: type.id,
    label: type.name,
  }))

  return (
    <div
      aria-busy={isPending}
      className={cn('flex flex-wrap items-center gap-md', PENDING, isPending && 'opacity-60')}
    >
      <MultiSelectFilter
        label="Type"
        options={typeOptions}
        selected={types}
        onChange={(next) => go(month, next)}
      />

      {/* A checkbox rather than a chip: this is one thing that is on or off,
          and a chip carries a chevron that promises a list to pick from
          (design.md — a chevron promises a list). Worded as what ticking it
          does, not as the state it leaves behind. */}
      <div className="flex items-center gap-sm">
        <Checkbox
          id="showAllUnits"
          checked={showAllUnits}
          onCheckedChange={(checked) => go(month, types, checked === true)}
        />
        <Label htmlFor="showAllUnits" className="cursor-pointer text-copy">
          Show empty units
        </Label>
      </div>

      {types.length > 0 ? (
        <Button variant="ghost" onClick={() => go(month, [])}>
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Which month is being looked at.
 *
 * The right of the control line, beside the screen's primary: stepping the
 * month is not narrowing a list, it is moving the view, which is an action on
 * the whole screen rather than a question about its rows.
 *
 * The header positions its arrows absolutely, so it needs a width to stand in
 * a row; wide enough for "September 2026" with an arrow clear of each end, and
 * fixed so the arrows hold their place as the month name changes length.
 */
export function CalendarMonthStepper({
  month,
  todayMonth,
  types,
  showAllUnits,
}: CalendarViewProps) {
  const { go, isPending } = useCalendarNavigation({ todayMonth, showAllUnits })

  return (
    <div
      aria-busy={isPending}
      className={cn('w-[232px] shrink-0', PENDING, isPending && 'opacity-60')}
    >
      <MonthHeader
        month={month}
        showPrevious
        showNext
        onPrevious={() => go(shiftMonth(month, -1), types)}
        onNext={() => go(shiftMonth(month, 1), types)}
      />
    </div>
  )
}
