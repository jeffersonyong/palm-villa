import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/portal/empty-state'
import { overlapRangeOf } from '@/components/portal/list-params'
import { PageHeader } from '@/components/portal/page-header'
import { SectionHint } from '@/components/portal/section-hint'
import { Stat } from '@/components/portal/stat'
import { StreamDot } from '@/components/portal/stream-dot'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
  TableRowHead,
  TableRowLink,
} from '@/components/ui/table'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listHeldDeposits, listOwedDeposits } from '@/lib/db/deposits'
import { getUnitTypes, getUnits } from '@/lib/db/inventory'
import { listOccupanciesOverlapping, listRevenuePayments } from '@/lib/db/reports'
import { formatStayRange } from '@/lib/domain/dates'
import { formatCents, type Cents } from '@/lib/domain/money'
import {
  formatOccupancyRate,
  occupancyByType,
  occupancyByUnit,
  occupancyTotals,
} from '@/lib/domain/reports/occupancy'
import { revenueByStream, revenueInWindow } from '@/lib/domain/reports/revenue'
import { BOOKING_STREAM_LABELS } from '@/lib/domain/stream'

import { owedTotalOf, totalsOf } from '../deposits/ledger-view'
import { readReportWindow } from './report-window'
import { ReportsFilters } from './reports-filters'

export const metadata: Metadata = {
  title: 'Reports',
}

// Every figure here is anchored to today by default, so nothing about this
// screen may be cached between requests.
export const dynamic = 'force-dynamic'

