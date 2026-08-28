import type { Metadata } from 'next'
import Link from 'next/link'

import { BookingStatusBadge } from '@/components/portal/booking-status-badge'
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
import type { BookingStatus } from '@/lib/domain/booking-state'

export const metadata: Metadata = {
  title: 'Operations',
}

/**
 * Placeholder. The real overview is the payment verification queue plus today's
 * arrivals — the two screens that replace the spreadsheet (prd.md §5.2).
 */
const queue: readonly { reference: string; guest: string; status: BookingStatus }[] = [
  { reference: 'PV-4821', guest: 'Placeholder guest', status: 'awaiting_payment_verification' },
  { reference: 'PV-4822', guest: 'Placeholder guest', status: 'confirmed' },
  { reference: 'PV-4823', guest: 'Placeholder guest', status: 'checked_in' },
  { reference: 'PV-4824', guest: 'Placeholder guest', status: 'expired' },
]

export default function PortalOverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Placeholder screen. No data layer is wired — this route exists to prove the (portal) group renders."
        actions={
          <Button asChild>
            <Link href="/portal/bookings/new">New booking</Link>
          </Button>
        }
      />

      <section aria-labelledby="queue-heading" className="mt-xl">
        <h2 id="queue-heading" className="text-display-xs text-foreground">
          Booking states
        </h2>
        <p className="mt-xs text-body-sm text-muted-foreground">
          The portal&rsquo;s status language: semantic badges, hairline rules, micro headers.
        </p>

        <Table containerClassName="mt-lg">
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Reference</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>State</TableHead>
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {queue.map((row) => (
              <TableRow key={row.reference}>
                <TableCell className="font-mono text-foreground tabular-nums">
                  {row.reference}
                </TableCell>
                <TableCell>{row.guest}</TableCell>
                <TableCell>
                  <BookingStatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  )
}
