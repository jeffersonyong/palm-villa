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
 * The calendar's control line: which month, which unit types, and whether the
 * empty rows are drawn.
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

interface CalendarControlsProps {
  month: CalendarMonth
  /** The month today falls in — the one the screen opens on unasked. */
  todayMonth: CalendarMonth
  /** The chosen unit types, in canonical order. Empty means the whole building. */
  types: readonly string[]
  /** Every unit type, for the Type panel's options. */
  unitTypes: readonly UnitTypeOption[]
  /** Whether the units with nothing on them this month are drawn. */
  showAllUnits: boolean
}

export function CalendarControls({
  month,
  todayMonth,
  types,
  unitTypes,
  showAllUnits,
}: CalendarControlsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Words only, as on the units board: a type is not a state, and the
  // semantic hues mean status and nothing else.
  const typeOptions: readonly MultiSelectOption<string>[] = unitTypes.map((type) => ({
    value: type.id,
    label: type.name,
  }))

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

  return (
    <div
      aria-busy={isPending}
      className={cn(
        'flex flex-wrap items-center gap-xl transition-opacity duration-150 motion-reduce:transition-none',
        isPending && 'opacity-60',
      )}
    >
      {/* Two clusters, not one row. Which month is being looked at is a
          different question from which units are shown, so the month keeps
          its own space and the narrowing keeps its own.

          The header positions its arrows absolutely, so it needs a width to
          stand in a row; wide enough for "September 2026" with an arrow clear
          of each end. */}
      <div className="w-[232px]">
        <MonthHeader
          month={month}
          showPrevious
          showNext
          onPrevious={() => go(shiftMonth(month, -1), types)}
          onNext={() => go(shiftMonth(month, 1), types)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-md">
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
    </div>
  )
}
