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
  searchParams: Promise<{ status?: string; from?: string; to?: string }>
}

function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value)
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
  const status = params.status && isBookingStatus(params.status) ? params.status : undefined

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

  const filter: BookingListFilter = { status, overlaps: range }
  const bookings = await listBookings(filter)
  const isFiltered = Boolean(status || range)

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every booking across all streams — the single source of truth."
        actions={
          <Button asChild>
            <Link href="/portal/bookings/new">
              <Plus aria-hidden />
              New booking
            </Link>
          </Button>
        }
      />

      {/* The filter row. It reads as a row of chips rather than a form: each
          chip names its field and reports its value, so the state of the list
          is legible without opening anything, and the count of what came back
          sits at the end of the same line — the answer to "did that do
          anything" beside the control that asked. */}
      <div className="mt-xl flex flex-wrap items-center justify-between gap-md">
        <BookingsFilters status={status} from={from} to={to} />

        <h2 id="results-heading" className="micro-label text-muted-foreground">
          {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
          {isFiltered ? ' matching' : ''}
        </h2>
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
                <TableRow key={booking.id} className="relative focus-within:bg-muted/60">
                  <TableCell className="font-mono text-foreground tabular-nums">
                    {/* The stretched link: it covers the whole row, so a click
                        anywhere opens the booking, while the anchor itself stays
                        on the reference — which is what a screen reader should
                        announce as the link text. */}
                    <Link
                      href={`/portal/bookings/${booking.reference}`}
                      className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:underline"
                    >
                      {booking.reference}
                    </Link>
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
