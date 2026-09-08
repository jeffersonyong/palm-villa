'use client'

import type { Route } from 'next'
import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { MonthHeader } from '@/components/ui/calendar-grid'
import { shiftMonth, type CalendarMonth } from '@/components/ui/calendar-month'
import { MultiSelectFilter, type MultiSelectOption } from '@/components/ui/multi-select-filter'
import { TextAction } from '@/components/ui/text-action'
import { cn } from '@/lib/utils'

import { calendarHref } from './calendar-params'

/**
 * The calendar's control line: which month, and which unit types.
 *
 * URL state, like every filter row on the surface — a month can be kept in a
 * tab or sent to whoever is asking about it. The current values arrive as
 * props rather than through `useSearchParams`, so the controls can only ever
 * show what the server actually applied.
 *
 * The month arrows are the date picker's own `MonthHeader`: the same 28px
 * chrome-on-something-else squares design.md gives a calendar's arrows, and
 * the same title, so the two calendars in the product read as one. "Today" is
 * offered only when it is not already the answer, which is the picker's rule
 * for its own Today.
 *
 * Clear keeps the month. The month is the view, not a filter: clearing the
 * type narrowing should widen the building, not jump to a different month.
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
}

export function CalendarControls({ month, todayMonth, types, unitTypes }: CalendarControlsProps) {
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
   */
  function go(nextMonth: CalendarMonth, nextTypes: readonly string[]) {
    const href = calendarHref(nextMonth === todayMonth ? null : nextMonth, nextTypes) as Route

    startTransition(() => {
      // `push`, not `replace`: back should undo a step through the months.
      router.push(href, { scroll: false })
    })
  }

  return (
    <div
      aria-busy={isPending}
      className={cn(
        'flex flex-wrap items-center gap-sm transition-opacity duration-150 motion-reduce:transition-none',
        isPending && 'opacity-60',
      )}
    >
      {/* The header positions its arrows absolutely, so it needs a width to
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

      {month !== todayMonth ? (
        <TextAction onClick={() => go(todayMonth, types)}>Today</TextAction>
      ) : null}

      <MultiSelectFilter
        label="Type"
        options={typeOptions}
        selected={types}
        onChange={(next) => go(month, next)}
      />

      {types.length > 0 ? (
        <Button variant="ghost" onClick={() => go(month, [])}>
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
