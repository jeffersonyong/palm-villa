import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, ChevronRight, ExternalLink } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { LedgerMark } from '@/components/portal/ledger-mark'
import { ExportCsvButton } from '@/components/portal/export-csv'
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
import { exportGroup } from '@/lib/db/export'
import { listPendingDeposits } from '@/lib/db/deposits'
import { listPayments } from '@/lib/db/payments'
import { elapsedMinutes, formatElapsed, formatStayDate, formatTimestamp } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

import { DepositActions, PaymentActions } from './payment-actions'
import { PaymentsFilters } from './payments-filters'
import { buildQueue, type QueueEntry } from './queue-rows'
import { readView, statusesForView, type PaymentView } from './views'

export const metadata: Metadata = {
  title: 'Payment verification',
}

/**
 * The payment verification queue (capabilities B4, B5, B6, B16).
 *
 * **One action per row, since 19 September 2026.** The escape hatch B6 asks
 * for is inside the confirm dialog now rather than beside it — see
 * payment-actions.tsx for why a second button was the wrong shape for it.
 *
 * prd.md §10.4 fixes what a row shows: "reference, guest name, amount
 * expected, time waiting, and the uploaded slip". Those are the columns, in
 * that order, plus one the PRD could not have asked for: **what the money is
 * for**. §10.4 was written before a booking was secured by its deposit (N29,
 * 10 September 2026), so the queue it describes held one kind of row. It holds
 * two now, and which one a row is decides what confirming it does to the
 * booking — so the distinction is a column rather than a caption.
 *
 * Every bank transfer, the waiting ones first and the longest wait at the
 * top — a queue is worked from the top, which is the opposite of every other
 * list in the portal — and the verified ones beneath, newest first. The
 * reasoning, and why the screen no longer opens on the waiting ones alone, is
 * in `views.ts`. The wait is made visible rather than handled: N7 makes the
 * hold indefinite by the client's own decision, and no job expires a pending
 * transfer.
 *
 * Two kinds of row, and the difference matters to what a click does. A
 * **deposit** row is what confirms a booking (prd.md §9.1); a **payment** row
 * settles the stay, and confirms the booking only where no deposit is quoted
 * or one is already in — otherwise it is recorded and the booking waits on
 * its deposit's row, whichever order the clerk works them in.
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

  // Two tables, one queue. A promised security deposit (capability B16) is the
  // same job as a promised payment — somebody said they sent money and a
  // person has to check the bank — and they are separate rows underneath only
  // because prd.md §9.1 forbids a deposit being recorded as a payment.
  const [transfers, promisedDeposits] = await Promise.all([
    listPayments({
      methods: ['bank_transfer'],
      statuses: statusesForView(view),
      search: search ?? undefined,
    }),
    listPendingDeposits(),
  ])

  const payments = buildQueue(
    transfers,
    // The deposit read is unfiltered, so the screen's search has to be applied
    // here rather than in the query — a filter that narrowed one half of a
    // merged list and not the other would report a count nobody could explain.
    search === null
      ? promisedDeposits
      : promisedDeposits.filter((deposit) =>
          [deposit.bookingReference, deposit.guestName, deposit.guestPhone]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase()),
        ),
    view,
  )
  const mayVerify = hasPermission(actor.permissions, 'payment.verify')
  const mayExport = hasPermission(actor.permissions, 'config.manage')

  return (
    <>
      <PageHeader
        title="Payment verification"
        description="Every bank transfer and every promised security deposit, the ones still waiting first. Check the amount in your bank app, then confirm — the longest wait is at the top. A guest who sent the deposit and the stay together is two rows here: confirm each at its own figure."
      />

      <div className="mt-xl flex flex-wrap items-center gap-md">
        <PaymentsFilters view={view} search={search ?? ''} />

        <div className="ml-auto flex items-center gap-md">
          <h2 id="queue-heading" className="micro-label text-muted-foreground">
            {payments.length} {payments.length === 1 ? 'transfer' : 'transfers'}
            {view === 'waiting' ? ' waiting' : ''}
          </h2>

          {mayExport ? <ExportCsvButton tables={exportGroup('payments')} /> : null}
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
                {/* Which of the two kinds of money this row is. It was a gray
                    caption under the guest's name, which is where a scanning
                    eye does not go — and the difference decides what
                    confirming the row does to the booking, so it belongs in a
                    column that can be read down. */}
                <TableHead>For</TableHead>
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
                <QueueRow
                  key={`${payment.kind}-${payment.id}`}
                  payment={payment}
                  mayVerify={mayVerify}
                />
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
  all: 'Deposits and stays paid by bank transfer appear here — the ones still waiting first, then the ones confirmed.',
  waiting:
    'Deposits and stays paid by bank transfer appear here until someone confirms the money landed. It is the deposit that confirms a booking.',
  verified: 'A payment appears here once someone has confirmed the money landed.',
}

