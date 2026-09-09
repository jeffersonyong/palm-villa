import { Check } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
import { QuoteLines } from '@/components/quote-lines'
import { getBookingByAccessToken } from '@/lib/db/public-bookings'
import { readPropertySettings } from '@/lib/db/settings'
import { balanceOf } from '@/lib/domain/balance'
import { formatStayDate, formatStayRange, nightsBetween } from '@/lib/domain/dates'
import { formatCents, type Cents } from '@/lib/domain/money'
import {
  CLOSED_REASONS,
  publicStageOf,
  transferPlanFor,
  type PublicStage,
} from '@/lib/domain/public-booking'

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
  const plan = transferPlanFor(booking)
  const settings = await readPropertySettings()
  const chip = chipFor(stage)

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

        {/* Whose turn it is, in the same words and the same hue the
            confirmation email uses — a customer who reads both should not have
            to work out that they describe one booking. `closed` gets none: its
            callout already names the reason, and a chip saying "Closed" above
            it would be the same sentence twice. */}
        {chip ? (
          <p className="mt-md">
            <Badge tone={chip.tone}>
              {chip.tone === 'positive' ? (
                <Check aria-hidden className="size-3" />
              ) : (
                <span aria-hidden className="size-1.5 rounded-full bg-warning" />
              )}
              {chip.label}
            </Badge>
          </p>
        ) : null}

        <p className="mt-md text-body-lg text-copy">
          Reference <span className="font-mono text-foreground">{booking.reference}</span>
        </p>

        {stage === 'awaiting_transfer' ? (
          <TransferInstructions
            token={token}
            reference={booking.reference}
            depositOnly={plan}
            everything={transferPlanFor(booking, 'everything')}
            accounts={settings.bankAccounts}
          />
        ) : null}

        {stage === 'checking' ? (
          <Callout tone="positive" className="mt-xl">
            We have your booking and are checking for the transfer. Once we verify it, we will send
            you an email confirmation and a QR code for entry.
          </Callout>
        ) : null}

        {stage === 'confirmed' ? (
          <Callout tone="positive" className="mt-xl">
            Your booking is confirmed.{' '}
            {booking.stream === 'short_stay'
              ? arrivalSentence(booking)
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

/** The status chip's tone and words, or null where the callout says it. */
function chipFor(stage: PublicStage): { tone: 'warning' | 'positive'; label: string } | null {
  if (stage === 'awaiting_transfer') {
    return { tone: 'warning', label: 'Waiting for your transfer' }
  }

  if (stage === 'checking') {
    return { tone: 'warning', label: 'Checking for your transfer' }
  }

  return stage === 'confirmed' ? { tone: 'positive', label: 'Confirmed' } : null
}

/**
 * What a confirmed guest still owes when they arrive.
 *
 * `balanceOf` rather than `total`, which is what this said until capability
 * A8: a guest who chose "everything now" has already paid for the stay, and
 * telling them the whole figure is due on arrival is a phone call to the desk
 * — or a guest who pays twice. The confirmation email states the same figure
 * from the same function, so the two surfaces cannot disagree about money.
 */
function arrivalSentence(booking: { total: Cents; paid: Cents }): string {
  const { outstanding } = balanceOf(booking.total, booking.paid)

  return outstanding > 0
    ? `The BND ${formatCents(outstanding)} for the stay is settled when you arrive.`
    : 'Everything is settled — there is nothing to pay on arrival.'
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="micro-label text-muted-foreground">{label}</dt>
      <dd className="mt-xxs text-body-md text-foreground">{value}</dd>
    </div>
  )
}
