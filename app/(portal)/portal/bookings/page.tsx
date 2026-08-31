import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'

import { BookingStatusBadge } from '@/components/portal/booking-status-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
  TableRowLink,
} from '@/components/ui/table'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listBookings, type BookingListFilter } from '@/lib/db/bookings'
import { BOOKING_STATUSES, type BookingStatus } from '@/lib/domain/booking-state'
import { addDays, formatStayDate, isStayDate, nightsBetween } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

import { BookingsFilters } from './bookings-filters'

export const metadata: Metadata = {
  title: 'Bookings',
}

/**
 * Every booking in one list (capability B1, list half).
 *
 * This is the screen that replaces the spreadsheet, so it stays a list: filter,
 * scan, read. The calendar view of the same data is a later slice.
 *
 * Filters are URL state, so a staff member can keep "everything awaiting
 * payment" open in a tab, bookmark it, or send the link to someone else. They
 * are read and validated here and applied in the query, so there is no
 * client-side filtering to drift out of step with the data; the filter row
 * itself is a small island that does nothing but write those params.
 *
 * Rows open the booking's own screen. The link is stretched across the row from
 * the reference cell rather than the row being made clickable in JavaScript,
 * which keeps this a server component with no island on it at all — and keeps
 * the row keyboard-reachable, middle-clickable and openable in a new tab, none
 * of which an onClick handler would give for free.
 */

interface PageProps {
  /** `status` repeats, one param per chosen status. */
  searchParams: Promise<{ status?: string | string[]; from?: string; to?: string }>
}

function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value)
}

/**
 * The chosen statuses, in the canonical order rather than the URL's.
 *
 * Repeated params (`?status=confirmed&status=checked_in`) rather than one
 * comma-joined value: it is what a browser does with a multi-valued field, what
 * `URLSearchParams` reads back without help, and it keeps each value a whole
 * token so a stray comma cannot invent a third status. Unknown values are
 * dropped rather than erroring — a hand-edited URL should narrow the list, not
 * break the screen.
 */
function readStatuses(value: string | string[] | undefined): readonly BookingStatus[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value]
  const chosen = new Set(raw.filter(isBookingStatus))

  return BOOKING_STATUSES.filter((status) => chosen.has(status))
}

export default async function BookingsListPage({ searchParams }: PageProps) {
  const params = await searchParams
  const actor = await getActor()

  // Render is gated per-permission server-side (architecture.md §3), matching
  // the booking detail screen. `booking.view` is what Security holds and
  // nothing else, so it is the permission the list has to answer to.
  if (!actor || !hasPermission(actor.permissions, 'booking.view')) {
    return (
      <>
        <PageHeader title="Bookings" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Seeing bookings needs the "View bookings" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  // Anything unusable — a hand-edited URL, half a date pair, a reversed range —
  // falls back to no filter rather than erroring. A staff member who mistypes a
  // date should see the full list, not a stack trace.
  const statuses = readStatuses(params.status)

  const hasRange =
    Boolean(params.from && params.to) &&
    isStayDate(params.from!) &&
    isStayDate(params.to!) &&
    params.from! <= params.to!

  const from = hasRange ? params.from! : undefined
  const to = hasRange ? params.to! : undefined

  // `from` and `to` are **inclusive** — the first and last day the filter row's
  // calendar shows as selected — because that is what the person clicking them
  // meant. The query range is half-open, matching the occupancy convention the
  // exclusion constraint uses (architecture.md §5.2), so the last day is pushed
  // out by one here. This conversion belongs at the boundary and nowhere else:
  // a single-day filter is `[d, d+1)`, which is exactly "stays touching d".
  const range = from && to ? { start: from, end: addDays(to, 1) } : undefined

  const filter: BookingListFilter = { statuses, overlaps: range }
  const bookings = await listBookings(filter)
  const isFiltered = statuses.length > 0 || Boolean(range)

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every booking across all streams — the single source of truth."
      />

      {/* One control row: what is being shown on the left, and what can be done
          about it on the right. The chips name their field and report their
          value, so the state of the list is legible without opening anything;
          the count sits next to the create action because the two together are
          the whole answer to "what is here, and what now". The screen's one
          primary fill lives here rather than in the header — design.md allows
          one per screen region, and this row is now that region. */}
      <div className="mt-xl flex flex-wrap items-center gap-md">
        <BookingsFilters statuses={statuses} from={from} to={to} />

        <div className="ml-auto flex items-center gap-lg">
          <h2 id="results-heading" className="micro-label text-muted-foreground">
            {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
            {isFiltered ? ' matching' : ''}
          </h2>

          <Button asChild>
            <Link href="/portal/bookings/new">
              <Plus aria-hidden />
              New booking
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="results-heading" className="mt-md">
        {bookings.length === 0 ? (
          <EmptyState
            title={isFiltered ? 'No bookings match these filters' : 'No bookings yet'}
            description={
              isFiltered
                ? 'Try a wider date range, or clear the filters to see everything.'
                : 'Bookings created in the portal or from the public site appear here.'
            }
            action={
              isFiltered ? (
                <Button asChild variant="tertiary">
                  <Link href="/portal/bookings">Clear filters</Link>
                </Button>
              ) : (
                <Button asChild variant="tertiary">
                  <Link href="/portal/bookings/new">Create a booking</Link>
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableHeaderRow>
                <TableHead>Reference</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead className="text-right">Nights</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableHeaderRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => (
                <TableRow key={booking.id} interactive>
                  <TableCell className="font-mono text-foreground tabular-nums">
                    <TableRowLink href={`/portal/bookings/${booking.reference}`}>
                      {booking.reference}
                    </TableRowLink>
                  </TableCell>
                  <TableCell className="text-foreground">{booking.guestName}</TableCell>
                  <TableCell className="tabular-nums">{booking.unitRef}</TableCell>
                  <TableCell>{formatStayDate(booking.range.start)}</TableCell>
                  <TableCell>{formatStayDate(booking.range.end)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {nightsBetween(booking.range.start, booking.range.end)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    BND {formatCents(booking.total)}
                  </TableCell>
                  <TableCell>
                    <BookingStatusBadge status={booking.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  )
}
