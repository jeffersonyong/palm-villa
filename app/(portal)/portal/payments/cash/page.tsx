import type { Metadata } from 'next'
import Link from 'next/link'

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
import { listPayments } from '@/lib/db/payments'
import { listStaff } from '@/lib/db/staff'
import { addDays, formatTimestamp, isStayDate } from '@/lib/domain/dates'
import { formatCents, sumCents } from '@/lib/domain/money'

import { CashFilters } from './cash-filters'
import { RecordCashPayment } from './record-cash'

export const metadata: Metadata = {
  title: 'Cash payments',
}

/**
 * The cash record and its log (capability B7).
 *
 * prd.md §10.5 asks for cash recorded against a booking, with who collected it
 * and when. That is this screen. What it deliberately is not is the **daily
 * cash-up** — recorded cash against banked cash — which is capability E4, sits
 * with Finance, and needs a banked figure nothing in the system captures yet.
 * The total at the foot of this table is a sum of what is on screen and is
 * labelled as such, so it cannot be mistaken for a reconciliation.
 *
 * Newest first, unlike the verification queue. A log is read from the top; a
 * queue is worked from the top. They are the same query with opposite ends.
 */

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function CashPaymentsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const actor = await getActor()

  // Gated on `payment.record_cash`, which Front Office and Admin hold and
  // **Finance does not** (prd.md §4, supabase/seed.sql). That is deliberate —
  // Finance reconcile cash rather than take it — but it is surprising enough
  // that the empty state names the permission rather than reading as a bug.
  if (!actor || !hasPermission(actor.permissions, 'payment.record_cash')) {
    return (
      <>
        <PageHeader title="Cash payments" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Recording cash needs the "Record cash payments" permission, which sits with the front office. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  // Both ends inclusive — the days the calendar shows as selected — converted
  // to a half-open range at this boundary and nowhere else.
  const hasRange =
    Boolean(params.from && params.to) &&
    isStayDate(params.from!) &&
    isStayDate(params.to!) &&
    params.from! <= params.to!

  const from = hasRange ? params.from! : undefined
  const to = hasRange ? params.to! : undefined

  const [payments, staff] = await Promise.all([
    listPayments({
      methods: ['cash'],
      collectedFrom: from,
      collectedBefore: to ? addDays(to, 1) : undefined,
      newestFirst: true,
    }),
    listStaff(),
  ])

  const names = new Map(staff.map((account) => [account.id, account.displayName]))
  const total = sumCents(payments.map((payment) => payment.amount ?? 0))

  return (
    <>
      <PageHeader
        title="Cash payments"
        description="Cash collected on site, recorded against a booking — who took it, when, and how much."
      />

      <div className="mt-xl flex flex-wrap items-center gap-md">
        <CashFilters from={from} to={to} />

        <div className="ml-auto flex items-center gap-lg">
          <h2 id="cash-heading" className="micro-label text-muted-foreground">
            {payments.length} {payments.length === 1 ? 'payment' : 'payments'}
          </h2>
          <RecordCashPayment />
        </div>
      </div>

      <section aria-labelledby="cash-heading" className="mt-md">
        {payments.length === 0 ? (
          <EmptyState
            title={hasRange ? 'No cash recorded in these dates' : 'No cash recorded yet'}
            description={
              hasRange
                ? 'Try a wider date range, or clear the filters to see everything.'
                : 'Cash taken at the desk appears here as soon as it is recorded.'
            }
            action={
              hasRange ? (
                <Button asChild variant="tertiary">
                  <Link href="/portal/payments/cash">Clear filters</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableHeaderRow>
                <TableHead>Collected</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Collected by</TableHead>
                <TableHead>Booking</TableHead>
              </TableHeaderRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id} className="relative focus-within:bg-muted/60">
                  <TableCell className="tabular-nums">
                    {payment.collectedAt ? formatTimestamp(payment.collectedAt) : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-foreground tabular-nums">
                    <Link
                      href={`/portal/bookings/${payment.bookingReference}`}
                      className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:underline"
                    >
                      {payment.bookingReference}
                    </Link>
                  </TableCell>
                  <TableCell className="text-foreground">{payment.guestName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    BND {formatCents(payment.amount ?? 0)}
                  </TableCell>
                  <TableCell>
                    {payment.collectedBy ? (names.get(payment.collectedBy) ?? 'Unknown') : '—'}
                  </TableCell>
                  <TableCell>
                    <BookingStatusBadge status={payment.bookingStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {payments.length > 0 ? (
          <div className="mt-md flex items-baseline justify-between gap-lg">
            <p className="text-caption text-muted-foreground">
              A sum of the rows above, not a reconciliation. Comparing recorded cash against banked
              cash is the daily cash-up, a separate screen.
            </p>
            <p className="text-body-md text-foreground tabular-nums">BND {formatCents(total)}</p>
          </div>
        ) : null}
      </section>
    </>
  )
}
