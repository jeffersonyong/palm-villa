'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { FilterChip } from '@/components/ui/filter-chip'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

import { PAYMENT_VIEWS, type PaymentView } from './views'

/**
 * The verification queue's one filter.
 *
 * Props in, URL out — the same arrangement as the bookings filter row, so the
 * page stays a server component and the chip can only ever show a view the
 * server actually applied.
 */

interface PaymentsFiltersProps {
  view: PaymentView
}

export function PaymentsFilters({ view }: PaymentsFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function apply(next: string) {
    startTransition(() => {
      // `waiting` is the default, so it stays out of the URL — a bare
      // /portal/payments is the queue, which is what people will bookmark.
      // `push`, not `replace`: back should undo a filter.
      router.push(next === 'waiting' ? '/portal/payments' : `/portal/payments?show=${next}`, {
        scroll: false,
      })
    })
  }

  return (
    <div aria-busy={isPending} className={isPending ? 'opacity-60' : undefined}>
      <Select value={view} onValueChange={apply}>
        <SelectTrigger asChild>
          {/* Unset — the default view — shows only the field name, so the row
              reads as "no filter applied" rather than as a set one. */}
          <FilterChip label="Show" value={view === 'waiting' ? undefined : PAYMENT_VIEWS[view]} />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PAYMENT_VIEWS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
