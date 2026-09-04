import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, SlidersHorizontal } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { matchesSearch, readChoices, readSearch } from '@/components/portal/list-params'
import { PageHeader } from '@/components/portal/page-header'
import { UnitStatusBadge } from '@/components/portal/unit-status-badge'
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
import { getUnitTypes } from '@/lib/db/inventory'
import { listUnitStates, type UnitState } from '@/lib/db/units'
import { formatStayDate } from '@/lib/domain/dates'
import { countByStatus, isUnitStatus, UNIT_STATUSES } from '@/lib/domain/unit-status'

import { clampPage, pageCountFor } from '@/components/ui/pagination-range'

import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from './page-size'
import { UnitStatusTiles } from './status-tiles'
import { UnitsFilters } from './units-filters'
import { UnitsPagination } from './units-pagination'

export const metadata: Metadata = {
  title: 'Units',
}

/**
 * The state of the building, right now (capabilities B8 and B9).
 *
 * ── Why a register and not a floor plan ────────────────────────────────────
 *
 * The question this screen is asked is not only "what is free" — availability
 * already answers that, on the booking screen, for a specific set of dates. It
 * is "what is going on with 3B-04", which needs the occupant's name and the day
 * they leave, and a grid of coloured tiles has room for neither. So it is the
 * portal's ordinary register, and the six tiles above it carry the at-a-glance
 * half.
 *
 * ── Four of the six states are derived ─────────────────────────────────────
 *
 * available, held, booked and occupied are computed from the occupancy rows
 * that already exist (`deriveUnitStatus`); out of service and leased are the
 * two facts a person puts on a unit, and the only two this build stores.
 * prd.md §6.4 names two more — awaiting inspection and cleaning — which the
 * inspection flow (C2–C3) writes and this build cannot show. B8 is therefore
 * delivered across two slices, and scope-of-capabilities.md says so.
 *
 * ── Filtering happens here, in TypeScript ──────────────────────────────────
 *
 * The opposite of the bookings register, deliberately. That list pages in SQL
 * because bookings grow without limit; **this one is bounded by the building**
 * — fifty-odd rows that do not multiply between requests — so reading the whole
 * set and narrowing it here keeps the status derivation in exactly one place
 * rather than duplicating it as a SQL `where` clause. There is no pagination
 * for the same reason: a footer that pages fifty rows is chrome.
 */

interface PageProps {
  /** `status` and `type` repeat, one param per chosen value. */
  searchParams: Promise<{
    status?: string | string[]
    type?: string | string[]
    q?: string | string[]
    page?: string
    size?: string
  }>
}

/**
 * The requested page, or 1. Anything unusable falls back to the first page
 * rather than erroring, like every other param on this screen. Being *past the
 * end* needs the total, so it is clamped after the read.
 */
