'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Pagination } from '@/components/ui/pagination'

import { DEFAULT_PAGE_SIZE } from './page-size'

/**
 * The pagination footer for the audit trail.
 *
 * The reports screen's island, for one route — it knows how to write two search
 * params and nothing else, and everything about how the footer looks stays in
 * the shared component.
 *
 * Paged **in the database**, unlike the reports tables: a trail grows without
 * bound for the life of the building, so the page boundary is a `range()` on
 * the read rather than a slice of an array the server already holds.
 */

interface AuditPaginationProps {
  page: number
  pageSize: number
  total: number
  /** The filter params to carry through, serialised. Never includes page or size. */
  params: string
}

export function AuditPagination({ page, pageSize, total, params }: AuditPaginationProps) {
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
    const href = (query ? `/portal/settings/audit?${query}` : '/portal/settings/audit') as Route

    startTransition(() => {
      // `scroll: false`: the operations panel owns the scroll rather than the
      // window, so the default would fire against the wrong element.
      router.push(href, { scroll: false })
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
        itemLabel="events"
        onPageChange={(next) => go(next, pageSize)}
        // A different page size renumbers every page, so the one page certain
        // to exist afterwards is the first.
        onPageSizeChange={(size) => go(1, size)}
      />
    </div>
  )
}
