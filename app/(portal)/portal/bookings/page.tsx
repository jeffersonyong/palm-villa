import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'

import { BookingStatusBadge } from '@/components/portal/booking-status-badge'
import { StreamDot } from '@/components/portal/stream-dot'
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
import {
  countBookingsByStream,
  listBookings,
  type Booking,
  type BookingListFilter,
} from '@/lib/db/bookings'
import { BOOKING_STATUSES, type BookingStatus } from '@/lib/domain/booking-state'
import { addDays, formatStayDates, isStayDate, nightsBetween } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'
import { BOOKING_STREAMS, BOOKING_STREAM_LABELS, isBookingStream } from '@/lib/domain/stream'

import { clampPage, pageCountFor } from '@/components/ui/pagination-range'

import { BookingsFilters } from './bookings-filters'
import { BookingsPagination } from './bookings-pagination'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from './page-size'
import { StreamTiles } from './stream-tiles'

export const metadata: Metadata = {
  title: 'Bookings',
}

/**
 * Every booking in one list (capability B1, list half).
 *
 * This is the screen that replaces the spreadsheet, so it stays a list: filter,
 * scan, read. The calendar view of the same data is a later slice.
 *
 * ── One register, all three streams ────────────────────────────────────────
 *
 * The header has always promised "every booking across all streams — the
 * single source of truth", and until `booking_summary` learned to left-join
 * occupancy that was untrue by construction: a day pass occupies no unit
 * (prd.md §6.1), so it had no occupancy row and could never appear. The table
 * is therefore built for a row that has no unit and no dates, which is what
 * collapsed the two date columns into one and turned Nights — a fact only a
 * stay has — into Guests, which every stream has.
 *
 * **Nothing writes a day pass or a tenancy yet.** The day-pass flow is phase
 * two and tenancy is phase three, so those two tiles read zero today. That is
 * the honest state of the system rather than a gap in this screen: the
 * register is now the shape those slices need, so each adds a writer instead
 * of reworking every list.
 *
 * ── Filters are URL state ──────────────────────────────────────────────────
 *
 * A staff member can keep "everything awaiting payment" open in a tab, bookmark
 * it, or send the link to someone else. They are read and validated here and
 * applied in the query, so there is no client-side filtering to drift out of
 * step with the data; the filter row itself is a small island that does nothing
 * but write those params, and the stat tiles are plain links that write the
 * same ones.
 *
 * Rows open the booking's own screen. The link is stretched across the row from
 * the reference cell rather than the row being made clickable in JavaScript,
 * which keeps this a server component with no island on it at all — and keeps
 * the row keyboard-reachable, middle-clickable and openable in a new tab, none
 * of which an onClick handler would give for free.
 */

interface PageProps {
  /** `status` and `stream` repeat, one param per chosen value. */
  searchParams: Promise<{
    status?: string | string[]
    stream?: string | string[]
    from?: string
    to?: string
    page?: string
    size?: string
  }>
}

function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value)
}

/**
 * The chosen values of a repeating param, in the canonical order rather than
 * the URL's.
 *
 * Repeated params (`?status=confirmed&status=checked_in`) rather than one
 * comma-joined value: it is what a browser does with a multi-valued field, what
 * `URLSearchParams` reads back without help, and it keeps each value a whole
 * token so a stray comma cannot invent a third status. Unknown values are
 * dropped rather than erroring — a hand-edited URL should narrow the list, not
 * break the screen.
 */
function readChoices<T extends string>(
  value: string | string[] | undefined,
  canonical: readonly T[],
  isMember: (candidate: string) => candidate is T,
): readonly T[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value]
  const chosen = new Set(raw.filter(isMember))

  return canonical.filter((entry) => chosen.has(entry))
}

/**
 * The requested page, or 1.
 *
 * Anything unusable — a word, a negative, a decimal — falls back to the first
 * page rather than erroring, which is how every other param on this screen
 * treats a hand-edited URL. Being *past the end* is not handled here: that
 * needs the total, so it is clamped after the read.
 */
