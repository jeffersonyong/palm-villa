import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { CashUpStateBadge } from '@/components/portal/cash-up-state-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { SectionHint } from '@/components/portal/section-hint'
import { StatusLegend } from '@/components/portal/status-legend'
import { Stat } from '@/components/portal/stat'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
  TableRowLink,
} from '@/components/ui/table'
import { readChoices } from '@/components/portal/list-params'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { cashOnHandBefore, listCashBankings } from '@/lib/db/cash-banking'
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
import { clampPage, pageCountFor } from '@/components/ui/pagination-range'
import {
  CASH_UP_STATES,
  CASH_UP_STATE_DESCRIPTIONS,
  CASH_UP_STATE_LABELS,
  cashUpDays,
  cashUpTotals,
  clampWindowToToday,
  isCashUpState,
} from '@/lib/domain/reports/cash-up'

import { readPage, readPageSize } from '../page-size'
import { ReportsPagination } from '../reports-pagination'

import { readReportWindow } from '../report-window'
import { CashUpFilters } from './cash-up-filters'
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
  searchParams: Promise<{
    from?: string
    to?: string
    state?: string | string[]
    page?: string
    size?: string
  }>
}

/** The column's key. Every state, in the order the domain defines them. */
const STATE_LEGEND = CASH_UP_STATES.map((state) => ({
  badge: <CashUpStateBadge state={state} />,
  description: CASH_UP_STATE_DESCRIPTIONS[state],
}))

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
          <CashUpFilters
            from={requested.from}
            to={requested.to}
            isExplicit={isExplicit}
            states={[]}
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

  const [payments, deposits, bankings, opening] = await Promise.all([
    listPayments({
      methods: ['cash'],
      collectedFrom: bounds.start,
      collectedBefore: bounds.end,
      newestFirst: true,
    }),
    listDepositsCollectedBetween(bounds, 'cash'),
    listCashBankings(window),
    // What the safe was already holding when the period opened. Without it a
    // window starting on the 1st would report the balance light by whatever
    // the previous week left unbanked.
    cashOnHandBefore(window.from),
  ])

  const days = cashUpDays(
    window,
    {
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
    },
    opening,
  )

  const totals = cashUpTotals(days, opening)
  const mayBank = hasPermission(actor.permissions, 'payment.verify')

  // Filtered and paged after the balance is accumulated, never before: every
  // row already carries the figure it actually closed on, so a hidden day does
  // not change a shown one and page 2 continues the running total rather than
  // restarting it.
  const chosenStates = readChoices(params.state, CASH_UP_STATES, isCashUpState)
  const visibleDays =
    chosenStates.length > 0 ? days.filter((day) => chosenStates.includes(day.state)) : days

  const pageSize = readPageSize(params.size)
  const currentPage = clampPage(readPage(params.page), pageCountFor(visibleDays.length, pageSize))
  const pagedDays = visibleDays.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const pageParams = new URLSearchParams()

  if (isExplicit) {
    pageParams.set('from', window.from)
    pageParams.set('to', window.to)
  }

  for (const state of chosenStates) {
    pageParams.append('state', state)
  }

  // The file is the screen: same period, same states.
  const exportParams = new URLSearchParams({
    table: 'cash-up',
    from: window.from,
    to: window.to,
  })

  for (const state of chosenStates) {
    exportParams.append('state', state)
  }

  const exportHref = `/portal/reports/export?${exportParams.toString()}`

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
            label="Cash on hand"
            value={<Balance amount={totals.closing} />}
            hint={
              totals.opening === 0
                ? 'Taken and not yet banked'
                : `Includes BND ${formatCents(totals.opening)} brought forward`
            }
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

      {/* Heading, then the control line, then the rows — the order every list
          screen reads in (design.md §Components — stat tiles). The controls sat
          above the heading in the first cut, which put the period chip and the
          screen's one filled button in the gap between the strip and the
          section they belong to, reading as page furniture rather than as this
          table's controls. */}
      <section aria-labelledby="cash-up-days" className="mt-2xl">
        <h2 id="cash-up-days" className="flex items-center gap-sm text-display-xs text-foreground">
          Day by day
          <SectionHint label="How a day is counted">
            Cash payments taken against bookings that day. Cash on hand runs forward — everything
            taken, less everything banked — so one trip clears several days at once. Deposits are
            counted separately: held, not earned.
          </SectionHint>
        </h2>

        <div className="mt-lg flex flex-wrap items-center gap-md">
          <CashUpFilters
            from={window.from}
            to={window.to}
            isExplicit={isExplicit}
            states={chosenStates}
          />

          {/* The actions end of the control line. The export belongs here rather
              than on the title line above: it acts on exactly what the filters
              opposite it have selected, so it reads as the last control in the
              row that produced the rows — and a download that has to survive a
              middle-click stays an anchor, wearing the button. */}
          <div className="ml-auto flex items-center gap-sm">
            <Button asChild variant="tertiary">
              <a href={exportHref}>Download CSV</a>
            </Button>

            {/* Defaulted to the last day of the period rather than to today:
                the window is already clamped to today, so on the ordinary view
                the two are the same day — and on a past period it opens on a
                day the reader can actually see, instead of filing cash against
                a row that is not on the screen. */}
            {mayBank ? <RecordBanking defaultDate={window.to} today={today} /> : null}
          </div>
        </div>

        <Table
          containerClassName="mt-md"
          footer={
            <ReportsPagination
              route="/portal/reports/cash-up"
              page={currentPage}
              pageSize={pageSize}
              total={visibleDays.length}
              itemLabel="days"
              params={pageParams.toString()}
            />
          }
        >
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Day</TableHead>
              <TableHead className="text-right">Cash recorded</TableHead>
              <TableHead className="text-right">Deposits taken</TableHead>
              <TableHead className="text-right">Banked</TableHead>
              <TableHead className="text-right">Cash on hand</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-sm">
                  State
                  <StatusLegend label="What the states mean" items={STATE_LEGEND} />
                </span>
              </TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {pagedDays.length === 0 ? (
              <TableEmpty colSpan={7}>
                No days in this period are{' '}
                {chosenStates.map((s) => CASH_UP_STATE_LABELS[s]).join(' or ')}.
              </TableEmpty>
            ) : null}
            {pagedDays.map((day) => (
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
                <TableCell className="text-right text-foreground tabular-nums">
                  <Balance amount={day.balance} />
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
 * The balance carried forward at the end of a day.
 *
 * A plain zero rather than a dash when nothing is outstanding, because zero is
 * the answer rather than the absence of one, and a minus sign kept as a minus
 * sign: a negative balance is over-banked — more reached the bank than was
 * ever recorded — which is a different fact from a shortfall and should not be
 * dressed as one. The figure itself stays ink; the state badge beside it
 * carries the colour, and a column of figures should read as a column.
 */
function Balance({ amount }: { amount: Cents }) {
  return <span className="tabular-nums">BND {formatCents(amount)}</span>
}
