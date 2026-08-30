'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { NativeSelect } from '@/components/ui/native-select'
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
 * "Where am I" is a quiet surface shift, never colour: the current page is a
 * white chip on the gray strip, the sidebar's and segmented control's own
 * language. It carries a hairline rather than `shadow-chip`, which design.md
 * reserves for the segmented control.
 *
 * Counts are `tabular-nums`, like every other number in the portal, so the
 * range does not jitter as you page.
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
      <p className="text-body-sm text-muted-foreground">
        <span className="tabular-nums">
          {from}–{to}
        </span>{' '}
        of <span className="tabular-nums">{total}</span> {itemLabel}
      </p>

      <div className="flex flex-wrap items-center gap-md">
        {canChangePageSize ? (
          <label className="flex items-center gap-sm">
            <span className="micro-label text-muted-foreground">Per page</span>
            <NativeSelect
              className="w-[76px]"
              aria-label="Rows per page"
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange?.(Number(event.target.value))}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : null}

        {pageCount > 1 ? (
          <div className="flex items-center gap-xxs">
            <StepButton
              label="Previous page"
              disabled={current === 1}
              onClick={() => onPageChange(current - 1)}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </StepButton>

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

            <StepButton
              label="Next page"
              disabled={current === pageCount}
              onClick={() => onPageChange(current + 1)}
            >
              <ChevronRight aria-hidden className="size-4" />
            </StepButton>
          </div>
        ) : null}
      </div>
    </nav>
  )
}

/**
 * Steps and page chips share one square, sized to the surface's control
 * height (32px in the portal) so they line up with the per-page select.
 */
const stepClasses =
  'inline-flex size-control items-center justify-center rounded-md text-body-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted'

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
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
        'text-copy hover:bg-card hover:text-foreground',
        'disabled:pointer-events-none disabled:opacity-40',
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
        'tabular-nums',
        isCurrent
          ? 'border border-border bg-card font-medium text-foreground'
          : 'text-copy hover:bg-card hover:text-foreground',
      )}
    >
      {page}
    </button>
  )
}
