import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/portal/empty-state'
import { overlapRangeOf } from '@/components/portal/list-params'
import { PageHeader } from '@/components/portal/page-header'
import { readChoices } from '@/components/portal/list-params'
import { clampPage, pageCountFor } from '@/components/ui/pagination-range'
import { SectionHint } from '@/components/portal/section-hint'
import { Stat } from '@/components/portal/stat'
import { StreamDot } from '@/components/portal/stream-dot'
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
import { OccupancyFilter } from './occupancy-filter'
import { readPage, readPageSize } from './page-size'
import { ReportsPagination } from './reports-pagination'

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
  searchParams: Promise<{
    from?: string
    to?: string
    type?: string | string[]
    page?: string
    size?: string
  }>
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

  // The by-unit table narrows to a type and pages; the tiles and the by-type
  // summary above it deliberately do not move with it, because they answer for
  // the building.
  const typeOptions = unitTypes.map((type) => ({ value: type.id, label: type.name }))
  const chosenTypes = readChoices(
    params.type,
    unitTypes.map((type) => type.id),
    (candidate): candidate is string => unitTypes.some((type) => type.id === candidate),
  )
  const visibleUnits =
    chosenTypes.length > 0
      ? byUnit.filter((row) => chosenTypes.includes(row.unit.unitTypeId))
      : byUnit

  const pageSize = readPageSize(params.size)
  const currentPage = clampPage(readPage(params.page), pageCountFor(visibleUnits.length, pageSize))
  const pagedUnits = visibleUnits.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // The export links carry exactly what is on screen: same period, same type
  // filter. Built from the same values the tables render from, so a download
  // cannot disagree with what somebody was looking at.
  const periodParams = new URLSearchParams({ from: window.from, to: window.to })
  const exportHref = (table: string, extra?: URLSearchParams) => {
    const query = new URLSearchParams(periodParams)
    query.set('table', table)
    for (const [key, value] of extra ?? []) {
      if (key === 'type') query.append(key, value)
    }
    return `/portal/reports/export?${query.toString()}`
  }

  const unitParams = new URLSearchParams()

  if (isExplicit) {
    unitParams.set('from', window.from)
    unitParams.set('to', window.to)
  }

  for (const type of chosenTypes) {
    unitParams.append('type', type)
  }

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
            label="Revenue received"
            value={`BND ${formatCents(revenue.total)}`}
            hint={`${revenue.count} ${revenue.count === 1 ? 'payment' : 'payments'} in the period`}
          />
        </Card>

        <Card className="h-full">
          <Stat
            size="sm"
            label="Occupancy"
            value={formatOccupancyRate(totals.rate)}
            hint={`${totals.occupiedNights} of ${totals.availableNights} unit-nights`}
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

      <section aria-labelledby="revenue-by-stream" className="mt-2xl">
        <SectionHeading
          id="revenue-by-stream"
          title="Revenue by stream"
          href={exportHref('revenue')}
        >
          Money received, not money quoted — verified payments only, dated by the day it arrived.
          Security deposits are excluded: they are held, not earned.
        </SectionHeading>

        <Table containerClassName="mt-md">
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

      <section aria-labelledby="occupancy-by-type" className="mt-2xl">
        <SectionHeading
          id="occupancy-by-type"
          title="Occupancy by type"
          href={exportHref('occupancy-by-type')}
        >
          Nights a unit was booked, stayed in or leased, against the nights it could have been.
          Units out of service still count as available.
        </SectionHeading>

        <Table containerClassName="mt-md">
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
            {byType.length === 0 ? (
              <TableEmpty colSpan={5}>
                No unit types are configured, so there is nothing to measure occupancy against.
              </TableEmpty>
            ) : null}
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

        {/* This section has controls of its own, so the export sits with them
            rather than on the title line: it carries the types selected here,
            and an export that answers to a control should stand next to it. */}
        <div className="mt-lg flex flex-wrap items-center gap-md">
          <OccupancyFilter
            options={typeOptions}
            selected={chosenTypes}
            period={isExplicit ? { from: window.from, to: window.to } : null}
          />

          <div className="ml-auto">
            <DownloadCsvButton href={exportHref('occupancy-by-unit', unitParams)} />
          </div>
        </div>

        <Table
          containerClassName="mt-md"
          footer={
            <ReportsPagination
              route="/portal/reports"
              page={currentPage}
              pageSize={pageSize}
              total={visibleUnits.length}
              itemLabel="units"
              params={unitParams.toString()}
            />
          }
        >
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Unit</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Nights occupied</TableHead>
              <TableHead className="text-right">Occupancy</TableHead>
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {pagedUnits.length === 0 ? (
              <TableEmpty colSpan={4}>
                {chosenTypes.length > 0
                  ? 'No units of that type. The 2-bedroom exists as a type and has no units configured yet.'
                  : 'No units are configured. The unit registry is where the building is described.'}
              </TableEmpty>
            ) : null}
            {pagedUnits.map((row) => (
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

/**
 * A section's title line: the heading, its hint, and the download opposite.
 *
 * The download is a `tertiary` button rather than a text action. It is the one
 * action that acts on the section as a whole (design.md §Components), and on a
 * screen where every other control is a bordered rectangle — the period chip,
 * the type filter — the export was the only one that wasn't, which read as a
 * footnote about the table rather than as something to click. Tertiary keeps
 * it quiet: no fill, and the screen's primary stays unspent.
 *
 * **The title line is where a section with no controls of its own puts it** —
 * the top-right corner of that table. A section that *has* a control row puts
 * it there instead, beside the other controls, because the export carries
 * whatever those controls have selected (see occupancy by unit).
 *
 * Still an anchor under the button, so it survives a middle-click, a
 * right-click and a browser that has not run the page's JavaScript yet, and
 * arrives with a filename on it.
 */
function SectionHeading({
  id,
  title,
  href,
  children,
}: {
  id: string
  title: string
  /** The export for this section, carrying the period and filters on screen. */
  href?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-md">
      <h2 id={id} className="flex items-center gap-sm text-display-xs text-foreground">
        {title}
        {children ? (
          <SectionHint label={`How ${title.toLowerCase()} is counted`}>{children}</SectionHint>
        ) : null}
      </h2>

      {href ? <DownloadCsvButton href={href} /> : null}
    </div>
  )
}

/**
 * The export, wherever a section chooses to put it. One component so the two
 * placements — a section's title line, a section's control row — cannot drift
 * into two different-looking buttons on one screen.
 */
function DownloadCsvButton({ href }: { href: string }) {
  return (
    <Button asChild variant="tertiary" className="shrink-0">
      <a href={href}>Download CSV</a>
    </Button>
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
 *
 * Set in 600 throughout, label and figures alike. The tone alone was doing the
 * work of saying "this line is different in kind", and a reader scanning a
 * column of numbers reads weight before they read a background.
 *
 * **`bg-muted`, not `bg-canvas-soft`.** The container tone is a *role*, and the
 * token that carries it through both themes is `--muted`; `--color-canvas-soft`
 * is the raw palette entry behind its light half and is a fixed `#f7f7f7`
 * whatever the theme. Reaching for the palette value put a white bar with white
 * text on it in dark mode — the same fill the table header uses is `bg-muted`,
 * and the totals row is the same role at the other end of the table.
 */
function TotalRow({ label, cells }: { label: string; cells: readonly (string | number)[] }) {
  return (
    <TableRow className="bg-muted">
      <TableRowHead className="font-semibold text-foreground">{label}</TableRowHead>
      {cells.map((cell, index) => (
        <TableCell key={index} className="text-right font-semibold text-foreground tabular-nums">
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
