import type { Metadata } from 'next'
import Link from 'next/link'

import { BookingStatusBadge } from '@/components/portal/booking-status-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Stat } from '@/components/portal/stat'
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
import { getDailySnapshot, type Booking } from '@/lib/db/bookings'
import { formatStayDate, todayInBrunei } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

export const metadata: Metadata = {
  title: 'Overview',
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
  const today = todayInBrunei()
  const snapshot = await getDailySnapshot(today)

  return (
    <>
      <PageHeader
        title="Overview"
        description={formatStayDate(today)}
        actions={
          <Button asChild>
            <Link href="/portal/bookings/new">New booking</Link>
          </Button>
        }
      />

      <Card className="mt-xl grid grid-cols-2 gap-lg p-lg lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-divider">
        <Stat
          size="sm"
          label="Arrivals today"
          value={snapshot.arrivals.length}
          className="lg:px-lg lg:first:pl-0"
        />
        <Stat
          size="sm"
          label="Departures today"
          value={snapshot.departures.length}
          className="lg:px-lg"
        />
        <Stat
          size="sm"
          label="Awaiting payment"
          value={snapshot.awaitingVerificationCount}
          className="lg:px-lg"
        />
        <Stat
          size="sm"
          label="Occupied tonight"
          value={snapshot.occupiedTonightCount}
          hint={`of ${snapshot.totalUnits} units`}
          className="lg:px-lg lg:last:pr-0"
        />
      </Card>

      <ArrivalsSection bookings={snapshot.arrivals} />
      <DeparturesSection bookings={snapshot.departures} />

      <p className="mt-xl">
        <Button asChild variant="tertiary">
          <Link href="/portal/bookings">All bookings</Link>
        </Button>
      </p>
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
    <section aria-labelledby="arrivals-heading" className="mt-xl">
      <SectionHeading
        id="arrivals-heading"
        title="Arriving today"
        note="Confirmed bookings checking in today, by unit."
      />

      {bookings.length === 0 ? (
        <EmptyState
          className="mt-lg"
          title="No arrivals today"
          description="Nothing is due to check in. Confirmed bookings appear here on their check-in date."
        />
      ) : (
        <Table containerClassName="mt-lg">
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
                <TableCell className="tabular-nums">{booking.unitRef}</TableCell>
                <TableCell className="tabular-nums">
                  {booking.vehicleRegistration ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>{formatStayDate(booking.range.end)}</TableCell>
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

function DeparturesSection({ bookings }: { bookings: readonly Booking[] }) {
  return (
    <section aria-labelledby="departures-heading" className="mt-xl">
      <SectionHeading
        id="departures-heading"
        title="Leaving today"
        note="Checked-in guests due out today. Each unit needs an inspection before it is bookable again."
      />

      {bookings.length === 0 ? (
        <EmptyState
          className="mt-lg"
          title="No departures today"
          description="Nothing is due out. Checked-in bookings appear here on their check-out date."
        />
      ) : (
        <Table containerClassName="mt-lg">
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
                <TableCell className="tabular-nums">{booking.unitRef}</TableCell>
                <TableCell>{formatStayDate(booking.range.start)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  BND {formatCents(booking.securityDeposit)}
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
