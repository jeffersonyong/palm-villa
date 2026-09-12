'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Pagination } from '@/components/ui/pagination'

import { DEFAULT_PAGE_SIZE } from './page-size'

/**
 * The verification queue's pagination footer.
 *
 * A thin island over `Pagination`, the shape the register and the cash log
 * already use — it knows how to write two search params and nothing about how
 * a footer looks.
 *
 * What it pages is mostly the queue's *settled* half. Everything still waiting
 * is read whole and sorts above everything settled, so the first page is the
 * work and the rest is history. Before this footer existed the screen read
 * both halves whole, and PostgREST stopped at a thousand rows without saying
 * so — which hid the oldest history rather than the work, but hid it silently.
 *
 * The view and the search ride along in `params`, because a page number
 * without the filter it belongs to would land on page 3 of a different list.
 */

interface PaymentsPaginationProps {
  page: number
  pageSize: number
  total: number
  /** The view and search to carry through, serialised. Never includes page or size. */
  params: string
}

export function PaymentsPagination({ page, pageSize, total, params }: PaymentsPaginationProps) {
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
      router.push(query ? `/portal/payments?${query}` : '/portal/payments', {
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
        itemLabel="transfers"
        onPageChange={(next) => go(next, pageSize)}
        // A different page size renumbers every page, so the one page certain
        // to exist afterwards is the first.
        onPageSizeChange={(size) => go(1, size)}
      />
    </div>
  )
}
