'use client'

import type { Route } from 'next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { BookingStatusBadge, bookingStatusLabel } from '@/components/portal/booking-status-badge'
import { UnitStatusBadge } from '@/components/portal/unit-status-badge'
import { badgeVariants } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatStayDate, formatStayDates } from '@/lib/domain/dates'
import { UNIT_STATUS_LABELS } from '@/lib/domain/unit-status'
import { cn } from '@/lib/utils'

import type { TapeChartBar as Bar } from './tape-chart'

/**
 * One bar on the tape chart: a stay, a lease, or an out-of-service band.
 *
 * It is the status badge's construction at row scale — the same tone classes,
 * the same 6px radius, the same caption text — stretched across the nights it
 * holds, so a bar and the chip in its own tooltip are visibly the same colour
 * meaning the same thing. A bar is a link to the record (design.md — detail
 * screens are routes, never drawers): a booking opens its own screen, and a
 * lease or a closed unit opens the unit's, which is where either is managed.
 *
 * A cut end is square and carries a chevron — the stay runs on past the month
 * — while an end inside the month keeps its radius and a 2px inset, so two
 * back-to-back stays meet with a visible seam at the changeover rather than
 * fusing into one. Below two columns the label cannot fit and is dropped; the
 * link's accessible name carries the whole record regardless.
 *
 * The one client component in the grid, because the tooltip is Radix. The
 * tooltip is a hint, not a record: who, when, and the status chip.
 */

interface TapeChartBarProps {
  bar: Bar
}

export function TapeChartBar({ bar }: TapeChartBarProps) {
  const span = bar.colEnd - bar.colStart

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={bar.href as Route}
          aria-label={accessibleName(bar)}
          className={cn(
            badgeVariants({ tone: bar.tone }),
            'absolute inset-y-[6px] flex w-auto items-center overflow-hidden whitespace-nowrap outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
            bar.continuesBefore ? 'left-0 rounded-l-none pl-xs' : 'left-[2px]',
            bar.continuesAfter ? 'right-0 rounded-r-none pr-xs' : 'right-[2px]',
          )}
        >
          {bar.continuesBefore ? <ChevronLeft className="size-3 shrink-0" aria-hidden /> : null}
          <span className={cn('min-w-0 truncate', span < 2 && 'hidden')}>{bar.label}</span>
          {bar.continuesAfter ? (
            <ChevronRight className="ml-auto size-3 shrink-0" aria-hidden />
          ) : null}
        </Link>
      </TooltipTrigger>

      <TooltipContent>
        <p className="text-body-sm-strong text-foreground">{bar.label}</p>
        <p className="text-muted-foreground">{whenText(bar)}</p>
        <div className="mt-xs flex items-center gap-sm">
          {statusBadge(bar)}
          {bar.reference ? (
            <span className="font-mono text-foreground tabular-nums">{bar.reference}</span>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function whenText(bar: Bar): string {
  if (bar.kind === 'out_of_service') {
    return `Since ${formatStayDate(bar.start)}`
  }

  // Only a lease can lack an end (N19); the wording is the units board's.
  return bar.end === null
    ? `${formatStayDate(bar.start)} → no end date`
    : formatStayDates(bar.start, bar.end)
}

function statusLabel(bar: Bar): string {
  const status = bar.status

  if (status === 'out_of_service') {
    return UNIT_STATUS_LABELS.out_of_service
  }

  if (status === 'leased') {
    return UNIT_STATUS_LABELS.leased_long_term
  }

  return bookingStatusLabel(status)
}

function statusBadge(bar: Bar) {
  const status = bar.status

  if (status === 'out_of_service') {
    return <UnitStatusBadge status="out_of_service" />
  }

  if (status === 'leased') {
    return <UnitStatusBadge status="leased_long_term" />
  }

  return <BookingStatusBadge status={status} />
}

/**
 * The whole record in one name, since the visible label may be dropped. An
 * out-of-service band's label *is* its status, so the status is not repeated.
 */
function accessibleName(bar: Bar): string {
  const status = statusLabel(bar)
  const parts = [bar.reference, bar.label, whenText(bar), status === bar.label ? null : status]

  return parts.filter((part): part is string => part !== null).join(', ')
}
