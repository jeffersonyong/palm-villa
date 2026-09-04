import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { HISTORY_PAGE_SIZE, historyPage } from '@/components/portal/history-page'
import { PageHeader } from '@/components/portal/page-header'
import { SectionCard } from '@/components/portal/section-card'
import { UnitStatusBadge } from '@/components/portal/unit-status-badge'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listAuditEventPage } from '@/lib/db/audit'
import { listStaff } from '@/lib/db/staff'
import { getUnitStateByRef } from '@/lib/db/units'
import { formatStayDate } from '@/lib/domain/dates'

import { UnitActions } from './unit-actions'
import { UnitHistory } from './unit-history'
import { UnitNotes } from './unit-notes'

export const metadata: Metadata = {
  title: 'Unit',
}

/**
 * One unit, and everything that has happened to it (capabilities B8 and B9).
 *
 * design.md: "Detail screens are routes, not panels." A unit has its own
 * actions and its own history, so it opens at its own URL rather than in a
 * drawer over the board.
 *
 * ── Addressed by reference, not by uuid ───────────────────────────────────
 *
 * `/portal/units/3B-04` is a URL a staff member can read, say out loud and
 * recognise — the same reasoning `/portal/bookings/PV-4821` follows. The cost
 * is that renaming a unit changes its address, which is correct: the old name
 * is not a thing anyone should still be able to reach, and the rename is in the
 * unit's own history for anyone who needs to follow it.
 *
 * ── The history is the point of the screen ────────────────────────────────
 *
 * A unit outlives every booking in it. "Why was 3B-04 unavailable all of
 * September" is a question about the unit, and nothing else in the product can
 * answer it: the bookings that were not made leave no trace, and a status flag
 * would say only what is true now. architecture.md §4 keeps these as
 * append-only events precisely so this page can exist.
 */

interface PageProps {
  params: Promise<{ ref: string }>
  searchParams: Promise<{ history?: string }>
}

export default async function UnitPage({ params, searchParams }: PageProps) {
  const [{ ref: encoded }, search] = await Promise.all([params, searchParams])
  const ref = decodeURIComponent(encoded)
  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'unit.manage')) {
    return (
      <>
        <PageHeader title="Unit" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Seeing a unit needs the "Manage units" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const unit = await getUnitStateByRef(ref)

  if (!unit) {
    notFound()
  }

  // One page of the trail. A unit's history grows for the life of the
  // building, so the read is paged rather than whole — see `history-page.ts`.
  const [history, staff] = await Promise.all([
    listAuditEventPage(
      [{ entityType: 'unit', entityIds: [unit.id] }],
      historyPage(search.history),
      HISTORY_PAGE_SIZE,
    ),
    listStaff(),
  ])
  const actorNames = new Map(staff.map((account) => [account.id, account.displayName]))

  const lease =
    unit.occupant && unit.occupant.status === 'leased'
      ? {
          occupancyId: unit.occupant.occupancyId,
          occupantName: unit.occupant.name,
          start: unit.occupant.start,
          end: unit.occupant.end,
        }
      : null

  // A lease may only be recorded on a unit that is free today and in service.
  // The database refuses the rest anyway — the exclusion constraint and the
  // out-of-service trigger — so this only decides whether the button appears.
  const mayLease = unit.occupant === null && unit.outOfService === null

  return (
    <>
      {/* Rows on the board open this screen, so it needs a way back that is not
          the browser's. Above the title rather than beside it: it is a
          navigation control, not one of the record's actions, and the header's
          action slot is spoken for. `ghost`, because a way out is not a thing
          to advertise — the same treatment the amend screen and the unit
          registry use. */}
      <div className="mb-md">
        <Button asChild variant="ghost">
          <Link href="/portal/units">
            <ArrowLeft aria-hidden />
            Back to units
          </Link>
        </Button>
      </div>

      <PageHeader
        title={unit.ref}
        meta={<UnitStatusBadge status={unit.status} />}
        actions={
          <UnitActions
            unitId={unit.id}
            ref_={unit.ref}
            isOutOfService={unit.outOfService !== null}
            lease={lease}
            mayLease={mayLease}
            canManageUnit={hasPermission(actor.permissions, 'unit.manage')}
            canManageTenancy={hasPermission(actor.permissions, 'tenancy.manage')}
          />
        }
      />

      {/* `lg`, one step under the sections' `xl`: a title sits closer to its
          content than two cards sit to each other. */}
      <div className="mt-lg grid items-start gap-md lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* `content-start`, or the column's rows stretch to match the history
            beside them and a two-line note becomes a card six hundred pixels
            tall. */}
        <div className="grid content-start gap-md">
          {/* First, not last. A standing fact about the unit — "the shower door
              sticks" — is the thing a cleaner opening this screen most needs,
              and it outlives every booking beneath it (open-questions.md
              N18). */}
          <SectionCard id="unit-notes" title="About this unit">
            <UnitNotes
              unitId={unit.id}
              ref_={unit.ref}
              notes={unit.notes}
              canEdit={hasPermission(actor.permissions, 'unit.manage')}
            />
          </SectionCard>

          <SectionCard id="unit-facts" title="The unit">
            <dl className="grid gap-md sm:grid-cols-2">
              <Fact label="Reference" value={<span className="font-mono">{unit.ref}</span>} />
              <Fact label="Type" value={unit.unitTypeName} />

              {unit.outOfService ? (
                <>
                  <Fact
                    label="Out of service since"
                    value={formatStayDate(unit.outOfService.since)}
                  />
                  <Fact label="Reason" value={unit.outOfService.reason} />
                </>
              ) : null}
            </dl>
          </SectionCard>

          <SectionCard id="unit-occupancy" title="Today">
            {unit.occupant ? (
              <dl className="grid gap-md sm:grid-cols-2">
                <Fact
                  label={unit.occupant.bookingReference ? 'Guest' : 'Tenant'}
                  value={unit.occupant.name}
                />
                <Fact
                  label="Until"
                  value={
                    unit.occupant.end !== null ? (
                      formatStayDate(unit.occupant.end)
                    ) : (
                      <span className="text-muted-foreground">No end date — until it is ended</span>
                    )
                  }
                />
                {unit.occupant.bookingReference ? (
                  <Fact
                    label="Booking"
                    value={
                      <Button asChild variant="tertiary" className="font-mono">
                        <Link href={`/portal/bookings/${unit.occupant.bookingReference}`}>
                          {unit.occupant.bookingReference}
                        </Link>
                      </Button>
                    }
                  />
                ) : (
                  <Fact label="Arrangement" value="Long-term lease" />
                )}
              </dl>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                {unit.outOfService
                  ? 'Nobody is in this unit, and nobody can be booked into it until it is returned to service.'
                  : unit.nextStart
                    ? `Nobody is in this unit today. The next stay begins ${formatStayDate(unit.nextStart)}.`
                    : 'Nobody is in this unit today, and nothing is booked.'}
              </p>
            )}
          </SectionCard>
        </div>

        <SectionCard id="unit-history" title="History">
          <UnitHistory
            history={history}
            path={`/portal/units/${encodeURIComponent(unit.ref)}`}
            actorNames={actorNames}
          />
        </SectionCard>
      </div>
    </>
  )
}

/** One labelled fact: `micro` label over the value, the portal's readout. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="micro-label text-muted-foreground">{label}</dt>
      <dd className="mt-xs text-body-md text-foreground">{value}</dd>
    </div>
  )
}
