import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'

import { BookingStatusBadge } from '@/components/portal/booking-status-badge'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { SectionCard } from '@/components/portal/section-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listAuditEvents, type AuditEvent } from '@/lib/db/audit'
import { getBookingByReference, type Booking } from '@/lib/db/bookings'
import { listBookingNotes } from '@/lib/db/notes'
import { listPaymentsForBooking, type Payment } from '@/lib/db/payments'
import { listStaff } from '@/lib/db/staff'
import { allowedEvents, canAmend } from '@/lib/domain/booking-state'
import { formatStayDate, formatTimestamp, nightsBetween } from '@/lib/domain/dates'
import { balanceOf, canSettle } from '@/lib/domain/balance'
import { describeDiscount } from '@/lib/domain/discount'
import { formatCents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS } from '@/lib/domain/payment'
import { formatVehicles } from '@/lib/domain/vehicle'
import { cn } from '@/lib/utils'

import { PaymentActions } from '../../payments/payment-actions'

import { BookingActions } from './booking-actions'
import { BookingHistory } from './booking-history'
import { BookingNotes } from './booking-notes'
import { RecordPayment } from './record-payment'

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
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params

  return { title: decodeURIComponent(reference).toUpperCase() }
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { reference } = await params
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

  const [bookingEvents, payments, staff, notes] = await Promise.all([
    listAuditEvents('booking', booking.id),
    listPaymentsForBooking(booking.id),
    listStaff(),
    listBookingNotes(booking.id),
  ])

  // Payment events are typed against the payment, not the booking, so a trail
  // built from `listAuditEvents('booking', ...)` alone would show this booking
  // reaching `confirmed` with no record of what was banked. Payments per
  // booking are few, so fetching each one's events and merging is cheap and
  // keeps `entity_type` honest — a payment is its own entity, and the F4 audit
  // screen will want to filter on it.
  const paymentEvents = await Promise.all(
    payments.map((payment) => listAuditEvents('payment', payment.id)),
  )

  const events: readonly AuditEvent[] = [...bookingEvents, ...paymentEvents.flat()].sort((a, b) =>
    a.at < b.at ? 1 : a.at > b.at ? -1 : 0,
  )

  const actorNames = new Map(staff.map((account) => [account.id, account.displayName]))
  const pending = payments.find((payment) => payment.status === 'pending_verification')
  const mayVerify = hasPermission(actor.permissions, 'payment.verify')

  const mayAmend = canAmend(booking.status) && hasPermission(actor.permissions, 'booking.amend')
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
            {mayAmend ? (
              <Button asChild variant="tertiary">
                <Link href={`/portal/bookings/${booking.reference}/amend`}>
                  <Pencil aria-hidden />
                  Amend
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
            ? 'This guest has checked in, so the booking can no longer be amended here.'
            : 'This booking is closed. Its details are kept as a record and cannot be changed.'}
        </p>
      ) : null}

      <div className="mt-xl grid gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GuestAndStaySummary booking={booking} />
        <MoneySummary
          booking={booking}
          payments={payments}
          mayRecordPayment={hasPermission(actor.permissions, 'payment.record_cash')}
        />
      </div>

      <PaymentsSection
        payments={payments}
        pending={pending}
        mayVerify={mayVerify}
        actorNames={actorNames}
        booking={booking}
      />

      {/* Above the history, below the money. The history is the system's
          account of what happened; this is the staff's, and the two read
          better in that order — what people said, then what was recorded. */}
      <SectionCard id="notes-heading" title="Notes" className="mt-xl">
        <BookingNotes bookingId={booking.id} notes={notes} actorNames={actorNames} />
      </SectionCard>

      <SectionCard id="history-heading" title="History" className="mt-xl">
        <BookingHistory events={events} actorNames={actorNames} />
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
function GuestAndStaySummary({ booking }: { booking: Booking }) {
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
          : 'Taken before a registration was required — add it when amending.'
      }
    />
  )
}

/* ── The money ─────────────────────────────────────────────────────────── */

function MoneySummary({
  booking,
  payments,
  mayRecordPayment,
}: {
  booking: Booking
  payments: readonly Payment[]
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
    <SectionCard id="money-heading" title="Money">
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
      <Card surface="inset" className="mt-lg">
        <div className="flex items-baseline justify-between gap-lg">
          <span className="text-body-sm text-muted-foreground">Security deposit</span>
          <span className="text-body-sm text-foreground tabular-nums">
            BND {formatCents(booking.securityDeposit)}
          </span>
        </div>
        <p className="mt-xs text-caption text-muted-foreground">
          Refundable, collected on arrival and released after inspection. Held separately from the
          total above.
        </p>
      </Card>
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
}: {
  payments: readonly Payment[]
  pending: Payment | undefined
  mayVerify: boolean
  actorNames: ReadonlyMap<string, string>
  booking: Booking
}) {
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
                    Raised {formatTimestamp(payment.createdAt)} · no slip on file
                  </p>
                )}

                {/* Only shown when it differs — the ordinary case is that the
                      customer quoted the booking reference and there is nothing
                      to say about it. */}
                {payment.observedSender || payment.observedReference ? (
                  <p className="text-caption text-muted-foreground">
                    Bank showed{' '}
                    {payment.observedSender ? <strong>{payment.observedSender}</strong> : null}
                    {payment.observedSender && payment.observedReference ? ' · ' : null}
                    {payment.observedReference ? (
                      <span className="font-mono">{payment.observedReference}</span>
                    ) : null}
                    {payment.observedOn ? ` on ${formatStayDate(payment.observedOn)}` : null}
                  </p>
                ) : null}

                {payment.amountOverrideReason ? (
                  <p className="text-body-sm text-copy">“{payment.amountOverrideReason}”</p>
                ) : null}
                {payment.matchReason ? (
                  <p className="text-body-sm text-copy">“{payment.matchReason}”</p>
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
