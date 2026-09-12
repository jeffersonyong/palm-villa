import { Check } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
import { QuoteLines } from '@/components/quote-lines'
import { getDepositByBookingId } from '@/lib/db/deposits'
import { listDocumentsForBooking } from '@/lib/db/documents'
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

import { SendAFile } from './send-a-file'
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
  // Both kinds in one read: they were two requests differing in one filter.
  const [settings, deposit, documents] = await Promise.all([
    readPropertySettings(),
    getDepositByBookingId(booking.id),
    listDocumentsForBooking(booking.id, ['payment_slip', 'identity']),
  ])

  const slips = documents.filter((document) => document.kind === 'payment_slip')
  const identityDocuments = documents.filter((document) => document.kind === 'identity')
  const chip = chipFor(stage)

  // Somebody has looked at the bank and what arrived was less than the
  // deposit. Without this the page keeps saying "we are checking for the
  // transfer" after it has been checked, which is the one sentence on this
  // surface that would now be false — and the customer is the only person who
  // can put it right.
  const shortfall = deposit !== null && deposit.collectedAt !== null ? deposit.shortfall : 0

  // What the guest may send, and what we already hold (capabilities A6, A7).
  //
  // Neither is offered until the guest has said they transferred, and the two
  // reasons are different. A **slip** cannot be filed before then because there
  // is no deposit or payment row to be evidence of — asking for proof of
  // something they have not done yet reads as a muddle. An **IC** could be
  // asked for earlier and deliberately is not: the screen before this one has
  // one job, which is to get the transfer made, and a second upload box beside
  // the bank details competes with it. Once they are waiting on us, they have a
  // moment, and that is where the asking goes.
  //
  // The IC then stays available through `confirmed`, because prd.md §13 wants
  // it for registration and a guest who sends it before arriving is a guest the
  // desk does not have to chase at the door.
  //
  // `listDocumentsForBooking` excludes what has expired as well as what was
  // removed, so a file past its retention date stops being reported as held —
  // which is the honest answer, because it is gone.
  const slipOnFileSince = slips[0]?.uploadedAt ?? null
  const identityOnFileSince = identityDocuments[0]?.uploadedAt ?? null
  const maySendSlip = stage === 'checking'
  const maySendIdentity = stage === 'checking' || stage === 'confirmed'

  /**
   * The two steps, and which one the customer is on.
   *
   * This page has always been a two-step flow — the stage is derived from the
   * booking's own state, which is why it survives the customer closing the tab,
   * transferring in their banking app and coming back through the emailed link
   * an hour later. What it did not do was *look* like one, and the cost of that
   * was concentrated in one word: step two opened with "Thank you", which reads
   * as a full stop, so the ask below it arrived after the page had already told
   * them to relax.
   *
   * So the steps are named up front, before the transfer is made, and ticked
   * off as they are done. Nothing new is stored: this is a reading of `stage`
   * and what is already on file.
   *
   * **"Make the transfer" rather than "Transfer the deposit"** because a guest
   * who chose to settle the stay up front is sending both (prd.md §10.3), and a
   * step that names the smaller of the two amounts would be wrong for them.
   */
  const identityHeld = identityOnFileSince !== null
  const steps: readonly Step[] | null =
    stage === 'awaiting_transfer'
      ? [
          { label: 'Make the transfer', state: 'current' },
          { label: 'Send us your IC', state: 'todo' },
        ]
      : stage === 'checking'
        ? [
            { label: 'Make the transfer', state: 'done' },
            { label: 'Send us your IC', state: identityHeld ? 'done' : 'current' },
          ]
        : null

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
              ? // "Thank you" is the right word only once there is nothing left
                // to ask for. While the IC is still wanted it is the wrong one:
                // it closes the page while the useful thing is still below it.
                identityHeld
                ? 'Thank you'
                : 'One more thing'
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

        {steps ? <NextSteps steps={steps} /> : null}

        {stage === 'awaiting_transfer' ? (
          <TransferInstructions
            token={token}
            reference={booking.reference}
            depositOnly={plan}
            everything={transferPlanFor(booking, 'everything')}
            accounts={settings.bankAccounts}
          />
        ) : null}

        {stage === 'checking' && shortfall > 0 && deposit ? (
          <Callout tone="negative" placement="page" className="mt-xl">
            <span>
              We have received BND {formatCents(deposit.amount)} of the BND{' '}
              {formatCents(deposit.quoted)} security deposit, so BND {formatCents(shortfall)} is
              still outstanding. Your unit is held, and the booking is confirmed once the rest
              arrives — send it to the same account, quoting {booking.reference}, or call us if
              something has gone wrong.
            </span>
          </Callout>
        ) : null}

        {/* The IC leads, and the slip follows it. They used to be the other
            way round, which put the optional one first: the slip is a
            convenience — the bank app is the check either way (prd.md §10.4) —
            while the IC is the thing that saves the guest a wait at the desk
            and the desk a chase. The one being asked for goes at the top. */}
        {maySendIdentity ? (
          <SendAFile
            token={token}
            kind="identity"
            marker="A"
            title="Send us your IC"
            description="We need a copy of the lead guest's IC to register the stay. Sending it now saves doing it at the desk when you arrive."
            onFileSince={identityOnFileSince}
          />
        ) : null}

        {maySendSlip ? (
          <SendAFile
            token={token}
            kind="payment_slip"
            marker="B"
            title="Send us your transfer slip"
            description="Your bank transfer slip will help us verify your transfer faster."
            onFileSince={slipOnFileSince}
          />
        ) : null}

        {/* Demoted, and moved below the asks. It is reassurance rather than an
            instruction — a positive callout above the uploads announced the
            page was finished with them, which is exactly the reading that made
            the IC easy to miss. */}
        {stage === 'checking' && shortfall === 0 ? (
          <p className="mt-xl text-body-sm text-muted-foreground">
            We have your booking and are checking for the transfer. Once we verify it, we will email
            your confirmation and a QR code for entry.
          </p>
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
          do not post it publicly. If you lose it, you can{' '}
          <Link className="underline hover:no-underline" href="/find-booking">
            find it again
          </Link>{' '}
          with your reference and the number you booked with.
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

/** One line of the two-step list: what it is, and whether it is behind them. */
interface Step {
  label: string
  state: 'done' | 'current' | 'todo'
}

/**
 * What happens next, in two lines.
 *
 * Presentational only — every step's state is read from the booking, so there
 * is no wizard state to get out of step with the database and nothing breaks
 * when the customer comes back to this link tomorrow.
 *
 * **No numbered circles.** design.md reserves `full` for avatars and status
 * dots, so the marker is a monospace numeral that gives way to a tick once the
 * step is behind them — which also means the two states differ by more than
 * colour, for a reader who cannot see the difference in hue.
 *
 * The text ladder is design.md's: ink for the step being asked for, mute for
 * one not reached yet and for one already done. Only one line on the page is at
 * full strength, and it is the one with something to do.
 */
function NextSteps({ steps }: { steps: readonly Step[] }) {
  return (
    <div className="mt-lg">
      <p className="micro-label text-muted-foreground">What happens next</p>

      <ol className="mt-sm grid gap-xs">
        {steps.map((step, index) => (
          <li
            key={step.label}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="flex items-center gap-sm"
          >
            <span aria-hidden className="flex w-4 shrink-0 justify-center">
              {step.state === 'done' ? (
                <Check className="size-3.5 text-positive-deep" />
              ) : (
                <span className="text-caption text-muted-foreground tabular-nums">{index + 1}</span>
              )}
            </span>

            <span
              className={
                step.state === 'current'
                  ? 'text-body-sm-strong text-foreground'
                  : 'text-body-sm text-muted-foreground'
              }
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
