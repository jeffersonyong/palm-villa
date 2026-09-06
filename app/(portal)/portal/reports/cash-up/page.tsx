import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { CashUpStateBadge } from '@/components/portal/cash-up-state-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { SectionHint } from '@/components/portal/section-hint'
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
  TableRowLink,
} from '@/components/ui/table'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listCashBankings } from '@/lib/db/cash-banking'
import { listDepositsCollectedBetween } from '@/lib/db/deposits'
import { listPayments } from '@/lib/db/payments'
import {
  bruneiWindowBounds,
  formatStayDate,
  formatStayRange,
  todayInBrunei,
  type StayDate,
} from '@/lib/domain/dates'
import { formatCents, type Cents } from '@/lib/domain/money'
import { cashUpDays, cashUpTotals, clampWindowToToday } from '@/lib/domain/reports/cash-up'

import { readReportWindow } from '../report-window'
import { ReportsFilters } from '../reports-filters'
import { RecordBanking } from './record-banking'

export const metadata: Metadata = {
  title: 'Daily cash-up',
}

export const dynamic = 'force-dynamic'

/**
 * The daily cash-up (capability E4, prd.md §10.5).
 *
 * "A daily cash-up view comparing recorded cash against banked amounts." One
 * row per business day, and the difference stated rather than resolved: a
 * variance is a question for the person who was at the desk, and the product's
 * job is to put the question in front of Finance rather than to explain it
 * away.
 *
 * The window is clamped to today, because a day that has not happened has no
 * takings to reconcile — and because a column of future rows would push the
 * day somebody came here for off the screen.
 */

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function CashUpPage({ searchParams }: PageProps) {
  const params = await searchParams
  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'report.view')) {
    return (
      <>
        <PageHeader title="Daily cash-up" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Reconciling the day’s cash needs the "View reports" permission, which sits with Finance. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const today = todayInBrunei()
  const { window: requested, isExplicit } = readReportWindow(params.from, params.to, today)
  const window = clampWindowToToday(requested, today)

  if (!window) {
    return (
      <>
        <CashUpHeader window={requested} />
        <div className="mt-xl">
          <ReportsFilters
            route="/portal/reports/cash-up"
            from={requested.from}
            to={requested.to}
            isExplicit={isExplicit}
          />
        </div>
        <EmptyState
          className="mt-xl"
          title="That period has not happened yet"
          description="A day can only be cashed up once the desk has taken the money. Pick a period ending today or earlier."
          action={
            <Button asChild variant="tertiary">
              <Link href="/portal/reports/cash-up">Clear filters</Link>
            </Button>
          }
        />
      </>
    )
  }

  const bounds = bruneiWindowBounds(window)

  const [payments, deposits, bankings] = await Promise.all([
    listPayments({
      methods: ['cash'],
      collectedFrom: bounds.start,
      collectedBefore: bounds.end,
      newestFirst: true,
    }),
    listDepositsCollectedBetween(bounds, 'cash'),
    listCashBankings(window),
  ])

  const days = cashUpDays(window, {
    payments: payments.flatMap((payment) =>
      payment.collectedAt
        ? [{ collectedAt: payment.collectedAt, amount: payment.amount ?? 0 }]
        : [],
    ),
    deposits: deposits.map((deposit) => ({
      collectedAt: deposit.collectedAt,
      amount: deposit.amount,
    })),
    bankings: bankings.map((banking) => ({
      businessDate: banking.businessDate,
      amount: banking.amount,
    })),
  })

  const totals = cashUpTotals(days)
  const mayBank = hasPermission(actor.permissions, 'payment.verify')

  return (
    <>
      <CashUpHeader window={window} />

      <div className="mt-xl grid grid-cols-2 gap-md lg:grid-cols-4">
        <Card className="h-full">
          <Stat
            size="sm"
            label="Cash recorded"
            value={`BND ${formatCents(totals.recorded)}`}
            hint="Cash payments against bookings"
          />
        </Card>

        <Card className="h-full">
          <Stat
            size="sm"
            label="Banked"
            value={`BND ${formatCents(totals.banked)}`}
            hint={`${bankings.length} ${bankings.length === 1 ? 'banking' : 'bankings'} in the period`}
          />
        </Card>

        <Card className="h-full">
          <Stat
            size="sm"
            label="Variance"
            value={<Variance amount={totals.variance} />}
            hint="Banked, less what was recorded"
          />
        </Card>

        <Card className="h-full">
          <Stat
            size="sm"
            label="Deposits taken"
            value={`BND ${formatCents(totals.depositCash)}`}
            hint="In the drawer, not in the total"
          />
        </Card>
      </div>

      <div className="mt-xl flex flex-wrap items-center gap-md">
        <ReportsFilters
          route="/portal/reports/cash-up"
          from={window.from}
          to={window.to}
          isExplicit={isExplicit}
        />

        {mayBank ? (
          <div className="ml-auto">
            {/* Defaulted to the last day of the period rather than to today:
                the window is already clamped to today, so on the ordinary view
                the two are the same day — and on a past period it opens on a
                day the reader can actually see, instead of filing cash against
                a row that is not on the screen. */}
            <RecordBanking defaultDate={window.to} today={today} />
          </div>
        ) : null}
      </div>

      <section aria-labelledby="cash-up-days" className="mt-2xl">
        <h2 id="cash-up-days" className="flex items-center gap-sm text-display-xs text-foreground">
          Day by day
          <SectionHint label="How a day is counted">
            Cash recorded is the cash payments taken against bookings that day, in Brunei time.
            Security deposits are counted separately: the notes are in the same drawer, but a
            deposit is money held rather than earned. Banked is what was filed against that day,
            whenever the trip to the bank actually happened.
          </SectionHint>
        </h2>

        <Table className="mt-md">
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Day</TableHead>
              <TableHead className="text-right">Cash recorded</TableHead>
              <TableHead className="text-right">Deposits taken</TableHead>
              <TableHead className="text-right">Banked</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => (
              <TableRow key={day.date} interactive className="group">
                <TableCell className="text-foreground tabular-nums">
                  <TableRowLink href={`/portal/reports/cash-up/${day.date}`}>
                    {formatStayDate(day.date)}
                  </TableRowLink>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  BND {formatCents(day.recorded)}
                  {day.paymentCount > 0 ? (
                    <span className="ml-sm text-caption text-muted-foreground">
                      {day.paymentCount}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  BND {formatCents(day.depositCash)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  BND {formatCents(day.banked)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Variance amount={day.variance} />
                </TableCell>
                <TableCell>
                  <CashUpStateBadge state={day.state} />
                </TableCell>
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

        <p className="mt-md text-caption text-muted-foreground">
          Every day in the period is listed, including the quiet ones: a cash-up is read to confirm
          that nothing was missed, and a day left out cannot be confirmed.
        </p>
      </section>
    </>
  )
}

function CashUpHeader({ window }: { window: { from: StayDate; to: StayDate } }) {
  return (
    <PageHeader
      title="Daily cash-up"
      description={`Cash recorded against cash banked, ${formatStayRange(window.from, window.to)}.`}
    />
  )
}

/**
 * A variance, signed.
 *
 * The sign reads the way a bank statement does — negative means less reached
 * the bank than the desk took — and a day that agrees shows a plain zero
 * rather than a dash, because zero is the answer rather than the absence of
 * one. The figure itself stays ink: the state badge beside it carries the
 * colour, and a column of figures should read as a column.
 */
function Variance({ amount }: { amount: Cents }) {
  return (
    <span className="tabular-nums">
      {amount > 0 ? '+' : ''}
      BND {formatCents(amount)}
    </span>
  )
}
