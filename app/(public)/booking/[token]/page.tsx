import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
import { QuoteLines } from '@/components/quote-lines'
import { getBookingByAccessToken } from '@/lib/db/public-bookings'
import { readPropertySettings } from '@/lib/db/settings'
import { formatStayDate, formatStayRange, nightsBetween } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'
import { amountDueFor, CLOSED_REASONS, publicStageOf } from '@/lib/domain/public-booking'

import { TransferInstructions } from './transfer-instructions'

export const metadata: Metadata = {
  title: 'Your booking — Palm Villa',
  // A page about one person's booking has no business in a search index.
  robots: { index: false, follow: false },
}

/**
 * A customer's own booking, reached by the private link (capability A4, and
 * the display half of A5).
 *
 * There is no session behind this page — customers have no accounts
 * (architecture.md §3) — so the token in the URL is the whole control. It is
 * checked for shape before it reaches a query, and a malformed token and an
 * unknown one both render the same 404, so somebody guessing learns nothing
 * from the difference.
 *
 * What it shows depends on where the booking has got to, and the four stages
 * are the customer's rather than the property's: the business is waiting on
 * them, they are waiting on the business, it is settled, or it is over.
 *
 * **There is no countdown**, and that is N7 answered by the client on 10
 * September 2026: a unit is held indefinitely, until somebody checks. prd.md
 * §9.3 spells out the consequence for this screen — a timer the system does
 * not enforce is a promise it does not keep — so the page says the unit is
 * held until the transfer is confirmed, which is exactly what happens.
 */
export const dynamic = 'force-dynamic'

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const booking = await getBookingByAccessToken(token)

  if (!booking) {
    notFound()
  }

  const stage = publicStageOf(booking.status)
  const due = amountDueFor(booking)
  const settings = await readPropertySettings()

  return (
    <section aria-labelledby="booking-heading" className="bg-card px-xl py-3xl">
      <div className="mx-auto w-full max-w-[720px]">
        <p className="micro-label text-accent-foreground">Your booking</p>
        <h1
          id="booking-heading"
          className="mt-md font-display text-display-md text-foreground sm:text-display-lg"
        >
          {stage === 'awaiting_transfer'
            ? 'Almost done'
            : stage === 'checking'
              ? 'Thank you'
              : stage === 'confirmed'
                ? 'You are booked'
                : 'This booking is closed'}
        </h1>

        <p className="mt-md text-body-lg text-copy">
          Reference <span className="font-mono text-foreground">{booking.reference}</span>
        </p>

        {stage === 'awaiting_transfer' ? (
          <TransferInstructions
            token={token}
            reference={booking.reference}
            amount={due.cents}
            kind={due.kind}
            total={booking.total}
            accounts={settings.bankAccounts}
          />
        ) : null}

        {stage === 'checking' ? (
          <Callout tone="positive" className="mt-xl">
            We have your booking and are checking for the transfer. Once we see it, your unit is
            confirmed — we will call or message you on the number you gave us.
          </Callout>
        ) : null}

        {stage === 'confirmed' ? (
          <Callout tone="positive" className="mt-xl">
            Your booking is confirmed.{' '}
            {booking.stream === 'short_stay'
              ? `The BND ${formatCents(booking.total)} for the stay is settled when you arrive.`
              : 'Show this reference at the gate.'}
          </Callout>
        ) : null}

        {stage === 'closed' ? (
          <Callout tone="negative" className="mt-xl">
            {CLOSED_REASONS[booking.status] ?? 'This booking is no longer live.'} If that is not
            what you expected, please call us.
          </Callout>
        ) : null}

        <Card className="mt-xl">
          <p className="micro-label text-muted-foreground">What you booked</p>

          <dl className="mt-md grid gap-md sm:grid-cols-2">
            <Detail
              label={booking.stream === 'day_pass' ? 'Day pass' : 'Unit'}
              value={
                booking.stream === 'day_pass'
                  ? booking.dayPass
                    ? formatStayDate(booking.dayPass.date)
                    : 'Date not recorded'
                  : (booking.stay?.unitRef ?? 'To be assigned')
              }
            />
            <Detail
              label={booking.stream === 'day_pass' ? 'Guests' : 'Dates'}
              value={
                booking.stream === 'day_pass'
                  ? `${booking.dayPass?.headcount ?? booking.chargeableGuests} people`
                  : booking.stay
                    ? `${formatStayRange(booking.stay.range.start, booking.stay.range.end)} · ${nightsBetween(
                        booking.stay.range.start,
                        booking.stay.range.end,
                      )} nights`
                    : 'Not recorded'
              }
            />
            <Detail label="Name" value={booking.guestName} />
            <Detail
              label="Car"
              value={booking.noVehicle ? 'Arriving without a car' : booking.vehicles.join(', ')}
            />
          </dl>

          <QuoteLines lines={booking.lines} total={booking.total} />

          {booking.securityDeposit > 0 ? (
            <p className="mt-md text-caption text-muted-foreground">
              Plus a refundable BND {formatCents(booking.securityDeposit)} security deposit, which
              comes back to you after your stay.
            </p>
          ) : null}
        </Card>

        <p className="mt-lg text-caption text-muted-foreground">
          Keep this page — it is the link to your booking. Anyone with it can see this booking, so
          do not post it publicly.
        </p>
      </div>
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="micro-label text-muted-foreground">{label}</dt>
      <dd className="mt-xxs text-body-md text-foreground">{value}</dd>
    </div>
  )
}
