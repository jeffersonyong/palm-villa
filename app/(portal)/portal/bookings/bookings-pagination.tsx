'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Pagination } from '@/components/ui/pagination'

import { DEFAULT_PAGE_SIZE } from './page-size'

/**
 * The register's pagination footer (capability B1).
 *
 * A thin island over `Pagination`, doing for the page what `BookingsFilters`
 * does for the filters: turning a control into a URL. Everything about how the
 * footer looks and how its page numbers are chosen stays in the shared
 * component; this only knows how to write two search params.
 *
 * ── Why the page lives in the URL, when the staff table's does not ─────────
 *
 * The Staff tab holds its page in `useState`, and that is right there: it sits
 * inside a tab that has no URL state of any kind, and it paginates an array it
 * already has in memory. This register is the opposite on both counts. Its
 * filters are URL state precisely so a view can be bookmarked and sent on, and
 * a link that restores someone's filters but drops them on page 1 restores the
 * wrong thing. Its rows are also fetched per page, so the page number has to
 * reach the server anyway.
 *
 * `size` is URL state for the same reason rather than a second mechanism: a
 * staff member who works at 50 rows should get 50 rows back when they reopen
 * their bookmark.
 *
 * ── The filters are carried, not merged ────────────────────────────────────
 *
 * `params` arrives already holding the filter state the server actually
 * applied, so a malformed param the page rejected is not carried forward — the
 * same guarantee the filter row gets by taking its values as props. Changing a
 * *filter* deliberately does not preserve the page: `BookingsFilters` rebuilds
 * the query from nothing, so narrowing a list drops you back to page 1, which
 * is the only page guaranteed to exist afterwards.
 */

interface BookingsPaginationProps {
  page: number
  pageSize: number
  total: number
  /** The filter params to carry through, serialised. Never includes page or size. */
  params: string
}

export function BookingsPagination({ page, pageSize, total, params }: BookingsPaginationProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function go(nextPage: number, nextSize: number) {
    const next = new URLSearchParams(params)

    // Page 1 and the default size are the absence of a param, not a value:
    // `?page=1` is a URL that says nothing, and it would make the first page
    // of a filtered list look different from the same list unpaged.
    if (nextPage > 1) {
      next.set('page', String(nextPage))
    }

    if (nextSize !== DEFAULT_PAGE_SIZE) {
      next.set('size', String(nextSize))
    }

    const query = next.toString()

    startTransition(() => {
      // `scroll: false`, like the filter row: the operations panel owns the
      // scroll rather than the window (design.md §Layout), so the default
      // window scroll would fire against the wrong element and do nothing
      // visible except on a short viewport.
      router.push(query ? `/portal/bookings?${query}` : '/portal/bookings', { scroll: false })
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
        itemLabel="bookings"
        onPageChange={(next) => go(next, pageSize)}
        // A different page size renumbers every page, so the one page certain
        // to exist afterwards is the first.
        onPageSizeChange={(size) => go(1, size)}
      />
    </div>
  )
}
