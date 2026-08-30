'use client'

import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import type { StayDateRange } from '@/components/ui/calendar'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import type { StayDate } from '@/lib/domain/dates'

/**
 * The cash log's date filter.
 *
 * The same arrangement as the bookings filter row: current values in as props,
 * a URL out, and the page stays a server component. Both ends of the range are
 * inclusive — the days the calendar shows as selected — and the page converts
 * to the half-open range the query wants.
 */

interface CashFiltersProps {
  from?: StayDate
  to?: StayDate
}

export function CashFilters({ from, to }: CashFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const range: StayDateRange | null = from && to ? { start: from, end: to } : null

  function apply(next: StayDateRange | null) {
    startTransition(() => {
      router.push(
        next ? `/portal/payments/cash?from=${next.start}&to=${next.end}` : '/portal/payments/cash',
        { scroll: false },
      )
    })
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-md ${isPending ? 'opacity-60' : ''}`}
      aria-busy={isPending}
    >
      <DateRangePicker label="Collected" value={range} onChange={apply} />

      {range ? (
        <Button variant="ghost" onClick={() => apply(null)}>
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
