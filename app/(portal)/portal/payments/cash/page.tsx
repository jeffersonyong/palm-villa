import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { BookingStatusBadge } from '@/components/portal/booking-status-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { overlapRangeOf, readSearch, readStayWindow } from '@/components/portal/list-params'
import { PageHeader } from '@/components/portal/page-header'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/components/ui/avatar-identity'
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
import { listPayments } from '@/lib/db/payments'
import { listStaff } from '@/lib/db/staff'
import { formatTimestamp } from '@/lib/domain/dates'
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
  searchParams: Promise<{ from?: string; to?: string; q?: string | string[] }>
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
  const window = readStayWindow(params.from, params.to)
  const search = readSearch(params.q)
  const isFiltered = window !== null || search !== null

  const [payments, staff] = await Promise.all([
    listPayments({
      methods: ['cash'],
      collectedFrom: window?.from,
      collectedBefore: window ? overlapRangeOf(window).end : undefined,
      search: search ?? undefined,
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
        <CashFilters from={window?.from} to={window?.to} search={search ?? ''} />

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
            title={isFiltered ? 'No cash payments match these filters' : 'No cash recorded yet'}
            description={
              isFiltered
                ? 'Try a wider date range, or clear the filters to see everything.'
                : 'Cash taken at the desk appears here as soon as it is recorded.'
            }
            action={
              isFiltered ? (
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
                <TableRow key={payment.id} interactive className="group">
                  <TableCell className="tabular-nums">
                    {payment.collectedAt ? formatTimestamp(payment.collectedAt) : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-foreground tabular-nums">
                    <TableRowLink href={`/portal/bookings/${payment.bookingReference}`}>
                      {payment.bookingReference}
                    </TableRowLink>
                  </TableCell>
                  <TableCell className="text-foreground">{payment.guestName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    BND {formatCents(payment.amount ?? 0)}
                  </TableCell>
                  <TableCell>
                    {/* Who took the money, wearing their identity colour — a
                        24px face, the in-row avatar size, so a name staff
                        already know is findable before it is read. A collector
                        no longer on the roster keeps the plain text. */}
                    <CollectedByCell
                      id={payment.collectedBy}
                      name={payment.collectedBy ? names.get(payment.collectedBy) : undefined}
                    />
                  </TableCell>
                  <TableCell>
                    <BookingStatusBadge status={payment.bookingStatus} />
                  </TableCell>
                  {/* The affordance, not a control: the row is already the
                      link, so this says the row opens something — the
                      register's arrow, following the row's hover. */}
                  <TableCell className="w-0 pl-0 text-right">
                    <ChevronRight
                      aria-hidden
                      className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {payments.length > 0 ? <CashTotalFootnote total={total} /> : null}
      </section>
    </>
  )
}

function CollectedByCell({ id, name }: { id: string | null; name: string | undefined }) {
  if (!id) {
    return <>—</>
  }

  if (!name) {
    return <>Unknown</>
  }

  return (
    <span className="flex items-center gap-sm">
      <Avatar className="size-6">
        <AvatarFallback seed={id}>{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}

function CashTotalFootnote({ total }: { total: number }) {
  return (
    <div className="mt-md flex items-baseline justify-between gap-lg">
      <p className="text-caption text-muted-foreground">
        A sum of the rows above, not a reconciliation. Comparing recorded cash against banked cash
        is the daily cash-up, a separate screen.
      </p>
      <p className="text-body-md text-foreground tabular-nums">BND {formatCents(total)}</p>
    </div>
  )
}
