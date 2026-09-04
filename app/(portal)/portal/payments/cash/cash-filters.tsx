'use client'

import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { SearchField } from '@/components/portal/search-field'
import { Button } from '@/components/ui/button'
import type { StayDateRange } from '@/components/ui/calendar'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import type { StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

/**
 * The cash log's filter row: a search, and the dates the money was collected.
 *
 * The same arrangement as the bookings filter row: current values in as props,
 * a URL out, and the page stays a server component. Both ends of the range are
 * inclusive — the days the calendar shows as selected — and the page converts
 * to the half-open range the query wants.
 */

interface CashFiltersProps {
  from?: StayDate
  to?: StayDate
  /** The search the server applied. Empty means none. */
  search: string
}

export function CashFilters({ from, to, search }: CashFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const range: StayDateRange | null = from && to ? { start: from, end: to } : null
  const isFiltered = range !== null || search !== ''

  /** Writes the whole filter set, so the URL is rebuilt from one place. */
  function apply(nextRange: StayDateRange | null, nextSearch: string) {
    const params = new URLSearchParams()

    if (nextSearch) {
      params.set('q', nextSearch)
    }

    if (nextRange) {
      params.set('from', nextRange.start)
      params.set('to', nextRange.end)
    }

    const query = params.toString()

    startTransition(() => {
      router.push(query ? `/portal/payments/cash?${query}` : '/portal/payments/cash', {
        scroll: false,
      })
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
      <SearchField
        value={search}
        placeholder="Reference or guest"
        onChange={(next) => apply(range, next)}
      />

      <DateRangePicker label="Collected" value={range} onChange={(next) => apply(next, search)} />

      {isFiltered ? (
        <Button variant="ghost" onClick={() => apply(null, '')}>
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
