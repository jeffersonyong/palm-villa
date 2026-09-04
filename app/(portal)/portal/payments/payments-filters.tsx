'use client'

import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { SearchField } from '@/components/portal/search-field'
import { Button } from '@/components/ui/button'
import { FilterChip } from '@/components/ui/filter-chip'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { DEFAULT_PAYMENT_VIEW, PAYMENT_VIEWS, type PaymentView } from './views'

/**
 * The verification queue's filter row: a search, and which payments to show.
 *
 * Props in, URL out — the same arrangement as the bookings filter row, so the
 * page stays a server component and the chip can only ever show a view the
 * server actually applied.
 */

interface PaymentsFiltersProps {
  view: PaymentView
  /** The search the server applied. Empty means none. */
  search: string
}

export function PaymentsFilters({ view, search }: PaymentsFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  /** Writes the whole filter set, so the URL is rebuilt from one place. */
  function apply(nextView: PaymentView, nextSearch: string) {
    const params = new URLSearchParams()

    if (nextSearch) {
      params.set('q', nextSearch)
    }

    // The default stays out of the URL — a bare /portal/payments is the
    // queue, which is what people will bookmark.
    if (nextView !== DEFAULT_PAYMENT_VIEW) {
      params.set('show', nextView)
    }

    const query = params.toString()

    startTransition(() => {
      // `push`, not `replace`: back should undo a filter.
      router.push(query ? `/portal/payments?${query}` : '/portal/payments', { scroll: false })
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
        onChange={(next) => apply(view, next)}
      />

      <Select value={view} onValueChange={(next) => apply(next as PaymentView, search)}>
        <SelectTrigger asChild>
          {/* Unset — the default view — shows only the field name, so the row
              reads as "no filter applied" rather than as a set one. */}
          <FilterChip
            label="Show"
            value={view === DEFAULT_PAYMENT_VIEW ? undefined : PAYMENT_VIEWS[view]}
          />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PAYMENT_VIEWS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* The search is the only thing Clear clears: the view is a choice of
          what to read, not a narrowing of it, and the chip clears itself. */}
      {search !== '' ? (
        <Button variant="ghost" onClick={() => apply(view, '')}>
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
