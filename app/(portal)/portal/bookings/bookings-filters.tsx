'use client'

import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { bookingStatusLabel, bookingStatusTone } from '@/components/portal/booking-status-badge'
import { StatusDot } from '@/components/portal/status-dot'
import { StreamDot } from '@/components/portal/stream-dot'
import { Button } from '@/components/ui/button'
import type { StayDateRange } from '@/components/ui/calendar'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MultiSelectFilter, type MultiSelectOption } from '@/components/ui/multi-select-filter'
import { BOOKING_STATUSES, type BookingStatus } from '@/lib/domain/booking-state'
import type { StayDate } from '@/lib/domain/dates'
import { BOOKING_STREAMS, BOOKING_STREAM_LABELS, type BookingStream } from '@/lib/domain/stream'
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
  /** The chosen streams, in canonical order. Empty means any. */
  streams: readonly BookingStream[]
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
    leading: <StatusDot tone={bookingStatusTone(status)} />,
  }),
)

/**
 * The type options, each carrying its stream dot — so the panel reads in the
 * same language as the column it filters and the tiles above it.
 *
 * A *stream* dot, not a status one. They are two colour registers doing two
 * jobs, and this panel sits directly under the Status panel that uses the
 * other, which is exactly where borrowing a hue would read as a meaning.
 */
const STREAM_OPTIONS: readonly MultiSelectOption<BookingStream>[] = BOOKING_STREAMS.map(
  (stream) => ({
    value: stream,
    label: BOOKING_STREAM_LABELS[stream],
    leading: <StreamDot stream={stream} />,
  }),
)

export function BookingsFilters({ statuses, streams, from, to }: BookingsFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const range: StayDateRange | null = from && to ? { start: from, end: to } : null
  const isFiltered = statuses.length > 0 || streams.length > 0 || range !== null

  /**
   * Writes the whole filter set, not a patch of it.
   *
   * Every control passes the values the other two currently hold, so the URL is
   * rebuilt from one place. Merging into the existing query string instead would
   * mean this island had to know which params belong to it — and it would carry
   * forward a param the page had already rejected as malformed.
   */
  function apply(
    nextStatuses: readonly BookingStatus[],
    nextStreams: readonly BookingStream[],
    nextRange: StayDateRange | null,
  ) {
    const params = new URLSearchParams()

    // One param per status rather than one comma-joined value — see the page's
    // reader for why.
    for (const status of nextStatuses) {
      params.append('status', status)
    }

    for (const stream of nextStreams) {
      params.append('stream', stream)
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
        onChange={(next) => apply(next, streams, range)}
      />

      {/* The plural control for the same param the stat tiles set. A tile is
          "show me these"; this is "these two, not that one".

          Labelled "Type" rather than "Stream": prd.md §1's word is *stream*,
          and it stays the word in the schema and the URL, but it is trade
          vocabulary. The staff reading this row say type. */}
      <MultiSelectFilter
        label="Type"
        options={STREAM_OPTIONS}
        selected={streams}
        onChange={(next) => apply(statuses, next, range)}
      />

      {/* "Staying", not "from / to": the filter matches stays that overlap the
          range, not stays that begin inside it. */}
      <DateRangePicker
        label="Staying"
        value={range}
        onChange={(next) => apply(statuses, streams, next)}
      />

      {isFiltered ? (
        <Button variant="ghost" onClick={() => apply([], [], null)}>
          {/* A funnel struck through, not a bare cross: this clears the whole
              filter set, where a cross elsewhere in the row clears one field. */}
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
