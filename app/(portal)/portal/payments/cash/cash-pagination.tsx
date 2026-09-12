'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Pagination } from '@/components/ui/pagination'

import { DEFAULT_PAGE_SIZE } from './page-size'

/**
 * The cash log's pagination footer.
 *
 * A thin island over `Pagination`, the shape the register and the deposits
 * ledger already use — it knows how to write two search params and nothing
 * about how a footer looks.
 *
 * The log had none until now, and read every cash payment ever taken. That was
 * not merely a long page: PostgREST stops at a thousand rows without saying
 * so, so the table quietly ended mid-history and the total underneath it was
 * short by whatever had been cut. The rows are now a page from the database
 * and the total is summed across all of them, which is why the footnote no
 * longer calls itself a sum of what is above it.
 *
 * The date window and the search ride along in `params`, because a page number
 * without the filter it belongs to would land on page 3 of a different list.
 */

interface CashPaginationProps {
  page: number
  pageSize: number
  total: number
  /** The filter params to carry through, serialised. Never includes page or size. */
  params: string
}

export function CashPagination({ page, pageSize, total, params }: CashPaginationProps) {
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
      router.push(query ? `/portal/payments/cash?${query}` : '/portal/payments/cash', {
        scroll: false,
      })
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
        itemLabel="payments"
        onPageChange={(next) => go(next, pageSize)}
        // A different page size renumbers every page, so the one page certain
        // to exist afterwards is the first.
        onPageSizeChange={(size) => go(1, size)}
      />
    </div>
  )
}
