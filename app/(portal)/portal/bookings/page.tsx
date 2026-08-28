import type { Metadata } from 'next'
import Link from 'next/link'

import { BookingStatusBadge, bookingStatusLabel } from '@/components/portal/booking-status-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
} from '@/components/ui/table'
import { listBookings, type BookingListFilter } from '@/lib/db/bookings'
import { BOOKING_STATUSES, type BookingStatus } from '@/lib/domain/booking-state'
import { formatStayDate, isStayDate, nightsBetween } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

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
 * payment" open in a tab, bookmark it, or send the link to someone else. The
 * form is a plain GET, which means the whole screen is server-rendered and
 * there is no client-side filtering to drift out of step with the data.
 */

interface PageProps {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>
}

function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value)
}

export default async function BookingsListPage({ searchParams }: PageProps) {
  const params = await searchParams

  // Anything unusable — a hand-edited URL, half a date pair, a reversed range —
  // falls back to no filter rather than erroring. A staff member who mistypes a
  // date should see the full list, not a stack trace.
  const status = params.status && isBookingStatus(params.status) ? params.status : undefined

  const hasRange =
    Boolean(params.from && params.to) &&
    isStayDate(params.from!) &&
    isStayDate(params.to!) &&
    params.from! < params.to!

  const range = hasRange ? { start: params.from!, end: params.to! } : undefined

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
            <Link href="/portal/bookings/new">New booking</Link>
          </Button>
        }
      />

      <Card surface="raised" className="mt-xl">
        <form method="get" className="flex flex-wrap items-end gap-lg">
          <div className="grid gap-sm">
            <Label htmlFor="status">Status</Label>
            <NativeSelect
              className="w-[232px]"
              id="status"
              name="status"
              defaultValue={status ?? ''}
            >
              <option value="">Any status</option>
              {BOOKING_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {bookingStatusLabel(value)}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Labelled as "staying" rather than "from / to" because the filter
              matches stays that overlap the range, not stays that begin in it. */}
          <div className="grid w-[164px] gap-sm">
            <Label htmlFor="from">Staying from</Label>
            <Input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
          </div>

          <div className="grid w-[164px] gap-sm">
            <Label htmlFor="to">Staying until</Label>
            <Input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
          </div>

          <Button type="submit" variant="tertiary">
            Apply
          </Button>

          {isFiltered ? (
            <Button asChild variant="ghost">
              <Link href="/portal/bookings">Clear</Link>
            </Button>
          ) : null}
        </form>
      </Card>

      <section aria-labelledby="results-heading" className="mt-xl">
        <h2 id="results-heading" className="micro-label text-muted-foreground">
          {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
          {isFiltered ? ' matching' : ''}
        </h2>

        {bookings.length === 0 ? (
          <EmptyState
            className="mt-md"
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
          <Table containerClassName="mt-md">
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
                <TableRow key={booking.id}>
                  <TableCell className="font-mono text-foreground tabular-nums">
                    {booking.reference}
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
