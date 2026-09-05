import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpLeft, FileText } from 'lucide-react'

import { DepositStageBadge } from '@/components/portal/deposit-stage-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { HISTORY_PAGE_SIZE, historyPage } from '@/components/portal/history-page'
import { PageHeader } from '@/components/portal/page-header'
import { SectionCard } from '@/components/portal/section-card'
import { Badge } from '@/components/ui/badge'
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
} from '@/components/ui/table'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listAuditEventPage } from '@/lib/db/audit'
import { getBookingByReference } from '@/lib/db/bookings'
import { listDepositCharges, type DepositCharge } from '@/lib/db/deposit-charges'
import { getDepositByBookingReference, type Deposit } from '@/lib/db/deposits'
import {
  listDocumentIdsForBooking,
  listDocumentsForBooking,
  type Document,
} from '@/lib/db/documents'
import { listStaff } from '@/lib/db/staff'
import { canAddCharge, canApproveRelease, owedStateOf } from '@/lib/domain/deposit'
import { formatStayDates, formatTimestamp } from '@/lib/domain/dates'
import { mayAttach, mayOpen } from '@/lib/domain/document'
import { INSPECTION_OUTCOME_LABELS, isInspectionOutcome } from '@/lib/domain/inspection'
import { formatCents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS } from '@/lib/domain/payment'

import { AttachDocument } from '../../documents/attach-document'
import { DocumentRow } from '../../documents/document-row'

import { AddCharge, WaiveCharge } from './charge-actions'
import { ApproveRelease, SettleOwed } from './deposit-actions'
import { DepositHistory } from './deposit-history'
import { RecordInspection } from './record-inspection'

interface PageProps {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ history?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params

  return { title: `Deposit ${decodeURIComponent(reference).toUpperCase()}` }
}

/**
 * One deposit: what is held, what stands against it, and who may sign it off
 * (capabilities E2 and E3).
 *
 * design.md: "Detail screens are routes, not panels" — and it names a deposit
 * as one of the records that would earn a route. It has its own actions, its
 * own history, and a statement somebody sends on.
 *
 * ── Addressed by its booking's reference ──────────────────────────────────
 *
 * `/portal/deposits/PV-4821`, not a uuid. A deposit has no reference of its
 * own and does not need one: there is exactly one per booking, staff already
 * say "PV-4821" out loud, and the two screens then share an address anyone can
 * move between.
 *
 * ── Three people, one screen ──────────────────────────────────────────────
 *
 * prd.md §4 [C] separates the roles deliberately — Housekeeping records the
 * inspection, Front Office raises a charge, Finance approves the release — so
 * every action here is gated on its own permission and rendered only for
 * whoever holds it. Nothing is disabled: an affordance that will refuse you is
 * worse than no affordance.
 *
 * The approval is additionally gated on the *state* by `canApproveRelease()`,
 * which is prd.md §11 requirement 4. The same rule refuses in the database, so
 * this decides what to draw rather than what is allowed.
 */
