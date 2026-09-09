import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/portal/empty-state'
import { ExportCsvButton } from '@/components/portal/export-csv'
import { PageHeader } from '@/components/portal/page-header'
import { SectionHint } from '@/components/portal/section-hint'
import { readChoices, readSearch } from '@/components/portal/list-params'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/components/ui/avatar-identity'
import { clampPage, pageCountFor } from '@/components/ui/pagination-range'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderRow,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listAuditTrail, type AuditTrailEvent } from '@/lib/db/audit-trail'
import { exportGroup } from '@/lib/db/export'
import { listStaff } from '@/lib/db/staff'
import {
  auditSubjectHref,
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_TYPES,
  AUDIT_FAMILIES,
  describeAuditEvent,
  isAuditEntityType,
  isAuditFamily,
  SYSTEM_ACTOR,
  type AuditEntityType,
  type AuditFamily,
} from '@/lib/domain/audit-label'
import { formatTimestamp, isStayDate, type StayDate } from '@/lib/domain/dates'

import { AuditFilters } from './audit-filters'
import { AuditPagination } from './audit-pagination'
import { readPage, readPageSize } from './page-size'
import { ReasonCell } from './reason-cell'

export const metadata: Metadata = {
  title: 'Audit log',
}

/**
 * The columns, and what each one is declared to be worth.
 *
 * Four are fixed to the longest value each actually holds — a timestamp is
 * `12 Sept 2026, 14:32` and never longer; a reference over its kind is two
 * short lines — and one takes whatever the panel has left over.
 *
 * **The elastic one is What, not Reason.** Under fixed layout the surplus goes
 * entirely to the undeclared column, so whichever column that is ends up the
 * widest on screen — and *Reason* is the worst possible candidate twice over.
 * It is the column nobody controls, it is empty on most rows, and it was
 * taking three or four hundred pixels to say "—". *What* is the opposite: the
 * screen writes it, from a closed vocabulary of short sentences, and it wraps
 * to a second line without complaint when the panel is narrow. So Reason is
 * declared at a width that shows the opening of a sentence and hands the rest
 * to the unfold, and What absorbs the screen.
 *
 * That also makes the unfold's threshold exact rather than approximate:
 * Reason is the same width on every screen, so `CLIPPED_AT` in reason-cell.tsx
 * can be set against a known number of characters instead of a guess.
 */
const COLUMNS = [
  { label: 'When', width: 176 },
  { label: 'Who', width: 176 },
  { label: 'What', width: null },
  { label: 'Record', width: 144 },
  { label: 'Reason', width: 320 },
] as const

/** What What is never squeezed below before the container starts scrolling. */
const WHAT_MIN_WIDTH = 224

/** Derived, so the floor cannot drift from the widths it is a floor for. */
const TABLE_MIN_WIDTH = COLUMNS.reduce(
  (total, column) => total + (column.width ?? WHAT_MIN_WIDTH),
  0,
)

/**
 * Everything that has happened, and who did it (capability F4).
 *
 * The events have been recorded since the first slice and read one record at a
 * time ever since. This is the other half of the promise: the trail read across
 * records, which is how the questions are actually asked — every discount this
 * month, everything one person changed on Tuesday, every time somebody opened
 * an identity document.
 *
 * ── Who may read it ────────────────────────────────────────────────────────
 *
 * `config.manage`, which is Admin. **[A]** — no permission for the audit log is
 * named anywhere in the PRD, and F4 sits under what the Owner/Admin can do. It
 * mints no new permission string, which is the position prd.md §4 took when it
 * considered and rejected a seventeenth for the unit registry. Put to the
 * client as N34, with the consequence worth stating: Finance holds
 * `report.view` and cannot open this.
 */

interface PageProps {
  searchParams: Promise<{
    family?: string | string[]
    type?: string | string[]
    who?: string
    q?: string | string[]
    from?: string
    to?: string
    page?: string
    size?: string
  }>
}

