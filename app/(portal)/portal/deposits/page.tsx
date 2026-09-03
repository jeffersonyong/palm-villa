import type { Metadata } from 'next'
import Link from 'next/link'

import { DepositStageBadge } from '@/components/portal/deposit-stage-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Button } from '@/components/ui/button'
import { clampPage, pageCountFor } from '@/components/ui/pagination-range'
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
import {
  listHeldDeposits,
  listOwedDeposits,
  listReleasedDeposits,
  type Deposit,
} from '@/lib/db/deposits'
import { formatStayDates, formatTimestamp } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

import { DepositTiles } from './deposit-tiles'
import { DepositsPagination } from './deposits-pagination'
import {
  countByStage,
  filterHeld,
  isArchiveView,
  owedTotalOf,
  readLedgerView,
  sortForLedger,
  totalsOf,
  type LedgerView,
} from './ledger-view'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from './page-size'

export const metadata: Metadata = {
  title: 'Deposits',
}

/**
 * What we are holding, and what we owe back (capability E1).
 *
 * prd.md §20 makes this one of the six things the platform is measured on:
 * "'What deposits do we currently hold' is answerable in one screen." §2 names
 * the absence of an answer as one of the five problems it exists to solve. So
 * the screen leads with the liability as a figure, and everything else on it
 * narrows that figure.
 *
 * ── Two reads, and the split is the point ─────────────────────────────────
 *
 * **Held deposits are read whole** and narrowed here, the units board's
 * arrangement: the set is bounded by how many guests are in the building and by
 * how fast Finance works, it is a queue meant to be emptied, and reading it
 * whole keeps the stage derivation in lib/domain rather than as a second copy
 * in a SQL `where`. **Released deposits page in the database**, the bookings
 * register's arrangement, because the archive grows for the life of the
 * building and an unbounded query against it is the thing web/performance.md
 * names. Which of the two runs is `isArchiveView()`, and the tiles say which
 * you are looking at.
 *
 * ── The order is a work queue, not a register ─────────────────────────────
 *
 * Ready to release first, then awaiting inspection, then in house — and oldest
 * first inside each. The register leads with the newest record because that is
 * the one most likely to need correcting; this leads with the one that has been
 * waiting longest, because that is the one costing somebody their money back.
 */

interface PageProps {
  searchParams: Promise<{
    show?: string | string[]
    page?: string
    size?: string
  }>
}

