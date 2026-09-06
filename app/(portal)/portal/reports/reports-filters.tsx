'use client'

import type { Route } from 'next'
import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import type { StayDateRange } from '@/components/ui/calendar'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { REPORT_DATE_RANGE_PRESETS } from '@/components/ui/date-range-presets'
import type { StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

/**
 * The period control the two reporting screens share.
 *
 * One filter, because a report is a period and nothing else — there is nothing
 * to search and no status to narrow. The rail is the retrospective set: a
 * report answers "what happened", so every span it offers is behind today.
 *
 * `route` is a prop rather than a second copy of this file: the reports screen
 * and the cash-up ask the same question of two sets, and the only thing that
 * differs is where the answer is read. Current values arrive from the server,
 * as they do on every other filter row, so the chip can only ever show a
 * period the server actually applied.
 *
 * Clear appears only when the period came from the URL. The default is a
 * period too, and offering to clear something nobody chose would leave a
 * control that appears to do nothing.
 */

interface ReportsFiltersProps {
  route: '/portal/reports' | '/portal/reports/cash-up'
  from: StayDate
  to: StayDate
  /** False when the period is the screen's default rather than the reader's. */
  isExplicit: boolean
}

export function ReportsFilters({ route, from, to, isExplicit }: ReportsFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const range: StayDateRange = { start: from, end: to }

  function apply(next: StayDateRange | null) {
    // Assembled rather than written out per screen, so the two routes cannot
    // drift in what they write. `Route` is how the inline pagination types the
    // same construction: a route built from a checked literal plus a query is
    // beyond what the typed-routes template can narrow on its own.
    const href = (next ? `${route}?from=${next.start}&to=${next.end}` : route) as Route

    startTransition(() => {
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
      <DateRangePicker
        label="Period"
        value={range}
        presets={REPORT_DATE_RANGE_PRESETS}
        onChange={apply}
      />

      {isExplicit ? (
        <Button variant="ghost" onClick={() => apply(null)}>
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
