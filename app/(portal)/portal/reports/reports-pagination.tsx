'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Pagination } from '@/components/ui/pagination'

import { DEFAULT_PAGE_SIZE } from './page-size'

/**
 * The pagination footer for the reporting tables.
 *
 * A thin island over `Pagination`, the same shape as the units board's — it
 * only knows how to write two search params, and everything about how the
 * footer looks stays in the shared component. It takes its `route` because two
 * screens use it, which is the one difference from the boards': occupancy by
 * unit sits on `/portal/reports`, the day list on `/portal/reports/cash-up`.
 *
 * ── Paged here, not in SQL ─────────────────────────────────────────────────
 *
 * Both tables are derived in TypeScript from a bounded read — occupancy is
 * clipped per unit against the period, and a day's figures are three filters
 * over rows the page already holds — so pushing the page boundary into SQL
 * would mean a second copy of the derivation rules and a query that could not
 * answer what the totals row shows. The slice is of an array the server
 * already has. It is still URL state rather than `useState`, for the same
 * reason the filters are: a link that restores someone's period and drops
 * them on page 1 restores the wrong thing.
 *
 * The running balance survives paging because every row carries its own
 * closing figure, computed across the whole period before the slice is taken —
 * page 2 of a cash-up is not a fresh start.
 */

interface ReportsPaginationProps {
  route: '/portal/reports' | '/portal/reports/cash-up'
  page: number
  pageSize: number
  total: number
  itemLabel: string
  /** The filter params to carry through, serialised. Never includes page or size. */
  params: string
}

export function ReportsPagination({
  route,
  page,
  pageSize,
  total,
  itemLabel,
  params,
}: ReportsPaginationProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function go(nextPage: number, nextSize: number) {
    const next = new URLSearchParams(params)

    // Page 1 and the default size are the absence of a param, not a value.
    if (nextPage > 1) {
      next.set('page', String(nextPage))
    }

    if (nextSize !== DEFAULT_PAGE_SIZE) {
      next.set('size', String(nextSize))
    }

    const query = next.toString()

    startTransition(() => {
      // `scroll: false`: the operations panel owns the scroll rather than the
      // window, so the default would fire against the wrong element.
      router.push(query ? `${route}?${query}` : route, { scroll: false })
    })
  }

  return (
    <div
      aria-busy={isPending}
      className={
        isPending ? 'opacity-60 transition-opacity motion-reduce:transition-none' : undefined
      }
    >
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        itemLabel={itemLabel}
        onPageChange={(next) => go(next, pageSize)}
        // A different page size renumbers every page, so the one page certain
        // to exist afterwards is the first.
        onPageSizeChange={(size) => go(1, size)}
      />
    </div>
  )
}