function readPage(value: string | undefined): number {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

/** The requested rows-per-page, restricted to the sizes the footer offers. */
function readPageSize(value: string | undefined): number {
  const parsed = Number(value)

  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_PAGE_SIZE
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
  const statuses = readChoices(params.status, BOOKING_STATUSES, isBookingStatus)
  const streams = readChoices(params.stream, BOOKING_STREAMS, isBookingStream)

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

  const filter: BookingListFilter = { statuses, streams, overlaps: range }

  // Only a size the footer actually offers, so a hand-edited `?size=5000` is
  // not a way to ask for every booking at once.
  const pageSize = readPageSize(params.size)
  const requestedPage = readPage(params.page)

  // Read together: the tiles summarise the table, so a round trip apart would
  // let the two describe different moments.
  const [firstAttempt, streamCounts] = await Promise.all([
    listBookings(filter, { page: requestedPage, pageSize }),
    countBookingsByStream(filter),
  ])

  // A bookmarked `?page=7` outlives the rows beneath it — a filter narrows, a
  // booking is cancelled — and PostgREST answers a range past the end with an
  // empty page rather than an error. Clamping against the total we just read
  // turns that into the last real page instead of an empty table under a
  // footer claiming rows exist. The second read only happens when the page was
  // genuinely out of range, which is the rare case.
  const currentPage = clampPage(requestedPage, pageCountFor(firstAttempt.total, pageSize))
  const { bookings, total } =
    currentPage === requestedPage
      ? firstAttempt
      : await listBookings(filter, { page: currentPage, pageSize })

  const isFiltered = statuses.length > 0 || streams.length > 0 || Boolean(range)

  // Two carry-sets, because the two controls carry different things. The
  // tiles *set* `stream`, so theirs must not already contain one; the footer
  // moves within the current view, so it has to keep every filter including
  // the stream. Both are built from the values the server actually applied,
  // so a param the page rejected as malformed is never carried forward.
  const tileParams = new URLSearchParams()

  for (const status of statuses) {
    tileParams.append('status', status)
  }

  if (from && to) {
    tileParams.set('from', from)
    tileParams.set('to', to)
  }

  const pageParams = new URLSearchParams(tileParams)

  for (const stream of streams) {
    pageParams.append('stream', stream)
  }

  if (pageSize !== DEFAULT_PAGE_SIZE) {
    pageParams.set('size', String(pageSize))
  }

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
        <BookingsFilters statuses={statuses} streams={streams} from={from} to={to} />

        {/* The count that used to sit here is gone: the table's own footer
            states it properly ("1–25 of 47 bookings") and is the thing that
            also lets you move, so keeping both meant reading the same figure
            twice in two registers a hand's width apart. */}
        <Button asChild className="ml-auto">
          <Link href="/portal/bookings/new">
            <Plus aria-hidden />
            New booking
          </Link>
        </Button>
      </div>

      {/* Under the control row, not above it: these figures are an effect of
          the filters, and a summary that changes above the control that changed
          it reads as two unrelated things moving at once. */}
      <StreamTiles counts={streamCounts} selected={streams} otherParams={tileParams} />

      {/* Named directly now that the visible heading has gone. A `section`
          with no accessible name is not a landmark at all, so dropping the
          heading without this would have quietly removed a navigation stop. */}
      <section aria-label="Bookings" className="mt-md">
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
          <Table
            footer={
              <BookingsPagination
                page={currentPage}
                pageSize={pageSize}
                total={total}
                params={pageParams.toString()}
              />
            }
          >
            <TableHeader>
              <TableHeaderRow>
                <TableHead>Reference</TableHead>
                {/* Name and number in one column, stacked. They were two, and
                    at ten columns the register wrapped six of them — a phone
                    number broken across two lines is not the "overview" the
                    column was added for. A guest and the number they were
                    called on are one identity anyway, which is how the booking
                    screen's own header already prints them. */}
                <TableHead>Guest</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Guests</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                {/* The chevron's column. Named for screen readers and hidden
                    from sight: a visible header over a decorative glyph would
                    claim the arrow is data. */}
                <TableHead className="w-0">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableHeaderRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => (
                <BookingRow key={booking.id} booking={booking} />
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  )
}

/** Shown wherever a stream does not have the fact a column asks for. */
const ABSENT = '—'

function BookingRow({ booking }: { booking: Booking }) {
  const { stay } = booking
  const nights = stay ? nightsBetween(stay.range.start, stay.range.end) : null
  const guests = booking.chargeableGuests + booking.exemptGuests

  return (
    <TableRow interactive className="group">
      <TableCell className="font-mono text-foreground tabular-nums">
        <TableRowLink href={`/portal/bookings/${booking.reference}`}>
          {booking.reference}
        </TableRowLink>
      </TableCell>

      <TableCell>
        <span className="block text-foreground">{booking.guestName}</span>
        {/* `tabular-nums` but not mono: mono is the reference column's
            signature (design.md §Typography — Geist Mono for references and
            codes), and a second mono column would blunt what the first says. */}
        <span className="mt-xxs block text-caption whitespace-nowrap text-muted-foreground tabular-nums">
          {booking.guestPhone}
        </span>
      </TableCell>

      {/* A dot beside a word, never a badge. The row already carries one
          tinted chip and it means how the booking turned out; a second in the
          same construction would leave the reader working out which colour was
          the status. So the stream takes the third colour register at icon
          scale — see StreamDot. */}
      <TableCell className="whitespace-nowrap">
        <span className="flex items-center gap-xs">
          <StreamDot stream={booking.stream} />
          {BOOKING_STREAM_LABELS[booking.stream]}
        </span>
      </TableCell>

      <TableCell className="whitespace-nowrap tabular-nums">
        {stay ? stay.unitRef : <Absent title="Occupies no unit" />}
      </TableCell>

      {/* One column where there were two. Nights moves under the dates as the
          quiet half of the same fact rather than taking a column of its own —
          a column only stays could ever fill. */}
      <TableCell className="whitespace-nowrap">
        {stay ? (
          <>
            <span className="text-copy">{formatStayDates(stay.range.start, stay.range.end)}</span>
            <span className="mt-xxs block text-caption text-muted-foreground">
              {nights} {nights === 1 ? 'night' : 'nights'}
            </span>
          </>
        ) : (
          <Absent title="No stay dates" />
        )}
      </TableCell>

      {/* Replaces Nights: every stream has a headcount, and a day pass is
          priced on nothing else (prd.md §8.1). Everyone arriving, including
          the under-threes who are not charged — the split is on the booking. */}
      <TableCell className="text-right tabular-nums">{guests}</TableCell>

      <TableCell className="text-right whitespace-nowrap tabular-nums">
        BND {formatCents(booking.total)}
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <BookingStatusBadge status={booking.status} />
      </TableCell>

      {/* The affordance, not a control: the whole row is already the link, so
          this says the row opens something and is hidden from the accessibility
          tree, where `TableRowLink` has already said it properly. It follows
          the row's hover the way the sidebar's icons follow their item. */}
      <TableCell className="w-0 pl-0 text-right">
        <ChevronRight
          aria-hidden
          className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
        />
      </TableCell>
    </TableRow>
  )
}

/**
 * A cell a stream has no answer for.
 *
 * Titled rather than bare: an em dash in the Unit column is only obvious once
 * you know a day pass occupies nothing, and the register is read by staff who
 * have not read prd.md §6.1.
 */
function Absent({ title }: { title: string }) {
  return (
    <span className="text-muted-foreground" title={title}>
      {ABSENT}
    </span>
  )
}
