import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Landmark } from 'lucide-react'

import { CashUpStateBadge } from '@/components/portal/cash-up-state-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Stat } from '@/components/portal/stat'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/components/ui/avatar-identity'
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
import { cashOnHandBefore, listCashBankings } from '@/lib/db/cash-banking'
import { listDepositsCollectedBetween } from '@/lib/db/deposits'
import { listPayments } from '@/lib/db/payments'
import { listStaff } from '@/lib/db/staff'
import {
  addDays,
  bruneiDayBounds,
  formatStayRange,
  formatTimestamp,
  isStayDate,
  todayInBrunei,
  type StayDate,
} from '@/lib/domain/dates'
import { formatCents, sumCents, type Cents } from '@/lib/domain/money'
import { cashUpStateOf } from '@/lib/domain/reports/cash-up'

import { RecordBanking } from '../record-banking'

export const metadata: Metadata = {
  title: 'Cash-up',
}

export const dynamic = 'force-dynamic'

/**
 * One day's cash (capability E4).
 *
 * The rows behind a line on the cash-up: every cash payment taken that day,
 * what was banked against it, and the difference. This is the screen somebody
 * opens when a day does not agree, so it names who took each payment and who
 * banked each amount — the two facts prd.md §10.5 asks be recorded, put beside
 * each other.
 *
 * Both figures are read from a Brunei day's own instants (`bruneiDayBounds`),
 * not from a date compared against a `timestamptz`: the second is cast at the
 * session's midnight, which is 08:00 here, and would file the first eight
 * hours of every day under the day before.
 */

interface PageProps {
  params: Promise<{ date: string }>
}