export default async function DepositPage({ params, searchParams }: PageProps) {
  const [{ reference: encoded }, search] = await Promise.all([params, searchParams])
  const reference = decodeURIComponent(encoded).toUpperCase()
  const actor = await getActor()

  // `booking.view`, for the reason the ledger takes it: all four working roles
  // need to read this screen, and each action re-checks its own permission.
  if (!actor || !hasPermission(actor.permissions, 'booking.view')) {
    return (
      <>
        <PageHeader title="Deposit" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Seeing a deposit needs the "View bookings" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const deposit = await getDepositByBookingReference(reference)

  if (!deposit) {
    return <NoDepositYet reference={reference} />
  }

  const [charges, staff, photographs, photographIds] = await Promise.all([
    listDepositCharges(deposit.id),
    listStaff(),
    listDocumentsForBooking(deposit.bookingId, 'inspection_photo'),
    listDocumentIdsForBooking(deposit.bookingId, 'inspection_photo'),
  ])

  // Four records, one trail, one page in one query (`listAuditEventPage`).
  //
  // A charge is its own entity with its own verbs — which is what makes "every
  // charge raised this month" one lookup — but a reader following a disputed
  // deduction should not have to visit three screens to assemble one story.
  //
  // The photographs' events are folded in for the same reason: a deduction
  // disputed a year later is argued from the evidence, and "who attached this
  // photograph, and did anybody remove one" is part of that story. Every
  // photograph the booking has carried, tombstones included, rather than the
  // ones listed above — a removed photograph is exactly the one a dispute
  // asks about, and its trail has to outlive the file. The booking's other
  // documents contribute nothing here: their events are labelled on the
  // booking's own screen, and a deposit's history is about the deposit.
  const history = await listAuditEventPage(
    [
      { entityType: 'deposit', entityIds: [deposit.id] },
      { entityType: 'inspection', entityIds: deposit.inspection ? [deposit.inspection.id] : [] },
      { entityType: 'deposit_charge', entityIds: charges.map((charge) => charge.id) },
      { entityType: 'document', entityIds: photographIds },
    ],
    historyPage(search.history),
    HISTORY_PAGE_SIZE,
  )

  const actorNames = new Map(staff.map((account) => [account.id, account.displayName]))

  const facts = {
    released: deposit.release !== null,
    inspected: deposit.inspection !== null,
    bookingStatus: deposit.bookingStatus,
  }

  const releaseCheck = canApproveRelease(facts)
  const owedState = owedStateOf({
    released: facts.released,
    owed: deposit.figures.owed,
    owedSettledAt: deposit.settlement?.at ?? null,
  })

  const mayInspect = hasPermission(actor.permissions, 'inspection.record')
  const mayCharge = hasPermission(actor.permissions, 'charge.create')
  const mayWaive = hasPermission(actor.permissions, 'charge.waive')
  const mayApprove = hasPermission(actor.permissions, 'deposit.approve_release')
  const maySettle = hasPermission(actor.permissions, 'payment.record_cash')

  return (
    <div className="max-w-[1120px]">
      <Button asChild variant="ghost" className="-ml-sm">
        <Link href="/portal/deposits">
          <ArrowLeft aria-hidden />
          All deposits
        </Link>
      </Button>

      <PageHeader
        className="mt-md"
        title={deposit.bookingReference}
        meta={
          <>
            <DepositStageBadge stage={deposit.stage} />
            <span className="text-body-md text-copy">{deposit.guestName}</span>
          </>
        }
        // Why the approval is not offered, for whoever could otherwise give
        // it. Stated rather than left to be worked out from an absent button —
        // "waiting on Housekeeping" is the answer, and it names who to ask.
        //
        // In the header rather than loose beneath it, which is what bottom-
        // aligns the buttons with it: `PageHeader` is `items-end`, so a
        // sentence outside it leaves the actions hanging level with the title
        // and a band of white space under them.
        description={
          mayApprove && !releaseCheck.ok && !facts.released ? releaseCheck.error.message : undefined
        }
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link href={`/portal/bookings/${deposit.bookingReference}`}>
                <ArrowUpLeft aria-hidden />
                View booking details
              </Link>
            </Button>
            {deposit.release ? (
              <Button asChild variant="tertiary">
                <Link href={`/portal/deposits/${deposit.bookingReference}/statement`}>
                  <FileText aria-hidden />
                  Statement
                </Link>
              </Button>
            ) : null}
            {mayApprove && releaseCheck.ok ? (
              <ApproveRelease
                depositId={deposit.id}
                reference={deposit.bookingReference}
                guestName={deposit.guestName}
                figures={deposit.figures}
                chargeCount={deposit.chargeCount}
              />
            ) : null}
          </>
        }
      />

      {/* `lg`, one step under the sections' `xl`: a title sits closer to its
          content than two cards sit to each other. */}
      <div className="mt-lg grid gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <DepositFigures deposit={deposit} actorNames={actorNames} />
        <InspectionSection
          deposit={deposit}
          actorNames={actorNames}
          mayInspect={mayInspect && !facts.inspected && deposit.bookingStatus === 'completed'}
          photographs={photographs}
          mayAddPhotographs={mayAttach('inspection_photo', actor.permissions)}
          mayOpenPhotographs={mayOpen('inspection_photo', actor.permissions)}
        />
      </div>

      <ChargesSection
        deposit={deposit}
        charges={charges}
        actorNames={actorNames}
        mayAdd={mayCharge && canAddCharge(facts)}
        mayWaive={mayWaive && canAddCharge(facts)}
      />

      {/* Only where somebody owes something. A card explaining that nothing is
          owed is a card about nothing. */}
      {owedState !== 'none' ? (
        <OwedSection deposit={deposit} settled={owedState === 'settled'} maySettle={maySettle} />
      ) : null}

      <SectionCard id="history-heading" title="History" className="mt-xl">
        <DepositHistory
          history={history}
          path={`/portal/deposits/${encodeURIComponent(reference)}`}
          actorNames={actorNames}
        />
      </SectionCard>
    </div>
  )
}

/* ── The figures ──────────────────────────────────────────────────────────── */

function DepositFigures({
  deposit,
  actorNames,
}: {
  deposit: Deposit
  actorNames: ReadonlyMap<string, string>
}) {
  const { figures, release } = deposit
  const owes = figures.owed > 0

  return (
    <SectionCard
      id="deposit-heading"
      title="Deposit"
      // The sentence that keeps this honest — every money-out path in this
      // product records rather than moves (architecture.md §6.4) — as the
      // section's hint rather than a paragraph under its figures.
      hint="Held as a liability, never counted as revenue. Released after the unit has been inspected and somebody has approved it; the approval is a record of who authorised what, and handing the money back happens outside the system."
    >
      {/* The gray inset is the panel for grouped figures (design.md). */}
      <Card surface="inset" className="grid gap-xs">
        <FigureRow label="Held" value={figures.amount} />
        {figures.chargesTotal > 0 ? (
          <FigureRow label="Less charges" value={figures.chargesTotal} />
        ) : null}
        <div className="mt-xs border-t border-divider pt-xs">
          <FigureRow
            label={
              release ? (owes ? 'Owed by guest' : 'Returned') : owes ? 'Would be owed' : 'To return'
            }
            value={owes ? figures.owed : figures.releasable}
            strong
          />
        </div>
      </Card>

      <dl className="mt-lg grid gap-md sm:grid-cols-2">
        <Field
          label="Collected"
          value={`${formatTimestamp(deposit.collectedAt)}, in ${PAYMENT_METHOD_LABELS[
            deposit.method
          ].toLowerCase()}`}
        />
        <Field label="Taken by" value={nameOf(deposit.collectedBy, actorNames)} />
        <Field
          label="Stay"
          value={
            deposit.stay
              ? `${deposit.stay.unitRef} · ${formatStayDates(deposit.stay.range.start, deposit.stay.range.end)}`
              : 'Occupies no unit'
          }
        />
        {release ? (
          <Field
            label="Released"
            value={`${formatTimestamp(release.at)} by ${nameOf(release.by, actorNames)}`}
          />
        ) : null}
      </dl>

      {release?.note ? (
        <p className="mt-lg text-body-sm text-copy">&ldquo;{release.note}&rdquo;</p>
      ) : null}
    </SectionCard>
  )
}

/* ── The inspection ───────────────────────────────────────────────────────── */

function InspectionSection({
  deposit,
  actorNames,
  mayInspect,
  photographs,
  mayAddPhotographs,
  mayOpenPhotographs,
}: {
  deposit: Deposit
  actorNames: ReadonlyMap<string, string>
  mayInspect: boolean
  photographs: readonly Document[]
  mayAddPhotographs: boolean
  mayOpenPhotographs: boolean
}) {
  const { inspection } = deposit
  const outcome = inspection && isInspectionOutcome(inspection.outcome) ? inspection.outcome : null

  return (
    <SectionCard id="inspection-heading" title="Inspection">
      {inspection ? (
        <>
          <div className="flex flex-wrap items-center gap-sm">
            <Badge tone={outcome === 'issues_found' ? 'warning' : 'positive'}>
              {outcome ? INSPECTION_OUTCOME_LABELS[outcome] : inspection.outcome}
            </Badge>
            <span className="text-caption text-muted-foreground">
              {formatTimestamp(inspection.inspectedAt)} by{' '}
              {nameOf(inspection.inspectedBy, actorNames)}
            </span>
          </div>

          {inspection.notes ? (
            <p className="mt-lg text-body-sm whitespace-pre-line text-copy">{inspection.notes}</p>
          ) : (
            <p className="mt-lg text-body-sm text-muted-foreground">
              Nothing was noted about the unit.
            </p>
          )}

          {/* prd.md §11 requirement 2, and the one the deposits slice could
              not meet: "Inspection records outcome, notes, and photographs.
              Photo evidence is the cheapest thing that improves dispute
              outcomes." An inset rather than a section of its own, because a
              photograph is part of the inspection rather than a record beside
              it — and a charge raised off the back of one is read against both
              together. */}
          <Card surface="inset" className="mt-lg">
            <span className="text-micro text-muted-foreground">Photographs</span>

            {photographs.length === 0 ? (
              <p className="mt-sm text-body-sm text-muted-foreground">
                None taken. A photograph is the cheapest evidence in a disputed charge.
              </p>
            ) : (
              <div className="mt-xs divide-y divide-border">
                {photographs.map((photograph) => (
                  <DocumentRow
                    key={photograph.id}
                    document={photograph}
                    mayOpen={mayOpenPhotographs}
                    mayRemove={mayAddPhotographs}
                    attachedBy={nameOf(photograph.uploadedBy, actorNames)}
                  />
                ))}
              </div>
            )}

            {mayAddPhotographs && deposit.inspection ? (
              <div className="mt-md">
                <AttachDocument
                  kind="inspection_photo"
                  bookingId={deposit.bookingId}
                  inspectionId={deposit.inspection.id}
                  label={photographs.length === 0 ? 'Add photographs' : 'Add more'}
                  title={`Photographs of ${deposit.stay?.unitRef ?? deposit.bookingReference}`}
                  description="Evidence for anything charged against this deposit. Kept privately."
                  multiple
                />
              </div>
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <p className="text-body-sm text-muted-foreground">
            {deposit.bookingStatus === 'completed'
              ? 'Nobody has inspected the unit yet. The deposit cannot be released until somebody has.'
              : 'The guest is still in the unit. It is inspected after they check out.'}
          </p>

          {mayInspect ? (
            <div className="mt-lg">
              <RecordInspection
                bookingId={deposit.bookingId}
                reference={deposit.bookingReference}
                unitRef={deposit.stay?.unitRef ?? null}
              />
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  )
}

/* ── The charges ──────────────────────────────────────────────────────────── */

function ChargesSection({
  deposit,
  charges,
  actorNames,
  mayAdd,
  mayWaive,
}: {
  deposit: Deposit
  charges: readonly DepositCharge[]
  actorNames: ReadonlyMap<string, string>
  mayAdd: boolean
  mayWaive: boolean
}) {
  return (
    <SectionCard id="charges-heading" title="Charges" className="mt-xl">
      {charges.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          Nothing has been charged against this deposit.
        </p>
      ) : (
        <Table containerClassName="mt-0">
          <TableHeader>
            <TableHeaderRow>
              <TableHead>What for</TableHead>
              <TableHead>Added by</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Waive</span>
              </TableHead>
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {charges.map((charge) => (
              <TableRow key={charge.id}>
                <TableCell className="text-foreground">
                  <span
                    className={charge.waived ? 'text-muted-foreground line-through' : undefined}
                  >
                    {charge.reason}
                  </span>
                  {/* A waived charge keeps its place and its reason. Waiving is
                      a decision under its own permission, and a decision that
                      leaves no row is one nobody can review. */}
                  {charge.waived ? (
                    <span className="mt-xxs block text-caption text-muted-foreground">
                      Waived by {nameOf(charge.waived.by, actorNames)} — &ldquo;
                      {charge.waived.reason}&rdquo;
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {nameOf(charge.createdBy, actorNames)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  <span
                    className={charge.waived ? 'text-muted-foreground line-through' : undefined}
                  >
                    {formatCents(charge.amount)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {mayWaive && !charge.waived ? (
                    <WaiveCharge
                      chargeId={charge.id}
                      reference={deposit.bookingReference}
                      amount={charge.amount}
                      chargeReason={charge.reason}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="mt-lg flex flex-wrap items-center justify-between gap-md">
        <p className="text-body-sm text-muted-foreground">
          {deposit.figures.chargesTotal > 0 ? (
            <>
              <span className="text-body-sm-strong text-foreground tabular-nums">
                BND {formatCents(deposit.figures.chargesTotal)}
              </span>{' '}
              stands against this deposit.
            </>
          ) : (
            'Charges come off what is returned when the release is approved.'
          )}
        </p>

        {mayAdd ? (
          <AddCharge
            depositId={deposit.id}
            reference={deposit.bookingReference}
            amount={deposit.amount}
            chargesTotal={deposit.figures.chargesTotal}
          />
        ) : null}
      </div>
    </SectionCard>
  )
}

/* ── What the guest owes ──────────────────────────────────────────────────── */

function OwedSection({
  deposit,
  settled,
  maySettle,
}: {
  deposit: Deposit
  settled: boolean
  maySettle: boolean
}) {
  return (
    <SectionCard
      id="owed-heading"
      title="Owed by the guest"
      // prd.md §11's own note to the client, kept on the screen where it
      // matters rather than only in a document — as the hint, read once.
      hint="The system keeps the record; recovering the money is a conversation. If this becomes common, the deposit itself is the thing to revisit."
      className="mt-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <p className="text-display-xs text-foreground tabular-nums">
            BND {formatCents(deposit.figures.owed)}
          </p>
          <p className="mt-xs text-body-sm text-muted-foreground">
            {settled && deposit.settlement
              ? `Settled ${formatTimestamp(deposit.settlement.at)}, in ${PAYMENT_METHOD_LABELS[
                  deposit.settlement.method
                ].toLowerCase()}.`
              : 'The charges came to more than the deposit. The statement is what to send.'}
          </p>
        </div>

        {!settled && maySettle ? (
          <SettleOwed
            depositId={deposit.id}
            reference={deposit.bookingReference}
            owed={deposit.figures.owed}
          />
        ) : null}
      </div>
    </SectionCard>
  )
}

/* ── Shared bits ──────────────────────────────────────────────────────────── */

/**
 * A booking exists but nothing has been collected against it.
 *
 * Not a 404: the URL is right and the reader followed a real link. What is
 * missing is a check-in, and saying so is more use than "not found".
 */
async function NoDepositYet({ reference }: { reference: string }) {
  const booking = await getBookingByReference(reference)

  if (!booking) {
    notFound()
  }

  return (
    <>
      <PageHeader title={booking.reference} />
      <EmptyState
        className="mt-xl"
        title="No deposit has been collected yet"
        description={
          booking.securityDeposit > 0
            ? `The BND ${formatCents(booking.securityDeposit)} security deposit on this booking is collected when the guest is checked in.`
            : 'This booking quotes no security deposit, so nothing is collected at check-in.'
        }
        action={
          <Button asChild variant="tertiary">
            <Link href={`/portal/bookings/${booking.reference}`}>
              <ArrowUpLeft aria-hidden />
              View booking details
            </Link>
          </Button>
        }
      />
    </>
  )
}

function FigureRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-lg">
      <span
        className={
          strong ? 'text-body-sm-strong text-foreground' : 'text-body-sm text-muted-foreground'
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? 'text-body-sm-strong text-foreground tabular-nums'
            : 'text-body-sm text-foreground tabular-nums'
        }
      >
        BND {formatCents(value)}
      </span>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="micro-label text-muted-foreground">{label}</dt>
      <dd className="mt-xs text-body-sm text-foreground">{value}</dd>
    </div>
  )
}

/** An action nobody performed is the system's, which is what a null actor is. */
function nameOf(actorId: string | null, actorNames: ReadonlyMap<string, string>): string {
  return actorId === null ? 'the system' : (actorNames.get(actorId) ?? 'a former colleague')
}