function readPage(value: string | undefined): number {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

/** The requested rows-per-page, restricted to the sizes the footer offers. */
function readPageSize(value: string | undefined): number {
  const parsed = Number(value)

  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_PAGE_SIZE
}

export default async function UnitsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const actor = await getActor()

  // `unit.manage` is held by Admin, Front Office and Housekeeping — the three
  // roles who need to know what a unit is doing. Renaming the building is a
  // different permission on a different screen; see /portal/settings/units.
  if (!actor || !hasPermission(actor.permissions, 'unit.manage')) {
    return (
      <>
        <PageHeader title="Units" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Seeing the state of the units needs the "Manage units" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  // Read together so the tiles and the table describe the same moment.
  const [units, unitTypes] = await Promise.all([listUnitStates(), getUnitTypes()])

  const typeIds = unitTypes.map((type) => type.id)
  const isKnownType = (candidate: string): candidate is string => typeIds.includes(candidate)

  // Canonical order, and every status — not just the ones present today. A
  // filter for a status nothing is in has to produce the empty state rather
  // than be quietly dropped, or the URL would lie about what is being shown.
  const statuses = readChoices(params.status, UNIT_STATUSES, isUnitStatus)
  const types = readChoices(params.type, typeIds, isKnownType)

  // The tiles count the whole building, not the filtered list. Six figures that
  // all moved when you clicked one of them would stop being the answer to
  // "what is the state of the building this morning".
  const counts = countByStatus(units.map((unit) => unit.status))

  const search = readSearch(params.q)

  // The fields a unit is known by: its door, who is in it, what kind it is.
  const visible = units.filter(
    (unit) =>
      (statuses.length === 0 || statuses.includes(unit.status)) &&
      (types.length === 0 || types.includes(unit.unitTypeId)) &&
      (search === null ||
        matchesSearch(search, [unit.ref, unit.occupant?.name, unit.unitTypeName])),
  )

  const isFiltered = statuses.length > 0 || types.length > 0 || search !== null

  // Paged over the filtered set rather than in SQL — see units-pagination.tsx.
  // Clamped against the real total so a bookmarked `?page=4` that has outlived
  // its rows lands on the last page that exists rather than an empty table
  // under a footer claiming otherwise.
  const pageSize = readPageSize(params.size)
  const currentPage = clampPage(readPage(params.page), pageCountFor(visible.length, pageSize))
  const paged = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Carried through every tile so choosing a status keeps the type filter. The
  // tiles *set* `status`, so this must not already contain one. Nor the page:
  // narrowing a list drops you back to page 1, the only page guaranteed to
  // exist afterwards.
  const tileParams = new URLSearchParams()

  for (const type of types) {
    tileParams.append('type', type)
  }

  if (search) {
    tileParams.set('q', search)
  }

  // The footer moves *within* the current view, so it carries every filter.
  const pageParams = new URLSearchParams(tileParams)

  for (const status of statuses) {
    pageParams.append('status', status)
  }

  const mayEditRegistry = hasPermission(actor.permissions, 'config.manage')

  return (
    <>
      <PageHeader
        title="Units"
        description="Every unit in the building, and what it is doing right now."
      />

      {/* The strip first, straight under the title: it is the screen's
          headline — the state of the building — and every list screen reads
          the same way down the page: the figures, then the chips, then the
          rows (design.md §Components — stat tiles). */}
      <UnitStatusTiles counts={counts} selected={statuses} otherParams={tileParams} />

      {/* The control line, directly above the table it narrows: what is being
          shown on the left, what can be done about it on the right. "Manage
          units" sits here rather than in the header — design.md keeps a
          header's actions only for screens with no control line, and a button
          level with the h1 would be the loudest thing on a screen whose point
          is the table. It is `tertiary` and carries a settings glyph:
          renaming the building is a rare, deliberate act, not this screen's
          primary one. There is no primary fill here at all, because a units
          board has nothing to create — units arrive through the registry
          editor, which is where that button lives. */}
      <div className="mt-md flex flex-wrap items-center gap-md">
        <UnitsFilters
          statuses={statuses}
          types={types}
          unitTypes={unitTypes}
          search={search ?? ''}
        />

        <div className="ml-auto flex items-center gap-md">
          {/* No count here: the table's own footer states it properly
              ("1–50 of 54 units") and is the thing that also lets you move, so
              keeping both meant reading the same figure twice in two registers
              a hand's width apart — the register's own conclusion. */}

          {/* Hidden rather than disabled for someone who cannot use it: an
              affordance for a screen that will refuse you is worse than no
              affordance (architecture.md §3 — the editor re-checks anyway). */}
          {mayEditRegistry ? (
            <Button asChild variant="tertiary">
              <Link href="/portal/settings/units">
                <SlidersHorizontal aria-hidden />
                Manage units
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <section aria-label="Units" className="mt-md">
        {visible.length === 0 ? (
          <EmptyState
            title={isFiltered ? 'No units match these filters' : 'No units yet'}
            description={
              isFiltered
                ? 'Try a different status or unit type, or clear the filters to see the whole building.'
                : 'The building has no units on record. An administrator sets them up on the unit registry screen.'
            }
            action={
              isFiltered ? (
                <Button asChild variant="tertiary">
                  <Link href="/portal/units">Clear filters</Link>
                </Button>
              ) : mayEditRegistry ? (
                <Button asChild variant="tertiary">
                  <Link href="/portal/settings/units">Set up the units</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table
            footer={
              <UnitsPagination
                page={currentPage}
                pageSize={pageSize}
                total={visible.length}
                params={pageParams.toString()}
              />
            }
          >
            <TableHeader>
              <TableHeaderRow>
                <TableHead>Unit</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                {/* "Who" rather than "Guest": a lease has a tenant and an
                    out-of-service unit has a fault, and all three are the
                    answer to the same question about the same cell. */}
                <TableHead>Who</TableHead>
                <TableHead>Until</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableHeaderRow>
            </TableHeader>
            <TableBody>
              {paged.map((unit) => (
                <UnitRow key={unit.id} unit={unit} />
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  )
}

function UnitRow({ unit }: { unit: UnitState }) {
  return (
    <TableRow interactive className="group">
      <TableCell className="font-mono text-foreground tabular-nums">
        <TableRowLink href={`/portal/units/${encodeURIComponent(unit.ref)}`}>
          {unit.ref}
        </TableRowLink>
      </TableCell>

      <TableCell className="whitespace-nowrap">{unit.unitTypeName}</TableCell>

      <TableCell className="whitespace-nowrap">
        <UnitStatusBadge status={unit.status} />
      </TableCell>

      {/* One cell, three kinds of answer, because they are one question. An
          out-of-service unit's "who" is why it is out of service — the fault is
          what a reader wants there, and a second column carrying it would be
          empty on every other row. */}
      <TableCell>
        {unit.outOfService ? (
          <span className="text-foreground">{unit.outOfService.reason}</span>
        ) : unit.occupant ? (
          <>
            <span className="block text-foreground">{unit.occupant.name}</span>
            {unit.occupant.bookingReference ? (
              <span className="mt-xxs block font-mono text-caption text-muted-foreground tabular-nums">
                {unit.occupant.bookingReference}
              </span>
            ) : (
              <span className="mt-xxs block text-caption text-muted-foreground">
                Long-term lease
              </span>
            )}
          </>
        ) : (
          <Absent title="Nobody is in this unit today" />
        )}
      </TableCell>

      {/* An occupied unit says when it frees up; a free one says when it stops
          being free. Two different facts, so the second is labelled — an
          unqualified date in this column would read as an end either way. */}
      <TableCell className="whitespace-nowrap">
        {unit.outOfService ? (
          <span className="text-muted-foreground">
            Since {formatStayDate(unit.outOfService.since)}
          </span>
        ) : unit.occupant ? (
          // An open-ended lease has no date to put here, and an em dash would
          // read as "we don't know". It is a fact about the tenancy, not a
          // missing value, so it is said in words (N19).
          unit.occupant.end !== null ? (
            formatStayDate(unit.occupant.end)
          ) : (
            <span className="text-muted-foreground">No end date</span>
          )
        ) : unit.nextStart ? (
          <span className="text-muted-foreground">Next stay {formatStayDate(unit.nextStart)}</span>
        ) : (
          <Absent title="Nothing booked" />
        )}
      </TableCell>

      <TableCell className="w-0 pl-0 text-right">
        <ChevronRight
          aria-hidden
          className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
        />
      </TableCell>
    </TableRow>
  )
}

/** A cell a unit has no answer for. Titled rather than bare — an em dash is
 *  only obvious once you know what it stands in for. */
function Absent({ title }: { title: string }) {
  return (
    <span className="text-muted-foreground" title={title}>
      —
    </span>
  )
}