export default async function AuditLogPage({ searchParams }: PageProps) {
  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'config.manage')) {
    return (
      <>
        <PageHeader
          title="Audit log"
          description="Every change to bookings, payments, deposits and charges, with who did it and when."
        />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Reading the audit log needs the "Edit settings, roles & the unit registry" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const params = await searchParams
  const families = readChoices<AuditFamily>(params.family, AUDIT_FAMILIES, isAuditFamily)
  const entityTypes = readChoices<AuditEntityType>(
    params.type,
    AUDIT_ENTITY_TYPES,
    isAuditEntityType,
  )
  const search = readSearch(params.q)
  const window = readWindow(params.from, params.to)
  const pageSize = readPageSize(params.size)
  const requestedPage = readPage(params.page)

  const staff = await listStaff()
  const actorNames = new Map(staff.map((account) => [account.id, account.displayName]))
  // A `who` that names nobody is dropped rather than applied, so a hand-edited
  // URL narrows to nothing visible instead of silently filtering everything out.
  const who =
    params.who === SYSTEM_ACTOR || (params.who && actorNames.has(params.who)) ? params.who : null

  const filter = {
    families,
    entityTypes,
    actor: who,
    search,
    ...(window ? { window } : {}),
  }

  const first = await listAuditTrail(filter, requestedPage, pageSize)
  const currentPage = clampPage(requestedPage, pageCountFor(first.total, pageSize))
  const { events, total } =
    currentPage === requestedPage ? first : await listAuditTrail(filter, currentPage, pageSize)

  const isFiltered =
    families.length > 0 ||
    entityTypes.length > 0 ||
    who !== null ||
    search !== null ||
    window !== null

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change to bookings, payments, deposits, charges, units, staff and settings — who did it, and when. Nothing here can be edited or deleted."
      />

      {/* The export sits at the actions end of the control line rather than
          on a title line: the trail has no visible heading, and this is the
          row that produced the rows. It takes the **whole** trail, not the
          filtered view — the file is the append-only record, and a reader who
          wanted this month's discounts can filter a spreadsheet as easily as
          this screen. Ungated: the screen answers to `config.manage`. */}
      <div className="mt-xl flex flex-wrap items-start gap-md">
        <AuditFilters
          families={families}
          entityTypes={entityTypes}
          actor={who}
          search={search ?? ''}
          from={window?.from ?? null}
          to={window?.to ?? null}
          actors={staff.map((account) => ({ id: account.id, name: account.displayName }))}
        />

        <div className="ml-auto">
          <ExportCsvButton tables={exportGroup('audit')} />
        </div>
      </div>

      <section aria-label="Recorded events" className="mt-lg">
        <Table
          scrollX
          className="table-fixed"
          style={{ minWidth: TABLE_MIN_WIDTH }}
          footer={
            <AuditPagination
              page={currentPage}
              pageSize={pageSize}
              total={total}
              params={filterParams(families, entityTypes, who, search, window)}
            />
          }
        >
          {/* Declared, not auto. Auto layout hands the slack to the widest
              column, and the widest column here is free text somebody typed —
              so one long reason narrowed *When*, *Who* and *What* for every
              row on the screen, and the table's proportions changed from page
              to page. Four are named and *What* takes what is left (see
              COLUMNS); a long reason clips to a line and unfolds on request
              (reason-cell.tsx). Below `TABLE_MIN_WIDTH` the container scrolls
              rather than squeezing five columns into a phone. */}
          <colgroup>
            {COLUMNS.map((column) => (
              <col key={column.label} style={column.width ? { width: column.width } : undefined} />
            ))}
          </colgroup>

          <TableHeader>
            <TableHeaderRow>
              <TableHead className="whitespace-nowrap">When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>What</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-xs">
                  Record
                  <SectionHint label="What a record is">
                    What the event was about, and the only column the search box matches against: a
                    booking reference, a unit, a role, a facility, a day-pass band, or one of the
                    property’s own bank accounts — the accounts customers transfer to, whose events
                    are somebody adding or editing one in Property settings. Guests and staff are
                    never matched here; look a guest up on the bookings register instead.
                  </SectionHint>
                </span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-xs">
                  Reason
                  <SectionHint label="What a reason is">
                    Some actions cannot be done without saying why — cancelling a booking,
                    discounting one, waiving or charging a deposit, taking a unit out of service,
                    accepting a payment for the wrong amount. This is what was typed at the time.
                    Most actions never ask, so most rows have none.
                  </SectionHint>
                </span>
              </TableHead>
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableEmpty colSpan={5}>{emptyMessage(isFiltered, search)}</TableEmpty>
            ) : null}

            {events.map((event) => (
              /* Cells centre in their row, as they do on every other table on
                 the surface. They were briefly top-aligned, on the argument
                 that an unfolded reason leaves a tall row — but the Record
                 column already stacks a reference over its kind, so no row
                 here was ever one line tall, and top-aligning to serve a state
                 a reader has to ask for made the ordinary row read differently
                 from the register beside it. */
              <TableRow key={event.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatTimestamp(event.at)}
                </TableCell>
                <TableCell>
                  <Actor id={event.actorId} name={actorNames.get(event.actorId ?? '')} />
                </TableCell>
                <TableCell className="text-foreground">{describeAuditEvent(event)}</TableCell>
                <TableCell>
                  <Subject event={event} actorNames={actorNames} />
                </TableCell>
                <ReasonCell reason={reasonOf(event)} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  )
}

/**
 * Who did it, wearing their identity colour — the same 24px mark a record's own
 * history uses, so the two read as one trail seen from different ends. An event
 * nobody performed wears the neutral, seedless face.
 */
function Actor({ id, name }: { id: string | null; name: string | undefined }) {
  return (
    // The name wraps rather than running past the column's declared edge: staff
    // are entered under the name they are called by, and some of those are long.
    <span className="flex items-center gap-sm">
      <Avatar className="size-6 shrink-0">
        <AvatarFallback seed={id ?? undefined}>{id ? initials(name ?? '?') : 'PV'}</AvatarFallback>
      </Avatar>
      <span className={id ? 'text-foreground' : 'text-muted-foreground'}>
        {id ? (name ?? 'A former staff member') : 'System'}
      </span>
    </span>
  )
}

/**
 * What the event was about, linked where there is somewhere to go.
 *
 * A staff account is named from the roster the screen already loaded rather
 * than in SQL: those rows live in `auth.users`, which this schema does not read
 * from. A subject that has since been deleted has no label from the view, so
 * the payload's own name stands in — unlinked, because there is nothing left to
 * open.
 */
function Subject({
  event,
  actorNames,
}: {
  event: AuditTrailEvent
  actorNames: ReadonlyMap<string, string>
}) {
  const label =
    event.entityType === 'staff_user'
      ? (actorNames.get(event.entityId) ?? payloadName(event))
      : (event.subjectLabel ?? payloadName(event))

  const kind = isAuditEntityType(event.entityType)
    ? AUDIT_ENTITY_LABELS[event.entityType]
    : event.entityType.replace(/_/g, ' ')

  const href = auditSubjectHref(event.entityType, event.subjectLabel)

  return (
    <span className="grid gap-xxs">
      {href && label ? (
        <Link href={href as Route} className="text-foreground underline-offset-2 hover:underline">
          {label}
        </Link>
      ) : (
        <span className="text-foreground">{label ?? '—'}</span>
      )}
      <span className="text-caption text-muted-foreground">{kind}</span>
    </span>
  )
}

/**
 * The name the event itself carries, for a subject that no longer exists.
 *
 * Not a rare case: `audit_event` is append-only and a booking is not, so the
 * trail outlives the records in it — deliberately. A booking cascaded away
 * still has its reference in the payload of the event that created it, which is
 * why the payloads carry one at all. Unlinked, because there is nothing left to
 * open.
 */
function payloadName(event: AuditTrailEvent): string | null {
  for (const key of ['reference', 'label', 'name', 'ref', 'bank_name', 'email', 'kind'] as const) {
    const value = event.before?.[key] ?? event.after?.[key]

    if (typeof value === 'string' && value !== '') {
      return value
    }
  }

  return null
}

/**
 * Why the table is empty — and, when a search is the reason, what the search
 * actually reaches.
 *
 * A term is matched against the Record column and nothing else. Every other
 * list screen in the portal also finds a guest by name, so somebody arriving
 * here reasonably tries one, gets nothing back, and has no way to tell a bad
 * term from a term this screen never reads. Said at the one moment it is
 * useful; the column's own hint says it in full, for anyone who asks before
 * they type.
 */
function emptyMessage(isFiltered: boolean, search: string | null): string {
  if (search !== null) {
    return `Nothing recorded against “${search}”. Search matches the Record column — a booking reference, a unit, a role, one of the property’s bank accounts — not guest or staff names.`
  }

  return isFiltered ? 'No events match these filters.' : 'Nothing has been recorded yet.'
}

/** The reason typed at the time, if the action asked for one. */
function reasonOf(event: AuditTrailEvent): string | null {
  const reason = event.after?.reason

  return typeof reason === 'string' && reason.length > 0 ? reason : null
}

function readWindow(from?: string, to?: string): { from: StayDate; to: StayDate } | null {
  if (!from || !to || !isStayDate(from) || !isStayDate(to) || from > to) {
    return null
  }

  return { from, to }
}

/** The filters, serialised for the pagination island. Never page or size. */
function filterParams(
  families: readonly string[],
  entityTypes: readonly string[],
  who: string | null,
  search: string | null,
  window: { from: StayDate; to: StayDate } | null,
): string {
  const params = new URLSearchParams()

  for (const family of families) {
    params.append('family', family)
  }

  for (const entityType of entityTypes) {
    params.append('type', entityType)
  }

  if (who) {
    params.set('who', who)
  }

  if (search) {
    params.set('q', search)
  }

  if (window) {
    params.set('from', window.from)
    params.set('to', window.to)
  }

  return params.toString()
}
