'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  clampPage,
  pageCountFor,
  paginationRange,
  rowRange,
} from '@/components/ui/pagination-range'
import { cn } from '@/lib/utils'

/**
 * The table footer: how much you are looking at, and how to reach the rest.
 *
 * It bookends the table — the header strip's `canvas-soft` returned at the
 * foot, separated by the same `divider` hairline, so the data sits between
 * two bands of chrome and the container keeps one hairline boundary
 * (design.md §Components — Tables).
 *
 * Two clusters, read left to right: **where you are** (the range, then
 * the page size behind a hairline separator) and **how to move** (the page
 * chips flanked by step and jump arrows). Splitting them keeps the reading
 * of the count away from the controls that change it.
 *
 * "Where am I" is a quiet surface shift, never colour: the current page is a
 * white chip on the gray strip, the sidebar's and segmented control's own
 * language. It carries a hairline rather than `shadow-chip`, which design.md
 * reserves for the segmented control.
 *
 * Figures here are proportional, not `tabular-nums`: the portal's tabular
 * rule exists so columns of data line up vertically, and nothing here is in
 * a column — the range reads as a sentence and the page numbers are centred
 * in their own chips (design.md §Components).
 */

const DEFAULT_PAGE_SIZES = [10, 25, 50] as const

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: readonly number[]
  /** Plural noun for the summary — "accounts", "bookings". */
  itemLabel?: string
  className?: string
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  itemLabel = 'rows',
  className,
}: PaginationProps) {
  const pageCount = pageCountFor(total, pageSize)
  const current = clampPage(page, pageCount)
  const { from, to } = rowRange(current, pageSize, total)
  const slots = paginationRange(current, pageCount)

  // An empty table says so in its empty state; a footer counting zero would
  // only repeat it.
  if (total === 0) {
    return null
  }

  const canChangePageSize = Boolean(onPageSizeChange) && total > Math.min(...pageSizeOptions)

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-wrap items-center justify-between gap-md border-t border-divider bg-muted px-lg py-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-md">
        <p className="text-body-sm text-muted-foreground">
          {from}–{to} of {total} {itemLabel}
        </p>

        {canChangePageSize ? (
          <>
            <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
            <div className="flex items-center gap-sm">
              <span className="text-body-sm text-muted-foreground">Rows per page</span>
              {/* The product's own select, not the OS picker: this footer sits
                  under every table in the portal, and it is the one place a
                  native dropdown would open browser chrome on a screen made
                  entirely of our own surfaces. */}
              <Select
                value={String(pageSize)}
                onValueChange={(next) => onPageSizeChange?.(Number(next))}
              >
                <SelectTrigger aria-label="Rows per page" className="w-[76px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center gap-xxs">
          <StepButton
            label="First page"
            disabled={current === 1}
            onClick={() => onPageChange(1)}
            className="hidden sm:inline-flex"
          >
            <ChevronsLeft aria-hidden className="size-4" />
          </StepButton>
          <StepButton
            label="Previous page"
            disabled={current === 1}
            onClick={() => onPageChange(current - 1)}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </StepButton>

          {/* The numbers sit in their own group so the arrows read as a
              frame around them rather than as two more pages. */}
          <div className="flex items-center gap-xxs px-xs">
            {slots.map((slot, index) =>
              slot === 'ellipsis' ? (
                <span
                  key={`gap-${index}`}
                  aria-hidden
                  className="px-xs text-body-sm text-muted-foreground"
                >
                  …
                </span>
              ) : (
                <PageButton
                  key={slot}
                  page={slot}
                  isCurrent={slot === current}
                  onClick={() => onPageChange(slot)}
                />
              ),
            )}
          </div>

          <StepButton
            label="Next page"
            disabled={current === pageCount}
            onClick={() => onPageChange(current + 1)}
          >
            <ChevronRight aria-hidden className="size-4" />
          </StepButton>
          <StepButton
            label="Last page"
            disabled={current === pageCount}
            onClick={() => onPageChange(pageCount)}
            className="hidden sm:inline-flex"
          >
            <ChevronsRight aria-hidden className="size-4" />
          </StepButton>
        </div>
      ) : null}
    </nav>
  )
}

/**
 * Steps and page chips share one square, sized to the surface's control
 * height (32px in the portal) so they line up with the per-page select.
 */
const stepClasses =
  'inline-flex size-control items-center justify-center rounded-md text-body-sm transition-[background-color,border-color,color] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted'

/**
 * The arrows are drawn controls — hairline-bounded chips on the card fill,
 * like every other button in the portal. Only the numbers are bare, so the
 * two jobs (move by one / jump to a page) never look like the same control.
 */
function StepButton({
  label,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        stepClasses,
        'border border-border bg-card text-muted-foreground',
        // The tertiary button's hover: a fill step, not a heavier hairline —
        // light draws every edge at one weight (design.md §Elevation).
        'hover:bg-muted hover:text-foreground',
        'disabled:pointer-events-none disabled:border-divider disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  )
}

function PageButton({
  page,
  isCurrent,
  onClick,
}: {
  page: number
  isCurrent: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`Page ${page}`}
      aria-current={isCurrent ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        stepClasses,
        isCurrent
          ? 'border border-border bg-card font-medium text-foreground'
          : 'text-muted-foreground hover:bg-card hover:text-foreground',
      )}
    >
      {page}
    </button>
  )
}
