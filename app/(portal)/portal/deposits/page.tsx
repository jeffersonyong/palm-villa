import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { DepositStageBadge } from '@/components/portal/deposit-stage-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { overlapRangeOf, readSearch, readStayWindow } from '@/components/portal/list-params'
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
import { DepositsFilters } from './deposits-filters'
import { DepositsPagination } from './deposits-pagination'
import {
  countByStage,
  filterHeld,
  isArchiveView,
  owedTotalOf,
  readHeldStages,
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
  /** `stage` repeats, one param per chosen value. */
  searchParams: Promise<{
    show?: string | string[]
    stage?: string | string[]
    from?: string
    to?: string
    q?: string | string[]
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

  // Anything unusable — a hand-edited URL, half a date pair, a reversed range —
  // falls back to no filter rather than erroring, like every other param in
  // the portal.
  const view = readLedgerView(params.show)
  const window = readStayWindow(params.from, params.to)
  const search = readSearch(params.q)
  const pageSize = readPageSize(params.size)
  const requestedPage = readPage(params.page)

  // A stage narrows what is held and nothing else, so in an archive view it
  // is dropped here rather than read: the chips may only ever show a filter
  // the server actually applied, and `?show=released&stage=in_house` is a URL
  // nothing on this screen builds but a hand can.
  const stages = isArchiveView(view) ? [] : readHeldStages(params.stage)

  // The tiles count the whole ledger, not the view — five figures that all
  // moved when you clicked one of them would stop being the answer to "what
  // are we holding this morning". Both are read whatever the view, because the
  // strip is the screen's headline and it is always on.
  const [held, owed] = await Promise.all([listHeldDeposits(), listOwedDeposits()])

  const heldTotals = totalsOf(held)
  const byStage = countByStage(held)

  // The stay window narrows either set — in the database for the archive, here
  // for what is held, both on the same half-open overlap.
  const overlaps = window ? overlapRangeOf(window) : undefined
  const archiveFilter = { owedOnly: view === 'owed', overlaps, search: search ?? undefined }
  const firstAttempt = isArchiveView(view)
    ? await listReleasedDeposits(archiveFilter, { page: requestedPage, pageSize })
    : null

  const visible = firstAttempt
    ? firstAttempt.deposits
    : sortForLedger(filterHeld(held, { stages, window, search }))
  const total = firstAttempt ? firstAttempt.total : visible.length

  // The held view pages over the array in hand; the archive is paged by the
  // database. Either way the page is clamped against the real total, so a
  // bookmarked `?page=4` that has outlived its rows lands on a page that
  // exists rather than an empty table under a footer claiming otherwise. For
  // the archive that means a second read — the register's arrangement — and
  // only when the page was genuinely out of range.
  const currentPage = clampPage(requestedPage, pageCountFor(total, pageSize))
  const archive =
    firstAttempt && currentPage !== requestedPage
      ? await listReleasedDeposits(archiveFilter, { page: currentPage, pageSize })
      : firstAttempt
  const rows = archive
    ? archive.deposits
    : visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const isFiltered = stages.length > 0 || window !== null || search !== null

  // Carried through every tile: the stay window, which narrows whichever set a
  // tile opens. The tiles *set* `stage` and `show`, so this holds neither.
  // Nor the page: narrowing a list drops you back to page 1, the only page
  // guaranteed to exist afterwards.
  const tileParams = new URLSearchParams()

  if (window) {
    tileParams.set('from', window.from)
    tileParams.set('to', window.to)
  }

  if (search) {
    tileParams.set('q', search)
  }

  // The footer moves *within* the current view, so it carries everything.
  const pageParams = new URLSearchParams(tileParams)

  if (view !== 'held') {
    pageParams.set('show', view)
  }

  for (const stage of stages) {
    pageParams.append('stage', stage)
  }

  return (
    <>
      <PageHeader
        title="Deposits"
        description="Every security deposit the property is holding, what stands against it, and what has been given back."
      />

      {/* The strip first, straight under the title: it is the screen's
          headline — what we are holding — and every list screen now reads
          the same way down the page: the figures, then the chips, then the
          rows (design.md §Components — stat tiles). */}
      <DepositTiles
        held={heldTotals}
        byStage={byStage}
        owed={{ count: owed.length, amount: owedTotalOf(owed) }}
        selectedStages={stages}
        view={view}
        otherParams={tileParams}
      />

      {/* The control line, directly above the table it narrows. Chips only:
          a ledger has nothing to create — a deposit is recorded when a guest
          is checked in — and nowhere else to go, so the slot on the right
          that other list screens fill stays empty rather than holding
          something to fill it. */}
      <div className="mt-md flex flex-wrap items-center gap-md">
        <DepositsFilters
          stages={stages}
          from={window?.from}
          to={window?.to}
          view={view}
          search={search ?? ''}
        />
      </div>

      <section aria-label="Deposits" className="mt-md">
        {rows.length === 0 ? (
          <LedgerEmptyState view={view} isFiltered={isFiltered} />
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
                  params={pageParams.toString()}
                />
              ) : undefined
            }
          >
            <TableHeader>
              <TableHeaderRow>
                <TableHead>Booking</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Stay date</TableHead>
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

      {/* The affordance, not a control: the row is already the link, so this
          says the row opens something — the register's arrow, following the
          row's hover. The header has named this column all along. */}
      <TableCell className="w-0 pl-0 text-right">
        <ChevronRight
          aria-hidden
          className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
        />
      </TableCell>
    </TableRow>
  )
}

/**
 * Two questions, two answers.
 *
 * "Nothing here yet" names where records come from; "nothing matched" names
 * the filters as the cause and offers the same escape every list screen
 * offers, worded identically so staff who learn it on one recognise it on the
 * next. An empty archive view is neither: nothing has been released yet, and
 * the way out is back to what is held.
 */
function LedgerEmptyState({ view, isFiltered }: { view: LedgerView; isFiltered: boolean }) {
  if (isFiltered) {
    return (
      <EmptyState
        title="No deposits match these filters"
        description="Try a wider date range, or clear the filters to see everything."
        action={
          <Button asChild variant="tertiary">
            <Link href="/portal/deposits">Clear filters</Link>
          </Button>
        }
      />
    )
  }

  if (view === 'held') {
    return (
      <EmptyState
        title="No deposits held"
        description="A security deposit is recorded when a guest is checked in, and appears here until it has been released."
      />
    )
  }

  const descriptions: Record<Exclude<LedgerView, 'held'>, string> = {
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
