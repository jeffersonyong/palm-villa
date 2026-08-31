import type { Metadata } from 'next'

import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Badge } from '@/components/ui/badge'
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
import { listPayments, type Payment } from '@/lib/db/payments'
import { elapsedMinutes, formatElapsed, formatStayDate, formatTimestamp } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

import { PaymentActions } from './payment-actions'
import { PaymentsFilters } from './payments-filters'
import { PAYMENT_VIEWS, readView, statusesForView } from './views'

export const metadata: Metadata = {
  title: 'Payment verification',
}

/**
 * The payment verification queue (capabilities B4, B5, B6).
 *
 * prd.md §10.4 fixes what a row shows: "reference, guest name, amount
 * expected, time waiting, and the uploaded slip". Those are the columns, in
 * that order.
 *
 * Oldest first. A queue is worked from the top and the longest wait belongs
 * there, which is the opposite of every other list in the portal — and it is
 * also, for now, the only thing standing between a forgotten transfer and a
 * unit blocked indefinitely. prd.md §18 N7 (hold duration) is open and no job
 * expires a pending transfer yet, so the screen makes the wait visible rather
 * than pretending something is handling it.
 *
 * The row's action is the point of the screen, so it sits in the row rather
 * than behind a menu. Opening the booking is the reference cell's link.
 */

interface PageProps {
  searchParams: Promise<{ show?: string | string[] }>
}

export default async function PaymentVerificationPage({ searchParams }: PageProps) {
  const params = await searchParams
  const actor = await getActor()

  // Render is gated per-permission server-side (architecture.md §3). The gate
  // that matters is on each action; this spares a staff member a screen they
  // cannot use — Security and Housekeeping hold no payment permission at all.
  if (!actor || !hasPermission(actor.permissions, 'payment.verify')) {
    return (
      <>
        <PageHeader title="Payment verification" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Working the payment queue needs the "Verify payments" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const view = readView(params.show)
  const payments = await listPayments({ statuses: statusesForView(view) })
  const mayVerify = hasPermission(actor.permissions, 'payment.verify')

  return (
    <>
      <PageHeader
        title="Payment verification"
        description="Bookings waiting on a bank transfer. Check the amount in your bank app, then confirm — oldest first."
      />

      <div className="mt-xl flex flex-wrap items-center gap-md">
        <PaymentsFilters view={view} />

        <div className="ml-auto">
          <h2 id="queue-heading" className="micro-label text-muted-foreground">
            {payments.length} {payments.length === 1 ? 'payment' : 'payments'}
            {view === 'waiting' ? ' waiting' : ''}
          </h2>
        </div>
      </div>

      <section aria-labelledby="queue-heading" className="mt-md">
        {payments.length === 0 ? (
          <EmptyState
            title={view === 'waiting' ? 'Nothing waiting on a transfer' : 'No payments to show'}
            description={
              view === 'waiting'
                ? 'Bookings paid by bank transfer appear here until someone confirms the money landed.'
                : `Nothing matches "${PAYMENT_VIEWS[view]}" yet.`
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableHeaderRow>
                <TableHead>Reference</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Arriving</TableHead>
                {/* prd.md §10.4 names this column "amount expected", and that
                    is exactly what it is while a payment is waiting. Once one
                    is settled the useful figure is what actually arrived, so
                    the header follows the view rather than claiming one thing
                    and showing another. */}
                <TableHead className="text-right">
                  {view === 'waiting' ? 'Amount expected' : 'Amount'}
                </TableHead>
                <TableHead className="text-right">Waiting</TableHead>
                <TableHead>Slip</TableHead>
                {mayVerify ? <TableHead className="text-right">Action</TableHead> : null}
              </TableHeaderRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <QueueRow key={payment.id} payment={payment} mayVerify={mayVerify} />
              ))}
            </TableBody>
          </Table>
        )}

        {/* Decision 2, kept where it is actually load-bearing rather than only
            in a doc: prd.md §10.4 treats the slip as evidence, not
            verification, which is what lets this screen ship complete before
            document storage exists. */}
        <p className="mt-md text-caption text-muted-foreground">
          Slip uploads arrive with the documents slice, alongside the public booking flow. The bank
          app remains the check either way — a slip is evidence, not verification.
        </p>
      </section>
    </>
  )
}

function QueueRow({ payment, mayVerify }: { payment: Payment; mayVerify: boolean }) {
  const waiting = formatElapsed(elapsedMinutes(payment.createdAt))
  // The booking was repriced after the guest was told what to send. Without
  // this the clerk matches against a stale quote and overrides for no reason.
  const isRepriced = payment.expected !== payment.due
  const isPending = payment.status === 'pending_verification'

  return (
    <TableRow interactive>
      <TableCell className="font-mono text-foreground tabular-nums">
        <TableRowLink href={`/portal/bookings/${payment.bookingReference}`}>
          {payment.bookingReference}
        </TableRowLink>
      </TableCell>
      <TableCell className="text-foreground">{payment.guestName}</TableCell>
      <TableCell>{payment.checkIn ? formatStayDate(payment.checkIn) : '—'}</TableCell>
      <TableCell className="text-right tabular-nums">
        {/* Waiting: what the guest was asked for. Settled: what actually
            arrived — showing the amount due against a payment already taken
            reads as the sum that was banked, and for anything confirmed with a
            discrepancy that would be the wrong number. */}
        BND {formatCents(isPending ? payment.due : (payment.amount ?? payment.due))}
        {!isPending && payment.amount !== null && payment.amount !== payment.expected ? (
          <span className="mt-xxs block text-caption text-muted-foreground">
            of {formatCents(payment.expected)} due
          </span>
        ) : null}
        {isPending && isRepriced ? (
          <span className="mt-xxs flex justify-end">
            <Badge tone="warning">Repriced</Badge>
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {isPending ? (
          <time dateTime={payment.createdAt} title={formatTimestamp(payment.createdAt)}>
            {waiting}
          </time>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">No slip on file</TableCell>
      {mayVerify ? (
        <TableCell className="text-right">
          {isPending ? (
            // Above the stretched row link, or the buttons cannot be clicked.
            <div className="relative z-10">
              <PaymentActions
                paymentId={payment.id}
                bookingReference={payment.bookingReference}
                guestName={payment.guestName}
                due={payment.due}
              />
            </div>
          ) : (
            <span className="text-caption text-muted-foreground">
              {payment.verifiedAt ? `Verified ${formatTimestamp(payment.verifiedAt)}` : 'Verified'}
            </span>
          )}
        </TableCell>
      ) : null}
    </TableRow>
  )
}
