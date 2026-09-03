'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Pagination } from '@/components/ui/pagination'

import { DEFAULT_PAGE_SIZE } from './page-size'

/**
 * The deposits ledger's pagination footer.
 *
 * A thin island over `Pagination`, the same shape as the board's and the
 * register's — it knows how to write two search params and nothing about how a
 * footer looks.
 *
 * It is shown on the archive views only. Held deposits are read whole (see
 * ledger-view.ts), and a footer that pages a queue somebody is working to zero
 * is chrome; released deposits accumulate for the life of the building and are
 * fetched one page at a time from the database, so the footer moves through
 * pages the server has not read.
 *
 * The view rides along in `params`, because a page number without the view it
 * belongs to would land on page 3 of a different list.
 */

interface DepositsPaginationProps {
  page: number
  pageSize: number
  total: number
  /** The view param to carry through, serialised. Never includes page or size. */
  params: string
}

export function DepositsPagination({ page, pageSize, total, params }: DepositsPaginationProps) {
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
      router.push(query ? `/portal/deposits?${query}` : '/portal/deposits', { scroll: false })
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
        itemLabel="deposits"
        onPageChange={(next) => go(next, pageSize)}
        // A different page size renumbers every page, so the one page certain
        // to exist afterwards is the first.
        onPageSizeChange={(size) => go(1, size)}
      />
    </div>
  )
}
