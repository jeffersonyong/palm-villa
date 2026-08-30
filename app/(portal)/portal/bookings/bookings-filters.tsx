'use client'

import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import {
  bookingStatusLabel,
  bookingStatusTone,
  type BookingStatusTone,
} from '@/components/portal/booking-status-badge'
import { Button } from '@/components/ui/button'
import type { StayDateRange } from '@/components/ui/calendar'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MultiSelectFilter, type MultiSelectOption } from '@/components/ui/multi-select-filter'
import { BOOKING_STATUSES, type BookingStatus } from '@/lib/domain/booking-state'
import type { StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

/**
 * The bookings list's filter row (capability B1).
 *
 * Filters stay **URL state**, exactly as they were as a GET form: a staff
 * member can keep "everything awaiting payment" in a tab, bookmark it, or send
 * the link on. All that changed is who writes the URL — this island pushes it
 * so a choice takes effect on the click that made it, and the Apply button that
 * used to stand between the two goes away.
 *
 * The list itself stays a server component. Nothing here knows what a booking
 * is; it only knows how to write three search params.
 *
 * The current values arrive as props rather than through `useSearchParams`,
 * which keeps this out of a Suspense boundary and, more usefully, means the
 * chips can only ever show a filter the server actually applied — a param the
 * page rejected as malformed is not one the row will claim is on.
 */

interface BookingsFiltersProps {
  /** The chosen statuses, in canonical order. Empty means any. */
  statuses: readonly BookingStatus[]
  /** Both ends inclusive — the days the calendar shows as selected. */
  from?: StayDate
  to?: StayDate
}

/**
 * The status options, built once. Each carries its badge colour as a dot, so
 * the list of choices reads in the same language as the table below it.
 */
const STATUS_OPTIONS: readonly MultiSelectOption<BookingStatus>[] = BOOKING_STATUSES.map(
  (status) => ({
    value: status,
    label: bookingStatusLabel(status),
    leading: <StatusDot status={status} />,
  }),
)

export function BookingsFilters({ statuses, from, to }: BookingsFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const range: StayDateRange | null = from && to ? { start: from, end: to } : null
  const isFiltered = statuses.length > 0 || range !== null

  function apply(nextStatuses: readonly BookingStatus[], nextRange: StayDateRange | null) {
    const params = new URLSearchParams()

    // One param per status rather than one comma-joined value — see the page's
    // reader for why.
    for (const status of nextStatuses) {
      params.append('status', status)
    }

    if (nextRange) {
      params.set('from', nextRange.start)
      params.set('to', nextRange.end)
    }

    const query = params.toString()

    startTransition(() => {
      // `push`, not `replace`: back should undo a filter, which is how staff
      // expect to get out of one they picked by mistake. `scroll: false` keeps
      // a long list where it was.
      router.push(query ? `/portal/bookings?${query}` : '/portal/bookings', { scroll: false })
    })
  }

  return (
    <div
      aria-busy={isPending}
      className={cn(
        'flex flex-wrap items-center gap-sm transition-opacity duration-150 motion-reduce:transition-none',
        isPending && 'opacity-60',
      )}
    >
      {/* Several statuses at once, because "confirmed and checked in" — who is
          actually in the building — is a real question this list is asked. */}
      <MultiSelectFilter
        label="Status"
        options={STATUS_OPTIONS}
        selected={statuses}
        onChange={(next) => apply(next, range)}
      />

      {/* "Staying", not "from / to": the filter matches stays that overlap the
          range, not stays that begin inside it. */}
      <DateRangePicker label="Staying" value={range} onChange={(next) => apply(statuses, next)} />

      {isFiltered ? (
        <Button variant="ghost" onClick={() => apply([], null)}>
          <X aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}

/**
 * The status hue at icon scale, so the option list carries the same language as
 * the badges in the table below it.
 *
 * design.md reserves the mid semantic hues for icons, which is what this is —
 * and status colour is meaning rather than brand, so it stays identical on the
 * monochrome operations surface. The tone mapping is *not* duplicated here: it
 * comes from the badge module, which owns it.
 */
const DOT_CLASSES: Record<BookingStatusTone, string> = {
  positive: 'bg-positive',
  warning: 'bg-warning',
  negative: 'bg-negative',
  active: 'bg-brand',
  neutral: 'bg-mute',
}

function StatusDot({ status }: { status: BookingStatus }) {
  return (
    <span
      aria-hidden
      className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASSES[bookingStatusTone(status)])}
    />
  )
}
