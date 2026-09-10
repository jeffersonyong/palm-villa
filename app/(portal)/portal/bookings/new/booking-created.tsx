import Link from 'next/link'

import { PageHeader } from '@/components/portal/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Notice } from '@/components/ui/notice'
import { formatStayDates, nightsBetween } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

import type { WalkInBookingState } from './actions'

/**
 * What the desk sees the moment a booking exists.
 *
 * It is a **screen**, not a panel on the form's screen. It was a 520px card
 * left sitting under the page header, the date controls and the four
 * availability tiles that had produced it, and the question it invited was
 * "what am I looking at — am I back on a list?" rather than "here is the
 * reference to read out". A confirmation that shares a screen with the search
 * that preceded it does not read as an outcome; it reads as one more result.
 * So the chrome is gone: this replaces the whole screen body.
 *
 * The reference is the hero because it is the only thing here that leaves the
 * building — it is what the guest quotes at the gate, and for a transfer it is
 * what the payment is matched on. Everything under it is the receipt: the
 * facts the clerk would otherwise read back off the form, and — since the
 * deposit moved from the door to the booking (capability B16) — what was
 * actually taken, in two lines that keep the two kinds of money apart.
 *
 * It stays in memory rather than becoming a route with the reference in the
 * URL. A `?created=PV-5428` screen could be reached for any booking by typing
 * one, and would then say "Booking confirmed" about a stay that ended weeks
 * ago. The booking already has a real URL for looking at later — this screen
 * only ever tells the truth immediately after the write that produced it.
 */

/** The half of the action's state this screen exists to render. */
type CreatedBooking = NonNullable<WalkInBookingState['created']>

export function BookingCreated({ created }: { created: CreatedBooking }) {
  const isTransfer = created.paymentMethod === 'bank_transfer'
  const takesDeposit = !created.depositWaived && created.securityDeposit > 0
  const nights = nightsBetween(created.checkIn, created.checkOut)

  return (
    // Narrower than the form's 1120px. A confirmation is one column of facts
    // and the width should say so — a receipt stretched across a desk-wide
    // screen reads as a page that failed to fill itself.
    <div className="max-w-[560px]">
      <PageHeader
        title={isTransfer ? 'Booking created' : 'Booking confirmed'}
        meta={
          <Badge tone={isTransfer ? 'warning' : 'positive'}>
            {isTransfer ? 'Awaiting payment' : 'Confirmed'}
          </Badge>
        }
        description={
          isTransfer
            ? 'The guest quotes this reference in the transfer description — it is how the payment is matched, and what they quote at the gate.'
            : 'Give the guest this reference — it is what they quote at the gate.'
        }
      />

      <Card className="mt-xl">
        <p className="micro-label text-muted-foreground">Reference</p>
        <p className="mt-xs font-mono text-display-sm text-foreground">{created.reference}</p>

        <dl className="mt-lg grid gap-sm border-t border-divider pt-lg">
          <ReceiptRow label="Unit" value={created.unitRef} />
          {/* "Dates", matching the booking screen's own field: the two money
              rows below name the deposit and the stay, and a third row also
              called "Stay" would make one of the three read as a mistake. */}
          <ReceiptRow
            label="Dates"
            value={`${formatStayDates(created.checkIn, created.checkOut)} · ${nights} ${
              nights === 1 ? 'night' : 'nights'
            }`}
          />
          {/* Two kinds of money, two lines, each saying what happened to it.
              The deposit secures the booking and sits on its own ledger; the
              stay is revenue and is either paid, awaited, or settled on
              arrival. A waived booking says so rather than printing 0.00 — a
              zero on a receipt invites a second look at money that was never
              due. */}
          <ReceiptRow
            label="Security deposit"
            value={
              created.depositWaived
                ? 'Waived'
                : !takesDeposit
                  ? 'None quoted'
                  : isTransfer
                    ? `BND ${formatCents(created.securityDeposit)} awaited`
                    : `BND ${formatCents(created.securityDeposit)} held`
            }
          />
          <ReceiptRow
            label="Stay"
            value={
              created.payStayNow
                ? isTransfer
                  ? `BND ${formatCents(created.total)} awaited`
                  : `BND ${formatCents(created.total)} paid`
                : `BND ${formatCents(created.total)} on arrival`
            }
          />
        </dl>
      </Card>

      {isTransfer ? (
        <Notice placement="page" className="mt-md">
          The unit is held for this booking now. It stays held until someone confirms the transfer
          landed, so this booking needs working off the verification queue.
          {takesDeposit && created.payStayNow
            ? ' The deposit and the stay are two rows there — confirm each at its own figure, from the one transfer.'
            : ''}
        </Notice>
      ) : null}

      {!created.payStayNow ? (
        <Notice placement="page" className="mt-md">
          The BND {formatCents(created.total)} for the stay is settled when the guest arrives.
          Record it from the booking then — the deposit is already in.
        </Notice>
      ) : null}

      <div className="mt-xl flex flex-wrap items-center gap-sm">
        {/* A full reload on purpose: it clears the `useActionState` state and
            re-renders the availability counts for the next booking, which a
            client-side navigation back to this same route would not. The lint
            rule cannot see that intent — it only sees an anchor to a known
            page — so it is silenced here rather than obeyed. */}
        {/* eslint-disable @next/next/no-html-link-for-pages */}
        <Button asChild>
          <a href="/portal/bookings/new">Add another booking</a>
        </Button>
        {/* eslint-enable @next/next/no-html-link-for-pages */}

        <Button asChild variant="tertiary">
          <Link href={`/portal/bookings/${created.reference}`}>View booking</Link>
        </Button>

        {isTransfer ? (
          <Button asChild variant="tertiary">
            <Link href="/portal/payments">Open the verification queue</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * One line of the receipt. Label mute, value ink — design.md's two-step
 * ladder, the same pairing the quote summary uses one screen earlier, so the
 * figures a clerk read before submitting are shaped the same after.
 */
function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-lg">
      <dt className="text-body-md text-muted-foreground">{label}</dt>
      <dd className="text-body-md-strong text-foreground tabular-nums">{value}</dd>
    </div>
  )
}