function QueueRow({ payment, mayVerify }: { payment: QueueEntry; mayVerify: boolean }) {
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
      {/* Said on every row, because the figure alone would read as a short
          payment against the booking's total — which is the confusion prd.md
          §9.1 spends a paragraph refusing.

          A **mark beside the word**, not a chip containing it — and a glyph
          rather than a dot, because two hues in one family cannot be told
          apart at 6px however they are chosen (the wheel is spent; see
          globals.css). The deposit's is the `LockKeyhole` it already wears on
          the Money card and its own screen. Every row has a ledger, so a
          tinted rectangle here would be colour on 100% of rows, and
          `Repriced` and the verified tick — the two marks that actually mean
          "look at this" — would have nothing to stand out against. */}
      <TableCell>
        <span className="flex items-center gap-sm whitespace-nowrap">
          <LedgerMark ledger={payment.kind === 'deposit' ? 'deposit' : 'stay'} />
          {payment.kind === 'deposit' ? 'Security deposit' : 'Stay'}
        </span>
      </TableCell>
      <TableCell>{payment.arriving ? formatStayDate(payment.arriving) : '—'}</TableCell>
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
          //
          // **It has to out-signal the row it sits on.** The whole row is a
          // link to the booking, so the pointer is already a pointer and the
          // row is already tinted before the cursor reaches this cell —
          // meaning the two things a link normally says for itself were being
          // said by something else, about somewhere else. An underline alone
          // could not tell them apart. So: the `ExternalLink` glyph, which is
          // the same mark `document-row.tsx` puts on its Open button and the
          // only thing on the row that says *a new tab*; a hairline underline
          // that goes solid ink under the pointer, which is a change the row
          // hover cannot imitate; and a `title` naming the destination,
          // because a document that opens elsewhere should say so before it
          // is clicked rather than after.
          <span className="relative z-10">
            <a
              href={`/portal/documents/${payment.slipDocumentId}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the transfer slip in a new tab"
              className="inline-flex items-center gap-xs text-foreground underline decoration-muted-foreground underline-offset-2 transition-colors hover:decoration-foreground [&>svg]:text-muted-foreground [&>svg]:transition-colors hover:[&>svg]:text-foreground"
            >
              <ExternalLink aria-hidden className="size-3.5 shrink-0" />
              On file
            </a>
          </span>
        ) : (
          <span className="text-muted-foreground">{payment.kind === 'deposit' ? '—' : 'None'}</span>
        )}
      </TableCell>
      {mayVerify ? (
        <TableCell className="text-right">
          {isPending ? (
            // Above the stretched row link, or the buttons cannot be clicked.
            <div className="relative z-10">
              {payment.kind === 'deposit' ? (
                <DepositActions
                  depositId={payment.id}
                  bookingReference={payment.bookingReference}
                  guestName={payment.guestName}
                  due={payment.due}
                />
              ) : (
                <PaymentActions
                  paymentId={payment.id}
                  bookingReference={payment.bookingReference}
                  guestName={payment.guestName}
                  due={payment.due}
                />
              )}
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
