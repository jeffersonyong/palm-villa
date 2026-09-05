import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'

import { BookingStatusBadge } from '@/components/portal/booking-status-badge'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/portal/empty-state'
import { HISTORY_PAGE_SIZE, historyPage } from '@/components/portal/history-page'
import { PageHeader } from '@/components/portal/page-header'
import { SectionCard } from '@/components/portal/section-card'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listAuditEventPage } from '@/lib/db/audit'
import { getBookingByReference, type Booking } from '@/lib/db/bookings'
import { getDepositByBookingId, type Deposit } from '@/lib/db/deposits'
import {
  listDocumentIdsForBooking,
  listDocumentsForBooking,
  type Document,
} from '@/lib/db/documents'
import { listBookingNotes } from '@/lib/db/notes'
import { listPaymentsForBooking, type Payment } from '@/lib/db/payments'
import { listStaff } from '@/lib/db/staff'
import { allowedEvents, canAmend } from '@/lib/domain/booking-state'
import { formatStayDate, formatTimestamp, nightsBetween, todayInBrunei } from '@/lib/domain/dates'
import { balanceOf, canSettle } from '@/lib/domain/balance'
import { describeDiscount } from '@/lib/domain/discount'
import { formatCents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS } from '@/lib/domain/payment'
import { mayAttach, mayOpen } from '@/lib/domain/document'
import { formatVehicles } from '@/lib/domain/vehicle'
import { cn } from '@/lib/utils'

import { AttachDocument } from '../../documents/attach-document'
import { DocumentRow } from '../../documents/document-row'
import { PaymentActions } from '../../payments/payment-actions'

import { AccountingPack } from './accounting-pack'
import { BookingActions } from './booking-actions'
import { BookingHistory } from './booking-history'
import { AddNote, BookingNotes } from './booking-notes'
import { IdentityDocuments } from './identity-documents'
import { RecordPayment } from './record-payment'
import { SecurityDepositInset } from './security-deposit-inset'
import { StayButtons } from './stay-buttons'

/**
 * One booking, everything known about it, and what can still be done to it
 * (capability B3).
 *
 * A route rather than a panel over the list, deliberately. Staff send booking
 * links to each other, the dashboard's arrivals list and the payment
 * verification queue both need somewhere to point, and the amendment form
 * needs a screen rather than a drawer. Recorded in design.md §Components.
 *
 * Which actions appear is derived from the state machine — `canAmend` and
 * `allowedEvents` — never from a hand-written list of statuses. A screen that
 * decides for itself which moves are legal is a second copy of the machine
 * (architecture.md §5.3).
 */

interface PageProps {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ history?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params

  return { title: decodeURIComponent(reference).toUpperCase() }
}