/** The requested page, or 1. Being past the end is clamped after the read. */
function readPage(value: string | undefined): number {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

/** The requested rows-per-page, restricted to the sizes the footer offers. */
function readPageSize(value: string | undefined): number {
  const parsed = Number(value)

  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_PAGE_SIZE
}

export default async function DepositsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const actor = await getActor()

  // `booking.view` rather than a permission of its own. It is the one string
  // every working role holds, and all four of them need this screen for
  // something: Housekeeping records the inspection, Front Office raises a
  // charge, Finance approves the release, Admin does any of it. Each action is
  // gated individually — see the deposit's own screen — so what this opens is
  // the reading, and reading is what B10 already grants. The consequence is
  // that Security can read deposit figures, which is added to N11.
  if (!actor || !hasPermission(actor.permissions, 'booking.view')) {
    return (
      <>
        <PageHeader title="Deposits" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Seeing the deposits held needs the "View bookings" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const view = readLedgerView(params.show)
  const pageSize = readPageSize(params.size)

  // The tiles count the whole ledger, not the view — five figures that all
  // moved when you clicked one of them would stop being the answer to "what
  // are we holding this morning". Both are read whatever the view, because the
  // strip is the screen's headline and it is always on.
  const [held, owed] = await Promise.all([listHeldDeposits(), listOwedDeposits()])

  const heldTotals = totalsOf(held)
  const byStage = countByStage(held)

  const archive = isArchiveView(view)
    ? await listReleasedDeposits(
        { owedOnly: view === 'owed' },
        { page: readPage(params.page), pageSize },
      )
    : null

  const visible = archive ? archive.deposits : sortForLedger(filterHeld(held, view))
  const total = archive ? archive.total : visible.length

  // The held views page over the array in hand; the archive is already paged
  // by the database. Either way the page is clamped against the real total, so
  // a bookmarked `?page=4` that has outlived its rows lands on a page that
  // exists rather than an empty table under a footer claiming otherwise.
  const currentPage = clampPage(readPage(params.page), pageCountFor(total, pageSize))
  const rows = archive
    ? archive.deposits
    : visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <>
      <PageHeader
        title="Deposits"
        description="Every security deposit the property is holding, what stands against it, and what has been given back."
      />

      <DepositTiles
        held={heldTotals}
        byStage={byStage}
        owed={{ count: owed.length, amount: owedTotalOf(owed) }}
        current={view}
      />

      <section aria-label="Deposits" className="mt-md">
        {rows.length === 0 ? (
          <LedgerEmptyState view={view} />
        ) : (
          <Table
            footer={
              // Held views page a queue somebody is working to zero, so the
              // footer only earns its place once there is more than a page of
              // it. The archive always carries one — it is the only way through.
              archive || total > pageSize ? (
                <DepositsPagination
                  page={currentPage}
                  pageSize={pageSize}
                  total={total}
                  params={view === 'held' ? '' : `show=${view}`}
                />
              ) : undefined
            }
          >
            <TableHeader>
              <TableHeaderRow>
                <TableHead>Booking</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Stay</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Held</TableHead>
                <TableHead className="text-right">Charges</TableHead>
                <TableHead className="text-right">Outcome</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableHeaderRow>
            </TableHeader>
            <TableBody>
              {rows.map((deposit) => (
                <DepositRow key={deposit.id} deposit={deposit} />
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  )
}

function DepositRow({ deposit }: { deposit: Deposit }) {
  const { figures, release } = deposit

  return (
    <TableRow interactive className="group">
      <TableCell className="font-mono text-foreground tabular-nums">
        <TableRowLink href={`/portal/deposits/${encodeURIComponent(deposit.bookingReference)}`}>
          {deposit.bookingReference}
        </TableRowLink>
      </TableCell>

      <TableCell className="text-foreground">{deposit.guestName}</TableCell>

      <TableCell className="whitespace-nowrap tabular-nums">
        {deposit.stay?.unitRef ?? <Absent title="Occupies no unit" />}
      </TableCell>

      <TableCell className="whitespace-nowrap">
        {deposit.stay ? (
          formatStayDates(deposit.stay.range.start, deposit.stay.range.end)
        ) : (
          <Absent title="Occupies no unit" />
        )}
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <DepositStageBadge stage={deposit.stage} />
      </TableCell>

      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {formatCents(deposit.amount)}
      </TableCell>

      {/* A zero here would be a column of noughts down the whole table: most
          deposits have nothing against them, and a dash says that faster. */}
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {figures.chargesTotal > 0 ? (
          formatCents(figures.chargesTotal)
        ) : (
          <Absent title="Nothing charged against this deposit" />
        )}
      </TableCell>

      {/* What happened, or what is still to happen. One cell rather than two
          columns that are each empty half the time — a released deposit's
          answer is a figure, an open one's is the day it started waiting. */}
      <TableCell className="text-right whitespace-nowrap">
        {release ? (
          <>
            <span className="block text-foreground tabular-nums">
              {figures.owed > 0
                ? `Owed ${formatCents(figures.owed)}`
                : `Returned ${formatCents(figures.releasable)}`}
            </span>
            <span className="mt-xxs block text-caption text-muted-foreground">
              {deposit.settlement
                ? 'Settled'
                : figures.owed > 0
                  ? 'Not yet settled'
                  : formatTimestamp(release.at)}
            </span>
          </>
        ) : (
          <span className="text-caption text-muted-foreground">
            Held since {formatTimestamp(deposit.collectedAt)}
          </span>
        )}
      </TableCell>
    </TableRow>
  )
}

/**
 * Two questions, two answers.
 *
 * "Nothing here yet" names where records come from; "nothing matched" names
 * the view as the cause and offers the same escape every list screen offers,
 * worded identically so staff who learn it on one recognise it on the next.
 */
function LedgerEmptyState({ view }: { view: LedgerView }) {
  if (view === 'held') {
    return (
      <EmptyState
        title="No deposits held"
        description="A security deposit is recorded when a guest is checked in, and appears here until it has been released."
      />
    )
  }

  const descriptions: Record<Exclude<LedgerView, 'held'>, string> = {
    in_house: 'No guest with a deposit is in the building right now.',
    awaiting_inspection: 'Every unit whose guest has left has been inspected.',
    ready_for_release: 'Nothing is waiting on an approval.',
    released: 'No deposit has been released yet.',
    owed: 'No guest owes anything beyond their deposit.',
  }

  return (
    <EmptyState
      title="Nothing to show here"
      description={descriptions[view]}
      action={
        <Button asChild variant="tertiary">
          <Link href="/portal/deposits">Show everything held</Link>
        </Button>
      }
    />
  )
}

/**
 * A dash with a reason, never a blank cell.
 *
 * The register's rule: a blank reads as a rendering fault, and a bare dash is
 * only obvious to whoever wrote the schema.
 */
function Absent({ title }: { title: string }) {
  return (
    <span className="text-muted-foreground" title={title}>
      —
    </span>
  )
}
