'use client'

import type { Route } from 'next'
import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { MultiSelectFilter, type MultiSelectOption } from '@/components/ui/multi-select-filter'
import { cn } from '@/lib/utils'

/**
 * The unit-type filter over the occupancy-by-unit table.
 *
 * Its own control line rather than a third chip beside the period, because the
 * two narrow different things: the period is the whole report — every figure on
 * the screen answers for it — while this narrows one table and leaves the
 * summary above it alone. Putting them together would imply the tiles move
 * when a type is picked, and they do not.
 *
 * The occupancy-by-type table is the reason this can be a filter rather than a
 * grouping: somebody who wants the three-bedrooms summarised already has that
 * row above, so what this answers is the follow-up — which of the thirty-six.
 *
 * The period is carried through on every write, so narrowing a type cannot
 * silently reset the report to the default month. Page is deliberately *not*
 * carried: a different set of rows renumbers every page, and the one certain
 * to exist afterwards is the first.
 */

interface OccupancyFilterProps {
  options: readonly MultiSelectOption<string>[]
  selected: readonly string[]
  /** The period to preserve, when the reader chose one. */
  period: { from: string; to: string } | null
}

export function OccupancyFilter({ options, selected, period }: OccupancyFilterProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function apply(types: readonly string[]) {
    const next = new URLSearchParams()

    if (period) {
      next.set('from', period.from)
      next.set('to', period.to)
    }

    for (const type of types) {
      next.append('type', type)
    }

    const query = next.toString()
    const href = (query ? `/portal/reports?${query}` : '/portal/reports') as Route

    startTransition(() => {
      // The table sits well down the page, so the panel's scroll position is
      // where the reader was looking; the default would throw them to the top.
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
      <MultiSelectFilter label="Type" options={options} selected={selected} onChange={apply} />

      {selected.length > 0 ? (
        <Button variant="ghost" onClick={() => apply([])}>
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
