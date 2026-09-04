import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, ChevronRight } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { readSearch } from '@/components/portal/list-params'
import { PageHeader } from '@/components/portal/page-header'
import { Badge } from '@/components/ui/badge'
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
import { listPayments, type Payment } from '@/lib/db/payments'
import { elapsedMinutes, formatElapsed, formatStayDate, formatTimestamp } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

import { PaymentActions } from './payment-actions'
import { PaymentsFilters } from './payments-filters'
import { readView, sortQueue, statusesForView, type PaymentView } from './views'

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
 * Every bank transfer, the waiting ones first and the longest wait at the
 * top — a queue is worked from the top, which is the opposite of every other
 * list in the portal — and the verified ones beneath, newest first. The
 * reasoning, and why the screen no longer opens on the waiting ones alone, is
 * in `views.ts`. The wait is made visible rather than handled: prd.md §18 N7
 * (hold duration) is open and no job expires a pending transfer yet.
 *
 * Bank transfers only. Cash has no verification to wait for and its own log;
 * a cash payment marked "verified" in this table would be a row with nothing
 * to do and no slip to open.
 *
 * The row's action is the point of the screen, so it sits in the row rather
 * than behind a menu. Opening the booking is the reference cell's link.
 */

interface PageProps {
  searchParams: Promise<{ show?: string | string[]; q?: string | string[] }>
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
  const search = readSearch(params.q)
  const payments = sortQueue(
    await listPayments({
      methods: ['bank_transfer'],
      statuses: statusesForView(view),
      search: search ?? undefined,
    }),
  )
  const mayVerify = hasPermission(actor.permissions, 'payment.verify')

  return (
    <>
      <PageHeader
        title="Payment verification"
        description="Every bank transfer, the ones still waiting first. Check the amount in your bank app, then confirm — the longest wait is at the top."
      />

      <div className="mt-xl flex flex-wrap items-center gap-md">
        <PaymentsFilters view={view} search={search ?? ''} />

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
            title={search !== null ? 'No payments match these filters' : EMPTY_TITLES[view]}
            description={
              search !== null
                ? 'Try a different name or reference, or clear the filters to see everything.'
                : EMPTY_DESCRIPTIONS[view]
            }
            action={
              search !== null ? (
                <Button asChild variant="tertiary">
                  <Link href="/portal/payments">Clear filters</Link>
                </Button>
              ) : undefined
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
                {/* The chevron's column. Named for screen readers and hidden
                    from sight: a visible header over a decorative glyph would
                    claim the arrow is data. */}
                <TableHead className="w-0">
                  <span className="sr-only">Open</span>
                </TableHead>
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
            verification. The sentence about uploads arriving later has gone —
            they are here (capability B10) — and what stays is the half that
            still governs how this screen is worked. */}
        <p className="mt-md text-caption text-muted-foreground">
          The bank app remains the check — a slip is evidence, not verification. Attach one from the
          booking.
        </p>
      </section>
    </>
  )
}

/** What an empty view says, by view — each names its own subject. */
const EMPTY_TITLES: Readonly<Record<PaymentView, string>> = {
  all: 'No bank transfers yet',
  waiting: 'Nothing waiting on a transfer',
  verified: 'No payments verified yet',
}

const EMPTY_DESCRIPTIONS: Readonly<Record<PaymentView, string>> = {
  all: 'Bookings paid by bank transfer appear here — the ones still waiting first, then the ones confirmed.',
  waiting: 'Bookings paid by bank transfer appear here until someone confirms the money landed.',
  verified: 'A payment appears here once someone has confirmed the money landed.',
}

function QueueRow({ payment, mayVerify }: { payment: Payment; mayVerify: boolean }) {
  const waiting = formatElapsed(elapsedMinutes(payment.createdAt))
  // The booking was repriced after the guest was told what to send. Without
  // this the clerk matches against a stale quote and overrides for no reason.
  const isRepriced = payment.expected !== payment.due
  const isPending = payment.status === 'pending_verification'

  return (
    <TableRow interactive className="group">
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
      <TableCell>
        {payment.slipDocumentId ? (
          // Above the stretched row link, or the anchor cannot be clicked —
          // the same `relative z-10` the action buttons already need. A plain
          // anchor rather than next/link, because the href behind it writes an
          // audit row and a prefetch on scroll would log a view nobody made.
          <span className="relative z-10">
            <a
              href={`/portal/documents/${payment.slipDocumentId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              On file
            </a>
          </span>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </TableCell>
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
            // A tick in the success hue before the date, so a settled row is
            // read as settled before the caption is — the saturated status
            // hues are for icons and dots (design.md §Color), and this is
            // one. Right-aligned with the buttons it stands in for.
            <span className="inline-flex items-center gap-xs text-caption text-muted-foreground">
              <Check aria-hidden className="size-3.5 shrink-0 text-positive" />
              {payment.verifiedAt ? `Verified ${formatTimestamp(payment.verifiedAt)}` : 'Verified'}
            </span>
          )}
        </TableCell>
      ) : null}
      {/* After the action, not before it: the buttons act on the payment, the
          arrow says the row opens the booking, and a glyph between the figures
          and the buttons would read as part of the action. */}
      <TableCell className="w-0 pl-0 text-right">
        <ChevronRight
          aria-hidden
          className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
        />
      </TableCell>
    </TableRow>
  )
}