export default async function CashUpDayPage({ params }: PageProps) {
  const { date } = await params

  if (!isStayDate(date)) {
    notFound()
  }

  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'report.view')) {
    return (
      <>
        <PageHeader title="Cash-up" />
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

  // A day that has not happened has no takings to reconcile, which is the same
  // rule `record_cash_banking()` enforces at the other end.
  if (date > today) {
    return (
      <>
        <PageHeader title="Cash-up" meta={formatStayRange(date, date)} />
        <EmptyState
          className="mt-xl"
          title="That day has not happened yet"
          description="A day can only be cashed up once the desk has taken the money."
          action={
            <Button asChild variant="tertiary">
              <Link href="/portal/reports/cash-up">Back to the cash-up</Link>
            </Button>
          }
        />
      </>
    )
  }

  const bounds = bruneiDayBounds(date)
  const window = { from: date, to: date }

  const [payments, deposits, bankings, staff, opening] = await Promise.all([
    listPayments({
      methods: ['cash'],
      collectedFrom: bounds.start,
      collectedBefore: bounds.end,
      newestFirst: true,
    }),
    listDepositsCollectedBetween(bounds, 'cash'),
    listCashBankings(window),
    listStaff(),
    cashOnHandBefore(date),
  ])

  const names = new Map(staff.map((account) => [account.id, account.displayName]))

  const recorded = sumCents(payments.map((payment) => payment.amount ?? 0))
  const banked = sumCents(bankings.map((banking) => banking.amount))
  const depositCash = sumCents(deposits.map((deposit) => deposit.amount))
  // The running balance this day closes on: what was already unbanked before
  // it, plus what it took, less what went to the bank. The figure somebody can
  // check by opening the safe.
  const closing = opening + recorded - banked
  const state = cashUpStateOf(closing)

  const mayBank = hasPermission(actor.permissions, 'payment.verify')

  return (
    <>
      {/* The way back out, the construction the deposit and unit record screens
          already use: a `ghost` link above the title rather than beside it,
          because it is navigation and not one of this record's actions — and
          the action slot here is spoken for twice over. The day stepper moves
          *between* days and cannot leave them, so without this the only way
          back to the list was the browser's own button. Named for the screen it
          returns to rather than "all days", which does not say what of. */}
      <Button asChild variant="ghost" className="-ml-sm">
        <Link href="/portal/reports/cash-up">
          <ArrowLeft aria-hidden />
          Daily cash-up
        </Link>
      </Button>

      <PageHeader
        className="mt-md"
        title="Cash-up"
        meta={<CashUpStateBadge state={state} />}
        actions={
          <>
            <DayStepper date={date} today={today} />
            {mayBank ? <RecordBanking defaultDate={date} today={today} viewing={date} /> : null}
          </>
        }
      />

      <div className="mt-lg grid grid-cols-2 gap-md lg:grid-cols-3">
        <Card className="h-full">
          <Stat
            size="sm"
            label="Cash recorded"
            value={`BND ${formatCents(recorded)}`}
            hint={`${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}`}
          />
        </Card>
        <Card className="h-full">
          <Stat
            size="sm"
            label="Banked"
            value={`BND ${formatCents(banked)}`}
            hint={`${bankings.length} ${bankings.length === 1 ? 'banking' : 'bankings'}`}
          />
        </Card>
        <Card className="h-full">
          <Stat
            size="sm"
            label="Cash on hand"
            value={<Balance amount={closing} />}
            hint={
              opening === 0
                ? 'Taken and not yet banked'
                : `Includes BND ${formatCents(opening)} brought forward`
            }
          />
        </Card>
      </div>

      <section aria-labelledby="day-payments" className="mt-2xl">
        <h2 id="day-payments" className="text-display-xs text-foreground">
          Cash payments
        </h2>

        {payments.length === 0 ? (
          <EmptyState
            className="mt-md"
            title="No cash taken this day"
            description="Cash recorded against a booking appears here, with who collected it."
          />
        ) : (
          <Table containerClassName="mt-md">
            <TableHeader>
              <TableHeaderRow>
                <TableHead>Collected</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Collected by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
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
                  <TableCell>
                    <PersonCell
                      id={payment.collectedBy}
                      name={payment.collectedBy ? names.get(payment.collectedBy) : undefined}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    BND {formatCents(payment.amount ?? 0)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted">
                <TableCell className="font-semibold text-foreground">Recorded</TableCell>
                <TableCell colSpan={3} />
                <TableCell className="text-right font-semibold text-foreground tabular-nums">
                  BND {formatCents(recorded)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}

        {deposits.length > 0 ? (
          <Card
            surface="inset"
            className="mt-md flex flex-wrap items-baseline justify-between gap-md"
          >
            <p className="text-body-sm text-copy">
              <span className="mr-sm micro-label text-muted-foreground">Also in the drawer</span>
              {deposits.length} cash security {deposits.length === 1 ? 'deposit' : 'deposits'} taken
              this day, held as a liability rather than as takings —{' '}
              <Link href="/portal/deposits" className="underline underline-offset-2">
                the deposits ledger
              </Link>{' '}
              is where they are answered for.
            </p>
            <p className="text-body-md text-foreground tabular-nums">
              BND {formatCents(depositCash)}
            </p>
          </Card>
        ) : null}
      </section>

      <section aria-labelledby="day-bankings" className="mt-2xl">
        <h2 id="day-bankings" className="text-display-xs text-foreground">
          Banked
        </h2>

        {bankings.length === 0 ? (
          <EmptyState
            className="mt-md"
            title="Nothing banked against this day yet"
            description="Record a banking when the cash goes in. It is filed against the day the money was taken, whenever the trip happens."
            action={
              mayBank ? (
                <RecordBanking defaultDate={date} today={today} viewing={date} />
              ) : undefined
            }
          />
        ) : (
          <Table containerClassName="mt-md">
            <TableHeader>
              <TableHeaderRow>
                <TableHead>Recorded</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableHeaderRow>
            </TableHeader>
            <TableBody>
              {bankings.map((banking) => (
                <TableRow key={banking.id}>
                  <TableCell className="tabular-nums">
                    {formatTimestamp(banking.bankedAt)}
                  </TableCell>
                  <TableCell>
                    <PersonCell
                      id={banking.bankedBy}
                      name={banking.bankedBy ? names.get(banking.bankedBy) : undefined}
                    />
                  </TableCell>
                  <TableCell className="max-w-[36ch]">{banking.note ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    BND {formatCents(banking.amount)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted">
                <TableCell className="font-semibold text-foreground">
                  <span className="flex items-center gap-sm">
                    <Landmark aria-hidden className="size-4 text-muted-foreground" />
                    Banked
                  </span>
                </TableCell>
                <TableCell colSpan={2} />
                <TableCell className="text-right font-semibold text-foreground tabular-nums">
                  BND {formatCents(banked)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}

        <p className="mt-md text-caption text-muted-foreground">
          A banking cannot be edited. If one was recorded wrongly, add a second entry — both stay on
          the day, and the balance moves.
        </p>
      </section>
    </>
  )
}

function PersonCell({ id, name }: { id: string | null; name: string | undefined }) {
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

/**
 * Stepping between days, with the day itself in the middle.
 *
 * The two arrows used to sit on their own with the date up beside the title,
 * which made paging feel like it moved something invisible: you pressed
 * "Previous day" and then looked somewhere else to find out where you had
 * landed. Putting the date *between* the controls makes the three one object —
 * the thing being changed, with the way to change it on either side — so the
 * answer is where the action was.
 *
 * **Next day is disabled rather than hidden on today.** Hiding it would shift
 * the date under the pointer the moment somebody reached the most recent day,
 * which is the day they are on most of the time; a control that moves as you
 * approach it is worse than one that is plainly unavailable. It is a `span`
 * when disabled rather than a link, because there is no address to go to — a
 * disabled anchor is still followable by keyboard.
 *
 * The state badge stays up on the title line: it describes the whole day, not
 * the navigation, and this control has enough in it already.
 */
function DayStepper({ date, today }: { date: StayDate; today: StayDate }) {
  const isToday = date >= today

  return (
    <div className="flex items-center gap-xs">
      <Button asChild variant="tertiary" aria-label="Previous day">
        <Link href={`/portal/reports/cash-up/${addDays(date, -1)}`}>
          <ChevronLeft aria-hidden />
          Previous day
        </Link>
      </Button>

      <span className="px-sm text-body-sm-strong text-foreground tabular-nums">
        {formatStayRange(date, date)}
      </span>

      {isToday ? (
        <Button variant="tertiary" disabled aria-label="Next day — today is the latest">
          Next day
          <ChevronRight aria-hidden />
        </Button>
      ) : (
        <Button asChild variant="tertiary" aria-label="Next day">
          <Link href={`/portal/reports/cash-up/${addDays(date, 1)}`}>
            Next day
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      )}
    </div>
  )
}

/**
 * A carried balance. A negative one is not "less than expected" but
 * over-banked — more has reached the bank than was ever recorded as taken —
 * so it keeps its minus sign rather than being dressed up as a shortfall.
 * Zero shows as a plain zero, because zero is the answer rather than the
 * absence of one.
 */
function Balance({ amount }: { amount: Cents }) {
  return <span className="tabular-nums">BND {formatCents(amount)}</span>
}
