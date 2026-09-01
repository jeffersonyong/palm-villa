'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Pagination } from '@/components/ui/pagination'

import { DEFAULT_PAGE_SIZE } from './page-size'

/**
 * The units board's pagination footer.
 *
 * A thin island over `Pagination`, the same shape as the register's — it only
 * knows how to write two search params, and everything about how the footer
 * looks stays in the shared component.
 *
 * ── Paged here, not in SQL ─────────────────────────────────────────────────
 *
 * The register fetches one page at a time because bookings grow without limit.
 * The board reads the whole building — fifty-odd rows that do not multiply
 * between requests — because a unit's status is derived in TypeScript, and
 * pushing the filter into SQL would mean a second copy of the derivation rules.
 * So the page is a slice of an array the server already holds. It is still URL
 * state rather than `useState`, for the same reason the filters are: a link
 * that restores someone's filters and drops them on page 1 restores the wrong
 * thing.
 */

interface UnitsPaginationProps {
  page: number
  pageSize: number
  total: number
  /** The filter params to carry through, serialised. Never includes page or size. */
  params: string
}

export function UnitsPagination({ page, pageSize, total, params }: UnitsPaginationProps) {
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
      router.push(query ? `/portal/units?${query}` : '/portal/units', { scroll: false })
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
        itemLabel="units"
        onPageChange={(next) => go(next, pageSize)}
        // A different page size renumbers every page, so the one page certain
        // to exist afterwards is the first.
        onPageSizeChange={(size) => go(1, size)}
      />
    </div>
  )
}
