import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'

import { BookingStatusBadge } from '@/components/portal/booking-status-badge'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listAuditEvents, type AuditEvent } from '@/lib/db/audit'
import { getBookingByReference, type Booking } from '@/lib/db/bookings'
import { listPaymentsForBooking, type Payment } from '@/lib/db/payments'
import { listStaff } from '@/lib/db/staff'
import { allowedEvents, canAmend } from '@/lib/domain/booking-state'
import { formatStayDate, formatTimestamp, nightsBetween } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS } from '@/lib/domain/payment'

import { PaymentActions } from '../../payments/payment-actions'

import { BookingActions } from './booking-actions'
import { BookingHistory } from './booking-history'

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

  const [bookingEvents, payments, staff] = await Promise.all([
    listAuditEvents('booking', booking.id),
    listPaymentsForBooking(booking.id),
    listStaff(),
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
        description={
          <span className="flex flex-wrap items-center gap-sm">
            <BookingStatusBadge status={booking.status} />
            <span>
              {booking.guestName} · {booking.guestPhone}
            </span>
          </span>
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
        <StaySummary booking={booking} />
        <MoneySummary booking={booking} payments={payments} />
      </div>

      <PaymentsSection
        payments={payments}
        pending={pending}
        mayVerify={mayVerify}
        actorNames={actorNames}
        booking={booking}
      />

      <section aria-labelledby="history-heading" className="mt-xl">
        <h2 id="history-heading" className="micro-label text-muted-foreground">
          History
        </h2>
        <Card className="mt-md">
          <BookingHistory events={events} actorNames={actorNames} />
        </Card>
      </section>
    </div>
  )
}

/* ── The stay ──────────────────────────────────────────────────────────── */

function StaySummary({ booking }: { booking: Booking }) {
  const nights = nightsBetween(booking.range.start, booking.range.end)

  return (
    <section aria-labelledby="stay-heading">
      <h2 id="stay-heading" className="micro-label text-muted-foreground">
        Stay
      </h2>
      <Card className="mt-md">
        {/* Two columns, not a stack: four readouts in one card read as a panel
            of figures, and stacked they read as a form nobody can fill in. */}
        <dl className="grid gap-md sm:grid-cols-2">
          <Field label="Unit" value={booking.unitRef} mono />
          <Field
            label="Dates"
            value={`${formatStayDate(booking.range.start)} → ${formatStayDate(booking.range.end)}`}
            hint={`${nights} ${nights === 1 ? 'night' : 'nights'}`}
          />
          <Field
            label="Guests"
            value={String(booking.chargeableGuests)}
            hint={
              booking.exemptGuests > 0
                ? `plus ${booking.exemptGuests} not counted towards occupancy`
                : undefined
            }
          />
          <Field label="Vehicle" value={booking.vehicleRegistration ?? '—'} mono />
        </dl>
      </Card>
    </section>
  )
}

/* ── The money ─────────────────────────────────────────────────────────── */

function MoneySummary({ booking, payments }: { booking: Booking; payments: readonly Payment[] }) {
  // Summed from verified payments rather than stored on the booking. Nothing
  // computes a balance from it: prd.md §9.6 keeps money movement out of this
  // system, so this states what has been taken, never what is owed.
  const paid = payments
    .filter((payment) => payment.status === 'verified')
    .reduce((total, payment) => total + (payment.amount ?? 0), 0)

  const awaiting = payments.some((payment) => payment.status === 'pending_verification')

  return (
    <section aria-labelledby="money-heading">
      <h2 id="money-heading" className="micro-label text-muted-foreground">
        Money
      </h2>
      <Card className="mt-md">
        <ul className="grid gap-sm">
          {booking.lines.map((entry, index) => (
            <li
              key={`${entry.type}-${index}`}
              className="flex items-baseline justify-between gap-lg"
            >
              <span className="text-body-sm text-copy">{entry.description}</span>
              <span className="text-body-sm text-foreground tabular-nums">
                {formatCents(entry.amount)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-lg flex items-baseline justify-between gap-lg border-t border-divider pt-lg">
          <span className="text-body-md text-copy">Total</span>
          <span className="text-display-xs text-foreground tabular-nums">
            BND {formatCents(booking.total)}
          </span>
        </div>

        <div className="mt-md flex items-baseline justify-between gap-lg">
          <span className="text-body-sm text-copy">
            {awaiting ? 'Awaiting a transfer of' : 'Paid'}
          </span>
          <span className="text-body-sm text-foreground tabular-nums">
            BND {formatCents(awaiting ? booking.total : paid)}
          </span>
        </div>

        {/* Never summed into the total. prd.md §11: the security deposit is a
            refundable liability held against the booking, not revenue, and
            folding it in would misstate both the price and the deposit ledger. */}
        <Card surface="inset" className="mt-lg">
          <div className="flex items-baseline justify-between gap-lg">
            <span className="text-body-sm text-copy">Security deposit</span>
            <span className="text-body-sm text-foreground tabular-nums">
              BND {formatCents(booking.securityDeposit)}
            </span>
          </div>
          <p className="mt-xs text-caption text-muted-foreground">
            Refundable, collected on arrival and released after inspection. Held separately from the
            total above.
          </p>
        </Card>
      </Card>
    </section>
  )
}

/* ── A labelled readout ────────────────────────────────────────────────── */

function Field({
  label,
  value,
  hint,
  mono,
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
}) {
  return (
    <div>
      <dt className="micro-label text-muted-foreground">{label}</dt>
      <dd className={`mt-xxs text-body-md text-foreground ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
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
    <section aria-labelledby="payments-heading" className="mt-xl">
      <h2 id="payments-heading" className="micro-label text-muted-foreground">
        Payments
      </h2>
      <Card className="mt-md">
        {payments.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            No payment recorded against this booking.
          </p>
        ) : (
          <ul className="grid gap-lg">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="grid gap-xs border-b border-divider pb-lg last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-sm">
                  <span className="text-body-md text-foreground">
                    {PAYMENT_METHOD_LABELS[payment.method]}
                  </span>
                  <span className="text-body-md-strong text-foreground tabular-nums">
                    BND {formatCents(payment.amount ?? payment.due)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-sm">
                  <Badge tone={payment.status === 'verified' ? 'positive' : 'warning'}>
                    {payment.status === 'verified' ? 'Verified' : 'Awaiting verification'}
                  </Badge>
                  {payment.matchKind === 'manual' ? (
                    <Badge tone="neutral">Matched by hand</Badge>
                  ) : null}
                </div>

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
                  <p className="mt-xxs text-body-sm text-copy">“{payment.amountOverrideReason}”</p>
                ) : null}
                {payment.matchReason ? (
                  <p className="mt-xxs text-body-sm text-copy">“{payment.matchReason}”</p>
                ) : null}
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
      </Card>
    </section>
  )
}