export default async function BookingDetailPage({ params, searchParams }: PageProps) {
  const [{ reference }, search] = await Promise.all([params, searchParams])
  const actor = await getActor()

  // Render is gated per-permission server-side (architecture.md §3). The gate
  // that matters is on each action; this only spares a staff member a screen
  // they cannot use — and stops the booking's details being readable by someone
  // whose role does not include them.
  if (!actor || !hasPermission(actor.permissions, 'booking.view')) {
    return (
      <>
        <PageHeader title="Booking" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Viewing bookings needs the "View bookings" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const booking = await getBookingByReference(decodeURIComponent(reference))

  if (!booking) {
    notFound()
  }

  const [payments, staff, notes, deposit, documents, everyDocumentId] = await Promise.all([
    listPaymentsForBooking(booking.id),
    listStaff(),
    listBookingNotes(booking.id),
    getDepositByBookingId(booking.id),
    listDocumentsForBooking(booking.id),
    listDocumentIdsForBooking(booking.id),
  ])

  // The trail is the booking's own events with three other records' folded
  // in, read as one page in one query (`listAuditEventPage`). Each keeps its
  // own `entity_type` — the F4 audit screen will want to filter on it — and
  // each is here because leaving it out would make the trail lie by omission:
  //
  // - Payments are typed against the payment, not the booking, so the
  //   booking's events alone would show it reaching `confirmed` with no
  //   record of what was banked.
  // - The deposit's, for the same reason: a guest checking in with no record
  //   of the money that changed hands. Its charges and its inspection stay on
  //   the deposit's own screen — a second record with its own history, and
  //   repeating it here would make a booking's trail the whole ledger.
  // - Every document's, which is the trail capability G3 promises: every time
  //   somebody opened an identity document, on the record it belongs to. From
  //   EVERY document id, tombstones included, rather than the list rendered
  //   above — a deleted document is not on file, but its history has to
  //   survive it, or the record of who opened somebody's IC disappears the
  //   moment the retention job deletes it, precisely when a person would come
  //   asking.
  const history = await listAuditEventPage(
    [
      { entityType: 'booking', entityIds: [booking.id] },
      { entityType: 'payment', entityIds: payments.map((payment) => payment.id) },
      { entityType: 'deposit', entityIds: deposit ? [deposit.id] : [] },
      { entityType: 'document', entityIds: everyDocumentId },
    ],
    historyPage(search.history),
    HISTORY_PAGE_SIZE,
  )

  const actorNames = new Map(staff.map((account) => [account.id, account.displayName]))
  const pending = payments.find((payment) => payment.status === 'pending_verification')
  const mayVerify = hasPermission(actor.permissions, 'payment.verify')

  // Whether the live pack is behind the money it records. A pack is filed
  // seconds after a verification by `after()`, so a pack older than the newest
  // verified payment is one still on its way — or one whose assembly failed
  // and is waiting for tonight. The panel tells the two apart by the clock.
  const pack = documents.filter((document) => document.kind === 'accounting_pack').at(-1) ?? null
  const newestVerifiedAt =
    payments
      .filter((payment) => payment.status === 'verified' && payment.verifiedAt)
      .map((payment) => payment.verifiedAt!)
      .sort()
      .at(-1) ?? null
  const packPendingSince =
    newestVerifiedAt !== null &&
    (pack === null || Date.parse(pack.uploadedAt) < Date.parse(newestVerifiedAt))
      ? newestVerifiedAt
      : null

  const mayAmend = canAmend(booking.status) && hasPermission(actor.permissions, 'booking.amend')
  // Both moves are gated by `booking.amend` until N11 settles who checks a
  // guest in — see stay-actions.ts. Which one is offered comes from the state
  // machine, never from a hand-written list of statuses.
  const mayMoveStay = hasPermission(actor.permissions, 'booking.amend')
  const canCheckIn = mayMoveStay && allowedEvents(booking.status).includes('check_in')
  const canCheckOut = mayMoveStay && allowedEvents(booking.status).includes('check_out')
  const mayCancel =
    allowedEvents(booking.status).includes('cancel') &&
    hasPermission(actor.permissions, 'booking.cancel')

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title={booking.reference}
        // On the title's line, not under it: the reference, the state it is in
        // and whose booking it is are one thought, and staff read them
        // together (design.md §Components — Portal screen header).
        meta={
          <>
            <BookingStatusBadge status={booking.status} />
            {/* The name only. The number moved into the card below, where it
                can carry a label and be dialled — on the title line it was
                unlabelled grey text after a middot, which is the wrong
                treatment for the one thing on this screen somebody acts on. */}
            <span className="text-body-md text-copy">{booking.guestName}</span>
          </>
        }
        actions={
          <>
            <StayButtons
              bookingId={booking.id}
              reference={booking.reference}
              guestName={booking.guestName}
              securityDeposit={booking.securityDeposit}
              checkInDate={booking.stay?.range.start ?? null}
              today={todayInBrunei()}
              canCheckIn={canCheckIn}
              canCheckOut={canCheckOut}
            />
            {mayAmend ? (
              <Button asChild variant="tertiary">
                <Link href={`/portal/bookings/${booking.reference}/amend`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}
            {mayCancel ? (
              <BookingActions
                bookingId={booking.id}
                reference={booking.reference}
                guestName={booking.guestName}
              />
            ) : null}
          </>
        }
      />

      {!canAmend(booking.status) ? (
        <p className="mt-lg text-body-sm text-muted-foreground">
          {booking.status === 'checked_in'
            ? 'This guest has checked in, so the booking can no longer be edited. Checking them out ends the stay.'
            : 'This booking is closed. Its details are kept as a record and cannot be changed.'}
        </p>
      ) : null}

      {/* `lg`, one step under the sections' `xl`: a title sits closer to its
          content than two cards sit to each other. */}
      <div className="mt-lg grid gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GuestAndStaySummary
          booking={booking}
          identityDocuments={documents.filter((document) => document.kind === 'identity')}
          mayOpenIdentity={mayOpen('identity', actor.permissions)}
          mayAttachIdentity={mayAttach('identity', actor.permissions)}
          actorNames={actorNames}
        />
        <MoneySummary
          booking={booking}
          payments={payments}
          deposit={deposit}
          mayRecordPayment={hasPermission(actor.permissions, 'payment.record_cash')}
        />
      </div>

      <PaymentsSection
        payments={payments}
        pending={pending}
        mayVerify={mayVerify}
        actorNames={actorNames}
        booking={booking}
        slips={documents.filter((document) => document.kind === 'payment_slip')}
        mayAttachSlip={mayAttach('payment_slip', actor.permissions)}
        maySeeSlip={mayOpen('payment_slip', actor.permissions)}
      />

      {/* Below the payments it records, above the notes. The newest live
          pack; `listDocumentsForBooking` reads oldest first. How the pack
          comes to exist is the section's hint rather than a paragraph under
          it — read once, not on every visit. */}
      <SectionCard
        id="pack-heading"
        title="Accounting pack"
        hint="Built when a payment is verified, and rebuilt overnight after any change to the booking, its payments or its documents. Earlier versions stay on the history. The identity document is referenced, not copied in."
        className="mt-xl"
      >
        <AccountingPack
          bookingId={booking.id}
          pack={pack}
          mayOpen={mayOpen('accounting_pack', actor.permissions)}
          hasVerifiedPayment={newestVerifiedAt !== null}
          pendingSince={packPendingSince}
        />
      </SectionCard>

      {/* Above the history, below the money. The history is the system's
          account of what happened; this is the staff's, and the two read
          better in that order — what people said, then what was recorded. */}
      <SectionCard
        id="notes-heading"
        title="Notes"
        actions={<AddNote bookingId={booking.id} />}
        className="mt-xl"
      >
        <BookingNotes notes={notes} actorNames={actorNames} />
      </SectionCard>

      <SectionCard id="history-heading" title="History" className="mt-xl">
        <BookingHistory
          history={history}
          path={`/portal/bookings/${encodeURIComponent(booking.reference)}`}
          actorNames={actorNames}
        />
      </SectionCard>
    </div>
  )
}

/* ── Who, and their stay ───────────────────────────────────────────────── */

/**
 * The guest and the stay in one card, in that order.
 *
 * They were two things: the guest lived on the title line beside the status
 * chip, and this card held the stay alone. The name is fine up there — that is
 * record identity, which is what the header's `meta` slot is for — but the
 * phone number was not. It is the one datum on this screen a staff member
 * *acts on*, and it was unlabelled, unlinked, and competing with a status chip
 * for the same line.
 *
 * So the number comes down here, where it gets a label and is dialable, and
 * the card is renamed rather than quietly filing a phone number under "Stay".
 * The name is repeated deliberately: identity above, actionable data below.
 *
 * It also settles a gap. `SectionCard` is `h-full` so this card and Money end
 * level, and Money is the taller of the two — this one used to stretch and
 * leave dead space under its four fields. Six fields fill the row honestly,
 * which is a better answer than shortening the card and letting the pair sit
 * ragged.
 */
function GuestAndStaySummary({
  booking,
  identityDocuments,
  mayOpenIdentity,
  mayAttachIdentity,
  actorNames,
}: {
  booking: Booking
  identityDocuments: readonly Document[]
  mayOpenIdentity: boolean
  mayAttachIdentity: boolean
  actorNames: Map<string, string>
}) {
  const { stay } = booking
  const nights = stay ? nightsBetween(stay.range.start, stay.range.end) : null

  return (
    <SectionCard id="guest-stay-heading" title="Guest & stay">
      {/* Two columns, not a stack: six readouts in one card read as a panel
          of figures, and stacked they read as a form nobody can fill in. */}
      <dl className="grid gap-md sm:grid-cols-2">
        <Field label="Guest" value={booking.guestName} />
        {/* `tel:` because the portal is opened on a phone often enough to be
            worth it, and inert on a desktop that has no handler. Figures are
            tabular but NOT mono: the bookings list makes the same call, so the
            booking reference stays the only mono string on the screen and
            keeps what mono is saying. */}
        <Field
          label="Phone"
          value={booking.guestPhone}
          href={`tel:${booking.guestPhone.replace(/\s+/g, '')}`}
          figures
        />
        {/* A booking with no occupancy is a day pass — it consumes facility
            capacity on a date and occupies no unit (prd.md §6.1). Nothing
            writes one yet, so this is the register's shape reaching the record
            screen rather than a case staff can produce today. */}
        <Field label="Unit" value={stay ? stay.unitRef : 'No unit'} mono={Boolean(stay)} />
        <Field
          label="Dates"
          value={
            stay
              ? `${formatStayDate(stay.range.start)} → ${formatStayDate(stay.range.end)}`
              : 'No stay dates'
          }
          hint={nights === null ? undefined : `${nights} ${nights === 1 ? 'night' : 'nights'}`}
        />
        {/* "Party", not "Guests". Beside a `Guest` field holding a name, a
            `Guests` field holding a number reads as one of the two being a
            mistake. */}
        <Field
          label="Party"
          value={String(booking.chargeableGuests)}
          hint={
            booking.exemptGuests > 0
              ? `plus ${booking.exemptGuests} not counted towards occupancy`
              : undefined
          }
        />
        <VehicleField booking={booking} />
      </dl>

      {/* Under the fields rather than beside them: prd.md §13 [C] makes the IC
          part of registering a guest, so it belongs on the card that says who
          they are — and an inset is what a card's own sub-panel is
          (design.md §Components). */}
      <IdentityDocuments
        bookingId={booking.id}
        guestName={booking.guestName}
        documents={identityDocuments}
        mayOpen={mayOpenIdentity}
        mayAttach={mayAttachIdentity}
        actorNames={actorNames}
      />
    </SectionCard>
  )
}

/**
 * The plates arriving on this booking (prd.md §2, §13 [C]).
 *
 * Three different absences, said three different ways, because they mean
 * different things to the guard at the gate. **"None"** is the guest saying
 * they have no car. **"Not recorded"** is a booking taken before the field was
 * required — nobody asserted anything, and it is worth fixing on the next
 * amendment. Neither is a blank, which would read as a rendering fault.
 */
/**
 * The transfer slip against one payment (capability B4).
 *
 * prd.md §10.4's third required behaviour: "Treat the slip as evidence, not
 * verification. Slips can be edited. Staff still check the bank. The slip's
 * value is dispute resolution and automatic inclusion in the accounting pack."
 * Both halves of that are visible here — the slip is recorded under the payment
 * rather than presented as something to approve against, and nothing about the
 * verification controls changes when one is attached.
 *
 * The delta this closes was flagged in prd.md §10.4 and scope B4: the queue
 * shipped saying "No slip on file" on every row because nothing could upload
 * one.
 */
function SlipLine({
  payment,
  slip,
  bookingId,
  mayAttach,
  maySee,
  actorNames,
}: {
  payment: Payment
  slip: Document | undefined
  bookingId: string
  mayAttach: boolean
  maySee: boolean
  actorNames: ReadonlyMap<string, string>
}) {
  // The same inset the identity document sits in on the Guest & stay card: a
  // file on a record is one construction wherever it appears, and a bare
  // "No slip on file" line among the payment's captions read as one more
  // caption rather than as a place a file goes.
  return (
    <Card surface="inset" className="mt-xs">
      <span className="text-micro text-muted-foreground">Transfer slip</span>

      {slip ? (
        <div className="mt-xs divide-y divide-border">
          <DocumentRow
            document={slip}
            mayOpen={maySee}
            mayRemove={mayAttach}
            attachedBy={
              slip.uploadedBy
                ? (actorNames.get(slip.uploadedBy) ?? 'a former colleague')
                : 'the system'
            }
          />
        </div>
      ) : (
        // One line, as the identity panel's: the absence on the left and the
        // control that ends it on the right, bottoms level.
        <div className="mt-sm flex items-end justify-between gap-md">
          <p className="text-body-sm text-muted-foreground">No slip on file.</p>
          {mayAttach ? (
            <AttachDocument
              kind="payment_slip"
              bookingId={bookingId}
              paymentId={payment.id}
              label="Attach slip"
              title="Attach the transfer slip"
              description="The bank app is still the check — a slip is evidence, not verification. Kept privately as an accounting record."
            />
          ) : null}
        </div>
      )}
    </Card>
  )
}

function VehicleField({ booking }: { booking: Booking }) {
  const plates = formatVehicles(booking.vehicles)
  const label = booking.vehicles.length === 1 ? 'Vehicle' : 'Vehicles'

  if (plates) {
    return <Field label={label} value={plates} mono />
  }

  return (
    <Field
      label="Vehicle"
      value={booking.noVehicle ? 'None' : 'Not recorded'}
      hint={
        booking.noVehicle
          ? 'The guest is arriving without one.'
          : 'Taken before a registration was required — add it when editing the booking.'
      }
    />
  )
}

/* ── The money ─────────────────────────────────────────────────────────── */

function MoneySummary({
  booking,
  payments,
  deposit,
  mayRecordPayment,
}: {
  booking: Booking
  payments: readonly Payment[]
  /** What is actually held, once the guest has checked in. Null before that. */
  deposit: Deposit | null
  mayRecordPayment: boolean
}) {
  // The balance, at last. This card used to state what had been taken and
  // deliberately never what was owed — the payment slice was not a ledger, and
  // could not be while a booking's price could not move after it was paid. The
  // amendment path made that untenable (capability B13): a guest who paid for
  // one night and extends to two leaves the booking worth more than has been
  // paid for it, and saying nothing about the difference is how it goes
  // uncollected. `paid` is summed from the verified payments by the read
  // model; the subtraction lives in lib/domain/balance.ts.
  const balance = balanceOf(booking.total, booking.paid)

  const awaiting = payments.some((payment) => payment.status === 'pending_verification')

  return (
    <SectionCard
      id="money-heading"
      title="Money"
      // prd.md §11: the security deposit is a refundable liability held
      // against the booking, not revenue. Said once here rather than under
      // the inset on every booking.
      hint="The security deposit is collected at check-in and held apart from the total — never counted as revenue. It is released after the unit has been inspected."
    >
      <ul className="grid gap-sm">
        {booking.lines.map((entry, index) => (
          <li key={`${entry.type}-${index}`} className="flex items-baseline justify-between gap-lg">
            <span className="text-body-sm text-muted-foreground">{entry.description}</span>
            <span className="text-body-sm text-foreground tabular-nums">
              {formatCents(entry.amount)}
            </span>
          </li>
        ))}
      </ul>

      {/* The discount's own line is already among the lines above; this is the
          why, which never appears on anything the guest reads. */}
      {booking.discount ? (
        <p className="mt-md text-caption text-muted-foreground">
          Discounted {describeDiscount(booking.discount)}
        </p>
      ) : null}

      <div className="mt-lg flex items-baseline justify-between gap-lg border-t border-divider pt-lg">
        <span className="text-body-md text-muted-foreground">Total</span>
        <span className="text-display-xs text-foreground tabular-nums">
          BND {formatCents(booking.total)}
        </span>
      </div>

      <div className="mt-md flex items-baseline justify-between gap-lg">
        <span className="text-body-sm text-muted-foreground">Paid</span>
        <span className="text-body-sm text-foreground tabular-nums">
          BND {formatCents(balance.paid)}
        </span>
      </div>

      {/* Said plainly, and only when there is something to say. A settled
          booking gets no "Outstanding 0.00" line — a zero on a money screen
          invites a second look, and there is nothing there to find. */}
      {balance.state !== 'settled' ? (
        <div className="mt-xs flex items-baseline justify-between gap-lg">
          <span className="text-body-sm-strong text-foreground">
            {balance.state === 'overpaid' ? 'Overpaid by' : 'Outstanding'}
          </span>
          <span className="text-body-sm-strong text-foreground tabular-nums">
            BND {formatCents(Math.abs(balance.outstanding))}
          </span>
        </div>
      ) : null}

      {awaiting ? (
        <p className="mt-xs text-caption text-muted-foreground">
          A transfer is awaiting verification. It does not count towards what has been paid until
          someone has checked the bank.
        </p>
      ) : null}

      {/* An overpayment is not settled here either. prd.md §9.6 keeps money
          movement out of this system and N5 is open, so the card names the
          figure and stops. */}
      {balance.state === 'overpaid' ? (
        <p className="mt-xs text-caption text-muted-foreground">
          More has been taken than this booking is worth. Refunds are settled outside the system.
        </p>
      ) : null}

      {mayRecordPayment && canSettle(balance) && !awaiting ? (
        <RecordPayment
          bookingId={booking.id}
          reference={booking.reference}
          outstanding={balance.outstanding}
        />
      ) : null}

      {/* Never summed into the total. prd.md §11: the security deposit is a
            refundable liability held against the booking, not revenue, and
            folding it in would misstate both the price and the deposit ledger. */}
      <SecurityDepositInset
        reference={booking.reference}
        quoted={booking.securityDeposit}
        deposit={deposit}
      />
    </SectionCard>
  )
}

/* ── A labelled readout ────────────────────────────────────────────────── */

function Field({
  label,
  value,
  hint,
  mono,
  figures,
  href,
}: {
  label: string
  value: string
  hint?: string
  /** References and codes — Geist Mono, per design.md §Typography. */
  mono?: boolean
  /** Tabular figures without the mono face, for numbers that are not codes. */
  figures?: boolean
  /** Makes the value actionable — today only `tel:` on the guest's number. */
  href?: string
}) {
  return (
    <div>
      <dt className="micro-label text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-xxs text-body-md text-foreground',
          mono && 'font-mono tabular-nums',
          figures && 'tabular-nums',
        )}
      >
        {/* Underline on hover rather than a colour: the operations surfaces are
            monochrome, and a link here is a convenience on a readout, not the
            screen's action (design.md §Color roles). */}
        {href ? (
          <a href={href} className="underline-offset-4 hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
      {hint ? <dd className="mt-xxs text-caption text-muted-foreground">{hint}</dd> : null}
    </div>
  )
}

/* ── The payments ──────────────────────────────────────────────────────── */

/**
 * Every payment against this booking, and the actions still open on it.
 *
 * A payment does not get its own URL. design.md gives three reasons a record
 * becomes a route — staff send each other links, it accretes sections across
 * phases, its edit form needs a screen — and a payment meets none of them. The
 * same paragraph names the verification queue as a screen that needs somewhere
 * to point, and this is that somewhere.
 *
 * The queue's actions render here too, so a clerk who arrived from the
 * arrivals list does not have to go and find the queue to act on what is in
 * front of them.
 */
function PaymentsSection({
  payments,
  pending,
  mayVerify,
  actorNames,
  booking,
  slips,
  mayAttachSlip,
  maySeeSlip,
}: {
  payments: readonly Payment[]
  pending: Payment | undefined
  mayVerify: boolean
  actorNames: ReadonlyMap<string, string>
  booking: Booking
  /** The slips on file, at most one live per payment. */
  slips: readonly Document[]
  mayAttachSlip: boolean
  maySeeSlip: boolean
}) {
  const slipFor = new Map(slips.map((slip) => [slip.paymentId ?? '', slip]))

  return (
    <SectionCard id="payments-heading" title="Payments" className="mt-xl">
      {payments.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          No payment recorded against this booking.
        </p>
      ) : (
        <ul className="grid gap-lg">
          {/* Each row's headline sits `sm` clear of the metadata under it,
                which stays on its own tighter `xs` rhythm: what the payment is
                reads as one line, and what is known about it as a block below
                — not five lines evenly spaced. */}
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="grid gap-sm border-b border-divider pb-lg last:border-0 last:pb-0"
            >
              {/* Method and its state on one line, with the amount opposite:
                    "Cash, verified, 200.00" is how the row is read aloud, so
                    the chip belongs beside the method rather than on a line of
                    its own underneath it. */}
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <span className="flex flex-wrap items-center gap-sm">
                  <span className="text-body-md text-foreground">
                    {PAYMENT_METHOD_LABELS[payment.method]}
                  </span>
                  <Badge tone={payment.status === 'verified' ? 'positive' : 'warning'}>
                    {payment.status === 'verified' ? 'Verified' : 'Awaiting verification'}
                  </Badge>
                  {payment.matchKind === 'manual' ? (
                    <Badge tone="neutral">Matched by hand</Badge>
                  ) : null}
                </span>
                <span className="text-body-md-strong text-foreground tabular-nums">
                  BND {formatCents(payment.amount ?? payment.due)}
                </span>
              </div>

              <div className="grid gap-xs">
                {payment.verifiedAt ? (
                  <p className="text-caption text-muted-foreground">
                    {payment.method === 'cash' ? 'Collected by ' : 'Verified by '}
                    {payment.verifiedBy
                      ? (actorNames.get(payment.verifiedBy) ?? 'a former staff member')
                      : 'the system'}{' '}
                    on {formatTimestamp(payment.verifiedAt)}
                  </p>
                ) : (
                  <p className="text-caption text-muted-foreground">
                    Raised {formatTimestamp(payment.createdAt)}
                  </p>
                )}

                {/* Only shown when it differs — the ordinary case is that the
                    customer quoted the booking reference and there is nothing
                    to say about it. Directly under who verified it, because it
                    is the second half of the same fact: what the bank showed
                    them. The sender and the reference are badges rather than
                    run-in text, so the two things a clerk compares against the
                    statement stand apart from the sentence around them — a 6px
                    rectangle, never a capsule (design.md §Geometry). */}
                {payment.observedSender || payment.observedReference ? (
                  <div className="flex flex-wrap items-center gap-xs text-caption text-muted-foreground">
                    <span>Bank showed</span>
                    {payment.observedSender ? (
                      <Badge tone="neutral">{payment.observedSender}</Badge>
                    ) : null}
                    {payment.observedReference ? (
                      <Badge tone="neutral" className="font-mono">
                        {payment.observedReference}
                      </Badge>
                    ) : null}
                    {payment.observedOn ? (
                      <span>on {formatStayDate(payment.observedOn)}</span>
                    ) : null}
                  </div>
                ) : null}

                {payment.amountOverrideReason ? (
                  <p className="text-body-sm text-copy">“{payment.amountOverrideReason}”</p>
                ) : null}
                {payment.matchReason ? (
                  <p className="text-body-sm text-copy">“{payment.matchReason}”</p>
                ) : null}

                {/* The slip, which used to be the words "no slip on file" on
                    every row. prd.md §10.4 keeps it evidence rather than
                    verification — staff still check the bank — so it sits under
                    the payment as a record, not beside the Verify button as a
                    thing to read before confirming. Cash has no slip to attach,
                    and the row says nothing rather than offering a control that
                    would be refused. */}
                {payment.method === 'bank_transfer' ? (
                  <SlipLine
                    payment={payment}
                    slip={slipFor.get(payment.id)}
                    bookingId={booking.id}
                    mayAttach={mayAttachSlip}
                    maySee={maySeeSlip}
                    actorNames={actorNames}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending && mayVerify ? (
        <div className="mt-lg border-t border-divider pt-lg">
          <PaymentActions
            paymentId={pending.id}
            bookingReference={booking.reference}
            guestName={booking.guestName}
            due={pending.due}
          />
        </div>
      ) : null}
    </SectionCard>
  )
}
