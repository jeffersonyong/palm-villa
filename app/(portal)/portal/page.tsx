import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'

import { BookingStatusBadge } from '@/components/portal/booking-status-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Stat } from '@/components/portal/stat'
import { StatusDot } from '@/components/portal/status-dot'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { getDailySnapshot, type Booking } from '@/lib/db/bookings'
import { listDepositsForBookings, type Deposit } from '@/lib/db/deposits'
import { formatStayDate, todayInBrunei } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'
import { formatVehicles } from '@/lib/domain/vehicle'

export const metadata: Metadata = {
  title: 'Dashboard',
}

/**
 * Today, in one screen (prd.md §5.2, §20).
 *
 * Jason is the booking taker, the accountant and the decision maker, so the
 * question this screen answers is the one he opens the spreadsheet to answer:
 * who is arriving, who is leaving, and what is waiting on money. Anything that
 * does not save him time on day one belongs on another screen.
 *
 * Rendered per request: the data is read live and anchored to today, so
 * prerendering it at build time would freeze the date into the output.
 */
export const dynamic = 'force-dynamic'

export default async function PortalOverviewPage() {
  const actor = await getActor()

  // Gated before the first read, like every other screen that shows a booking
  // (architecture.md §3). This one was the exception, and the exception was
  // the wrong way round: it is the screen a staff member lands on straight
  // after signing in, and it carries names, vehicle registrations and deposit
  // figures. An account holding no roles — newly created, or stripped of them
  // as a soft off-boarding — saw today's arrivals before it saw anything else.
  //
  // `booking.view` because that is what the register answers to, and this is
  // the same data narrowed to one day.
  if (!actor || !hasPermission(actor.permissions, 'booking.view')) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Seeing today’s arrivals and departures needs the "View bookings" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const today = todayInBrunei()
  const snapshot = await getDailySnapshot(today)

  // What is actually held against the guests leaving today, in one read rather
  // than one per row. Before the deposits slice this column showed the figure
  // the booking *quoted*, which was a claim about money nobody had recorded
  // taking.
  const deposits = await listDepositsForBookings(snapshot.departures.map((b) => b.id))

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={formatStayDate(today)}
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link href="/portal/bookings">All bookings</Link>
            </Button>
            <Button asChild>
              <Link href="/portal/bookings/new">
                <Plus aria-hidden />
                New booking
              </Link>
            </Button>
          </>
        }
      />

      {/* Four tiles standing on the page ground — no container. A card around
          them was a box drawn around four boxes: the outer hairline bounded
          nothing the tiles were not already bounding, and it made the screen's
          first object a panel of chrome.

          They are cards rather than gray panels since the ground inverted
          (2026-08-31). A tile is an object sitting on the ground, and which
          tone makes it one depends on the ground: against white, gray was the
          object; against `canvas-sunk` a gray panel is a lighter patch that
          barely separates, so the object is the card. The gray panel keeps its
          real job — nested inside a card, where it still reads (design.md
          §Components — Cards).

          The dots carry each figure's booking state; "occupied tonight" is a
          capacity, so it takes none. */}
      <div className="mt-xl grid grid-cols-2 gap-md lg:grid-cols-4">
        <Card>
          <Stat
            size="sm"
            label="Arrivals today"
            value={snapshot.arrivals.length}
            dot={<StatusDot tone="positive" />}
          />
        </Card>
        <Card>
          <Stat
            size="sm"
            label="Departures today"
            value={snapshot.departures.length}
            dot={<StatusDot tone="active" />}
          />
        </Card>
        <Card>
          <Stat
            size="sm"
            label="Awaiting payment"
            value={snapshot.awaitingVerificationCount}
            dot={<StatusDot tone="warning" />}
          />
        </Card>
        <Card>
          <Stat
            size="sm"
            label="Occupied tonight"
            value={snapshot.occupiedTonightCount}
            hint={`of ${snapshot.totalUnits} units`}
          />
        </Card>
      </div>

      <ArrivalsSection bookings={snapshot.arrivals} />
      <DeparturesSection bookings={snapshot.departures} deposits={deposits} />
    </>
  )
}

function SectionHeading({ id, title, note }: { id: string; title: string; note: string }) {
  return (
    <>
      <h2 id={id} className="text-display-xs text-foreground">
        {title}
      </h2>
      <p className="mt-xs text-body-sm text-muted-foreground">{note}</p>
    </>
  )
}

function ArrivalsSection({ bookings }: { bookings: readonly Booking[] }) {
  return (
    <section aria-labelledby="arrivals-heading" className="mt-2xl">
      <SectionHeading
        id="arrivals-heading"
        title="Arriving today"
        note="Confirmed bookings checking in today, by unit. Each one's security deposit is already held — check-in takes nothing."
      />

      {bookings.length === 0 ? (
        <EmptyState
          className="mt-md"
          title="No arrivals today"
          description="Nothing is due to check in. Confirmed bookings appear here on their check-in date."
        />
      ) : (
        <Table containerClassName="mt-md">
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Reference</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Checking out</TableHead>
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
                <TableCell className="tabular-nums">{booking.stay?.unitRef ?? '—'}</TableCell>
                {/* Every plate on the booking, because the guard checks the car
                    that arrived and a family may come in two (prd.md §12.5). */}
                <TableCell className="tabular-nums">
                  {formatVehicles(booking.vehicles) ?? (
                    <span className="text-muted-foreground">
                      {booking.noVehicle ? 'None' : '—'}
                    </span>
                  )}
                </TableCell>
                <TableCell>{booking.stay ? formatStayDate(booking.stay.range.end) : '—'}</TableCell>
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
  )
}

function DeparturesSection({
  bookings,
  deposits,
}: {
  bookings: readonly Booking[]
  /** What is held against each, keyed by booking. Absent means none was taken. */
  deposits: ReadonlyMap<string, Deposit>
}) {
  return (
    <section aria-labelledby="departures-heading" className="mt-2xl">
      <SectionHeading
        id="departures-heading"
        title="Leaving today"
        note="Checked-in guests due out today. Each unit needs an inspection before its deposit can be released."
      />

      {bookings.length === 0 ? (
        <EmptyState
          className="mt-md"
          title="No departures today"
          description="Nothing is due out. Checked-in bookings appear here on their check-out date."
        />
      ) : (
        <Table containerClassName="mt-md">
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Reference</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Checked in</TableHead>
              <TableHead className="text-right">Deposit held</TableHead>
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
                <TableCell className="tabular-nums">{booking.stay?.unitRef ?? '—'}</TableCell>
                <TableCell>
                  {booking.stay ? formatStayDate(booking.stay.range.start) : '—'}
                </TableCell>
                {/* The fact, not the quote. A booking that quoted nothing, or
                    one checked in before the door started refusing an
                    unsecured booking, says so rather than showing a figure
                    nobody took. */}
                <TableCell className="text-right tabular-nums">
                  {deposits.has(booking.id) ? (
                    `BND ${formatCents(deposits.get(booking.id)!.amount)}`
                  ) : (
                    <span
                      className="text-muted-foreground"
                      title="No security deposit is held against this booking"
                    >
                      Not collected
                    </span>
                  )}
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
  )
}
