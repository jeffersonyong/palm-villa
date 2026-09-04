import type { Route } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import {
  clampPage,
  pageCountFor,
  paginationRange,
  rowRange,
} from '@/components/ui/pagination-range'
import { cn } from '@/lib/utils'

/**
 * Pagination for a list that lives inside a card — a record's history — where
 * the table footer would be a strip of chrome heavier than the list it moves.
 *
 * It is `Pagination`'s language at a quieter register (design.md §Components
 * — Inline pagination): the same two clusters, *where you are* on the left and
 * *how to move* on the right, the same drawn arrows and bare numbers, the same
 * card-fill chip with a hairline for "you are here". What changes is the
 * ground and the scale. There is no `canvas-soft` strip — the control sits on
 * the card, under one hairline, like the footer of the trail it pages — so
 * hover steps *down* to `muted` rather than up to the card, because an object
 * is whichever tone is a step away from what it sits on. The squares are
 * `control-sm` (28px) rather than the surface's control height: they are
 * chrome on the list, not participants in a row of controls, exactly as a
 * calendar's month arrows are. And the number window has no siblings — five
 * slots, not seven — because a history can sit in a 400px column.
 *
 * ── Links, not buttons ─────────────────────────────────────────────────────
 *
 * The page is in the URL, so moving is navigation, and a page number is a
 * real address that works before the screen has hydrated and can be opened in
 * a new tab. That is also why there is no rows-per-page control and no
 * first/last jump: the footer offers those because a register is *worked* at
 * one size or another, and a history is only read.
 *
 * It exists only when there is somewhere to go. One page of ten events with a
 * footer reading "1–7 of 7" is chrome; and a control offering nothing would
 * be a lie about the length of the trail.
 */

interface InlinePaginationProps {
  page: number
  pageSize: number
  total: number
  /** The address of a page. */
  hrefFor: (page: number) => Route
  /** What the `<nav>` is announced as — "History pages". */
  label: string
  /** Plural noun for the range — "events". */
  itemLabel: string
  className?: string
}

export function InlinePagination({
  page,
  pageSize,
  total,
  hrefFor,
  label,
  itemLabel,
  className,
}: InlinePaginationProps) {
  const pageCount = pageCountFor(total, pageSize)

  if (pageCount <= 1) {
    return null
  }

  const current = clampPage(page, pageCount)
  const { from, to } = rowRange(current, pageSize, total)
  const slots = paginationRange(current, pageCount, 0)

  return (
    <nav
      aria-label={label}
      className={cn(
        'flex flex-wrap items-center justify-between gap-sm border-t border-divider pt-md',
        className,
      )}
    >
      {/* Proportional figures, as in the footer: the range reads as a
          sentence, not as a column of data. */}
      <p className="text-caption text-muted-foreground">
        {from}–{to} of {total} {itemLabel}
      </p>

      <div className="flex items-center gap-xxs">
        <StepLink label="Previous page" href={current > 1 ? hrefFor(current - 1) : null}>
          <ChevronLeft aria-hidden className="size-4" />
        </StepLink>

        {/* The numbers sit in their own group so the arrows read as a frame
            around them rather than as two more pages. */}
        <div className="flex items-center gap-xxs px-xxs">
          {slots.map((slot, index) =>
            slot === 'ellipsis' ? (
              <span
                key={`gap-${index}`}
                aria-hidden
                className="px-xxs text-body-sm text-muted-foreground"
              >
                …
              </span>
            ) : (
              <PageLink key={slot} page={slot} isCurrent={slot === current} href={hrefFor(slot)} />
            ),
          )}
        </div>

        <StepLink label="Next page" href={current < pageCount ? hrefFor(current + 1) : null}>
          <ChevronRight aria-hidden className="size-4" />
        </StepLink>
      </div>
    </nav>
  )
}

/**
 * The compact square, shared by steps and page chips. The focus ring offsets
 * against the card, which is the ground this control sits on.
 */
const squareClasses =
  'inline-flex size-control-sm items-center justify-center rounded-md text-body-sm transition-[background-color,border-color,color] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'

/**
 * A drawn control — hairline-bounded on the card fill — so stepping never
 * looks like the same thing as jumping to a number. At either end it fades
 * rather than disappears: the frame around the numbers keeps its shape.
 *
 * `scroll` is off on every link because the operations panel owns the scroll;
 * the default would fire at the window and throw the reader back to the top
 * of a screen whose history sits at the bottom.
 */
function StepLink({
  label,
  href,
  children,
}: {
  label: string
  /** Nowhere to go renders the control faded, not absent. */
  href: Route | null
  children: React.ReactNode
}) {
  const classes = cn(squareClasses, 'border border-border bg-card text-muted-foreground')

  if (href === null) {
    return (
      <span aria-disabled aria-label={label} className={cn(classes, 'border-divider opacity-40')}>
        {children}
      </span>
    )
  }

  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      className={cn(classes, 'hover:bg-muted hover:text-foreground')}
    >
      {children}
    </Link>
  )
}

function PageLink({ page, isCurrent, href }: { page: number; isCurrent: boolean; href: Route }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={`Page ${page}`}
      aria-current={isCurrent ? 'page' : undefined}
      className={cn(
        squareClasses,
        isCurrent
          ? 'border border-border bg-card font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {page}
    </Link>
  )
}