/**
 * The reports screen (capability E5, prd.md §14).
 *
 * prd.md §14 is deliberately short — six figures, no dashboard — and this
 * screen is that list and nothing more. Four of the six are here; the daily
 * cash-up (E4) is its own screen next door because it is worked daily rather
 * than read occasionally, and day-pass volume against capacity has no data to
 * be about yet (see the panel at the foot).
 *
 * Two of the six are **as-of-now** figures rather than period ones: what is
 * held in deposits, and what guests owe. They are stated on the strip and lead
 * to the ledger that owns them, rather than reproduced as a table here — the
 * ledger is E1's screen, and a second copy of it would be a second thing to
 * keep true.
 *
 * The arithmetic is in lib/domain/reports, which is where the definitions the
 * client will argue with can be read and tested. This file arranges it.
 */

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const actor = await getActor()

  // `report.view` is held by Admin and Finance (prd.md §4, supabase/seed.sql),
  // and this screen is the first thing in the product to check it.
  if (!actor || !hasPermission(actor.permissions, 'report.view')) {
    return (
      <>
        <PageHeader title="Reports" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Reading the reports needs the "View reports" permission, which sits with Finance. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const { window, isExplicit } = readReportWindow(params.from, params.to)
  const range = overlapRangeOf(window)

  const [occupancies, units, unitTypes, payments, held, owed] = await Promise.all([
    listOccupanciesOverlapping(range),
    getUnits(),
    getUnitTypes(),
    listRevenuePayments(window),
    listHeldDeposits(),
    listOwedDeposits(),
  ])

  const byUnit = occupancyByUnit(units, occupancies, range)
  const byType = occupancyByType(unitTypes, byUnit, range)
  const totals = occupancyTotals(byType)

  const revenue = revenueByStream(revenueInWindow(payments, window))
  const heldTotals = totalsOf(held)
  const owedTotal = owedTotalOf(owed)

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Occupancy and revenue for ${formatStayRange(window.from, window.to)}, and what is outstanding right now.`}
      />

      <div className="mt-xl grid grid-cols-2 gap-md lg:grid-cols-4">
        <Card className="h-full">
          <Stat
            size="sm"
            label="Occupancy"
            value={formatOccupancyRate(totals.rate)}
            hint={`${totals.occupiedNights} of ${totals.availableNights} unit-nights`}
          />
        </Card>

        <Card className="h-full">
          <Stat
            size="sm"
            label="Revenue received"
            value={`BND ${formatCents(revenue.total)}`}
            hint={`${revenue.count} ${revenue.count === 1 ? 'payment' : 'payments'} in the period`}
          />
        </Card>

        {/* The two as-of-now figures are the way into the ledger that owns
            them, the construction the deposits tiles use — a figure somebody
            reads and then wants the rows behind. */}
        <LedgerTile
          href="/portal/deposits"
          label="Deposits held"
          value={`BND ${formatCents(heldTotals.amount)}`}
          hint={`${heldTotals.count} ${heldTotals.count === 1 ? 'deposit' : 'deposits'}, as of now`}
        />

        <LedgerTile
          href="/portal/deposits?show=owed"
          label="Owed by guests"
          value={`BND ${formatCents(owedTotal)}`}
          hint={`${owed.length} ${owed.length === 1 ? 'guest' : 'guests'}, as of now`}
        />
      </div>

      <div className="mt-xl">
        <ReportsFilters
          route="/portal/reports"
          from={window.from}
          to={window.to}
          isExplicit={isExplicit}
        />
      </div>

      <section aria-labelledby="occupancy-by-type" className="mt-2xl">
        <SectionHeading id="occupancy-by-type" title="Occupancy by type">
          Nights a unit was confirmed, occupied, completed or leased, against the nights it could
          have been. Nights are half-open, so a guest arriving on the 12th and leaving on the 14th
          occupies two. A unit out of service still counts in what was available — a building that
          broke down should not read as fuller than one that did not.
        </SectionHeading>

        <Table className="mt-md">
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Nights occupied</TableHead>
              <TableHead className="text-right">Nights available</TableHead>
              <TableHead className="text-right">Occupancy</TableHead>
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {byType.map((type) => (
              <TableRow key={type.typeId}>
                <TableRowHead>{type.name}</TableRowHead>
                <TableCell className="text-right tabular-nums">{type.unitCount}</TableCell>
                <TableCell className="text-right tabular-nums">{type.occupiedNights}</TableCell>
                <TableCell className="text-right tabular-nums">{type.availableNights}</TableCell>
                <TableCell className="text-right text-foreground tabular-nums">
                  {formatOccupancyRate(type.rate)}
                </TableCell>
              </TableRow>
            ))}
            <TotalRow
              label="The building"
              cells={[
                units.length,
                totals.occupiedNights,
                totals.availableNights,
                formatOccupancyRate(totals.rate),
              ]}
            />
          </TableBody>
        </Table>
      </section>

      <section aria-labelledby="occupancy-by-unit" className="mt-2xl">
        <SectionHeading id="occupancy-by-unit" title="Occupancy by unit" />

        <Table className="mt-md">
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Unit</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Nights occupied</TableHead>
              <TableHead className="text-right">Occupancy</TableHead>
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {byUnit.map((row) => (
              <TableRow key={row.unit.id} interactive className="group">
                <TableCell className="font-mono text-foreground tabular-nums">
                  <TableRowLink href={`/portal/units/${row.unit.ref}`}>{row.unit.ref}</TableRowLink>
                </TableCell>
                <TableCell>{row.unit.unitTypeName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.occupiedNights} of {row.availableNights}
                </TableCell>
                <TableCell className="text-right text-foreground tabular-nums">
                  {formatOccupancyRate(row.rate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-labelledby="revenue-by-stream" className="mt-2xl">
        <SectionHeading id="revenue-by-stream" title="Revenue by stream">
          Money actually received in the period, not what was quoted. Cash counts on the day it was
          collected; a transfer on the date read off the bank, or failing that the day it was
          verified. A payment nobody has confirmed is a promise and is not counted. Security
          deposits are excluded — they are held, not earned.
        </SectionHeading>

        <Table className="mt-md">
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">Bank transfer</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Payments</TableHead>
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {revenue.byStream.map((stream) => (
              <TableRow key={stream.stream}>
                <TableRowHead>
                  <span className="flex items-center gap-sm">
                    <StreamDot stream={stream.stream} />
                    {BOOKING_STREAM_LABELS[stream.stream]}
                  </span>
                </TableRowHead>
                <Money amount={stream.byMethod.cash} />
                <Money amount={stream.byMethod.bank_transfer} />
                <TableCell className="text-right text-foreground tabular-nums">
                  BND {formatCents(stream.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{stream.count}</TableCell>
              </TableRow>
            ))}
            <TotalRow
              label="All streams"
              cells={[
                `BND ${formatCents(revenue.byMethod.cash)}`,
                `BND ${formatCents(revenue.byMethod.bank_transfer)}`,
                `BND ${formatCents(revenue.total)}`,
                revenue.count,
              ]}
            />
          </TableBody>
        </Table>

        <p className="mt-md text-caption text-muted-foreground">
          A tenancy records no money until the tenancy module lands: a long lease is an occupancy
          with no booking and no payments, so it appears in occupancy above and at zero here.
        </p>
      </section>

      <section aria-labelledby="day-passes" className="mt-2xl">
        <SectionHeading id="day-passes" title="Day passes against capacity" />

        <EmptyState
          className="mt-md"
          title="Not available yet"
          description={
            'A day pass carries no date of its own yet, and no facility capacity has been configured — so neither the volume nor the number to compare it against exists. Both arrive with the day-pass booking flow.'
          }
        />
      </section>
    </>
  )
}

function SectionHeading({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <h2 id={id} className="flex items-center gap-sm text-display-xs text-foreground">
      {title}
      {children ? (
        <SectionHint label={`How ${title.toLowerCase()} is counted`}>{children}</SectionHint>
      ) : null}
    </h2>
  )
}

function Money({ amount }: { amount: Cents }) {
  return <TableCell className="text-right tabular-nums">BND {formatCents(amount)}</TableCell>
}

/**
 * The table's own last line, drawn as a row rather than as the footer strip a
 * paginated table uses: it is a value in the same columns as the rows above
 * it, so it belongs in the body, with the container tone marking it as the sum
 * and the label saying so in words.
 */
function TotalRow({ label, cells }: { label: string; cells: readonly (string | number)[] }) {
  return (
    <TableRow className="bg-canvas-soft">
      <TableRowHead className="text-foreground">{label}</TableRowHead>
      {cells.map((cell, index) => (
        <TableCell key={index} className="text-right text-foreground tabular-nums">
          {cell}
        </TableCell>
      ))}
    </TableRow>
  )
}

function LedgerTile({
  href,
  label,
  value,
  hint,
}: {
  href: '/portal/deposits' | '/portal/deposits?show=owed'
  label: string
  value: string
  hint: string
}) {
  return (
    <Link
      href={href}
      className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full card-interactive hover:border-foreground/20">
        <Stat size="sm" label={label} value={value} hint={hint} />
      </Card>
    </Link>
  )
}
