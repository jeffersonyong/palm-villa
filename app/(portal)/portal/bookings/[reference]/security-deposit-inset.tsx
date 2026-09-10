import Link from 'next/link'

import { DepositFigureTable, DepositMark, FigureRow } from '@/components/portal/deposit-figures'
import { DepositStageBadge } from '@/components/portal/deposit-stage-badge'
import { Card } from '@/components/ui/card'
import type { Deposit } from '@/lib/db/deposits'
import type { BookingStatus } from '@/lib/domain/booking-state'
import { formatTimestamp } from '@/lib/domain/dates'
import type { Cents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS } from '@/lib/domain/payment'

import { DepositActions } from '../../payments/payment-actions'
import { RecordDeposit } from './record-deposit'

/**
 * The security deposit, on the booking's Money card.
 *
 * Never summed into the total. prd.md §11 makes the deposit a refundable
 * liability held against the booking rather than revenue, and folding it in
 * would misstate both the price and the deposit ledger — which is why it sits
 * in the gray inset below the total rather than as a line in it.
 *
 * What changed with the deposits slice is that this stopped being a quote. It
 * used to read `booking.security_deposit_cents` and say "collected on arrival",
 * which was a claim about money nobody had recorded taking. Now it says which
 * of the two it is: what the booking *quotes*, and what is actually *held* —
 * with the stage, so the difference between money sitting in the safe and money
 * already given back is on the screen rather than inferred from a date.
 *
 * **"On arrival" is gone entirely, and that is prd.md §9.1** (10 September
 * 2026). The deposit is what secures a booking, so it is taken when the
 * booking is made — at the counter, or by the transfer a customer promises
 * online — and the door collects nothing: check-in refuses a booking whose
 * deposit is not in. A quote with nothing against it is therefore *owed*, not
 * scheduled, and this card is the one place it is taken.
 *
 * The inset is one of four gray panels on this screen, so it wears the
 * deposit's mark and shows the deposit screen's own table — the reasoning is
 * on `deposit-figures.tsx`. The stage chip sits on the mark's line here because
 * nothing else on the booking screen carries it.
 */

interface SecurityDepositInsetProps {
  bookingId: string
  reference: string
  /** Where the booking has got to, so a quote with nothing against it can say what that means. */
  bookingStatus: BookingStatus
  /** What the booking quotes. Shown before anything has been collected. */
  quoted: Cents
  /** Why nothing is quoted, when the deposit was waived at creation (B15). */
  waiverReason: string | null
  /** The deposit actually taken, or null while none has been recorded. */
  deposit: Deposit | null
  /** Whether this viewer may take money at the desk. */
  mayRecordDeposit: boolean
  /** Whether this viewer may say what the bank showed. */
  mayVerifyDeposit: boolean
  /** True while the booking is still waiting to be secured by it. */
  securesBooking: boolean
}

export function SecurityDepositInset({
  bookingId,
  reference,
  bookingStatus,
  quoted,
  waiverReason,
  deposit,
  mayRecordDeposit,
  mayVerifyDeposit,
  securesBooking,
}: SecurityDepositInsetProps) {
  if (!deposit) {
    return (
      <Card surface="inset" className="mt-lg">
        <DepositMark className="mb-sm" />
        {/* "Owed", not "Due at check-in". The deposit secures the booking, so
            a quote with nothing against it is money the property should
            already have — and a label naming the door was how it went
            uncollected until the guest arrived. */}
        <FigureRow label={quoted === 0 ? 'Quoted' : 'Owed'} value={quoted} />
        {/* How a deposit is held is the Money card's hint; only the exception
            is worth a sentence here. */}
        {quoted === 0 ? (
          <p className="mt-xs text-caption text-muted-foreground">
            {waiverReason ? (
              <>
                Waived when the booking was made: &ldquo;{waiverReason}&rdquo;. Nothing is collected
                against this stay.
              </>
            ) : (
              'This booking quotes no security deposit, so nothing is collected against it.'
            )}
          </p>
        ) : (
          <p className="mt-xs text-caption text-muted-foreground">
            {securesBooking
              ? 'Nothing has been taken yet. The deposit is what secures this booking.'
              : bookingStatus === 'confirmed'
                ? // A booking confirmed before the deposit moved to the booking,
                  // or one moved by hand. The door will refuse it, so the way
                  // out is named here, where the button is.
                  'Nothing has been taken yet — this booking was confirmed without it. Record the deposit before the guest is checked in; the door takes nothing.'
                : 'Nothing was taken against this stay.'}
          </p>
        )}

        {mayRecordDeposit && quoted > 0 ? (
          <RecordDeposit
            bookingId={bookingId}
            reference={reference}
            quoted={quoted}
            securesBooking={securesBooking}
          />
        ) : null}
      </Card>
    )
  }

  return (
    <DepositFigureTable
      figures={deposit.figures}
      release={deposit.release}
      className="mt-lg"
      header={<DepositMark badge={<DepositStageBadge stage={deposit.stage} />} />}
    >
      <p className="mt-md text-caption text-muted-foreground">
        {deposit.collectedAt === null ? (
          <>
            {/* Promised online and not yet checked. Worded as a wait rather
                than as money, because the property is holding nothing yet. */}
            Transfer awaited
            {deposit.promisedAt ? <> since {formatTimestamp(deposit.promisedAt)}</> : null}
          </>
        ) : (
          <>
            Taken in {PAYMENT_METHOD_LABELS[deposit.method].toLowerCase()} on{' '}
            {formatTimestamp(deposit.collectedAt)}
          </>
        )}
      </p>
      <p className="mt-xs text-caption">
        <Link
          href={`/portal/deposits/${reference}`}
          className="text-foreground underline underline-offset-2"
        >
          View the deposit
        </Link>
      </p>

      {/* The two ways an awaited deposit ends, in the order they happen.
          Both are here because the wait is displayed here: sending a clerk to
          the payments queue to answer a question this panel just asked them is
          how a transfer sits unverified for a week, and the queue is not
          where somebody looking at one booking thinks to go.

          Confirming leads, because a clerk reading "transfer awaited" has
          usually just seen it land. Cash follows as the exception — the guest
          who never sent it and arrived with notes — and it stays offered
          because the alternative a clerk would otherwise reach for is
          verifying a transfer that never arrived, which is a false entry in
          the ledger about money that changed hands a different way. The door
          refuses a promise either way, so this is where an arriving guest's
          abandoned transfer is put right. */}
      {deposit.collectedAt === null ? (
        <>
          {mayVerifyDeposit ? (
            <DepositActions
              depositId={deposit.id}
              bookingReference={reference}
              guestName={deposit.guestName}
              due={deposit.amount}
              placement="panel"
            />
          ) : null}

          {mayRecordDeposit ? (
            <RecordDeposit
              bookingId={bookingId}
              reference={reference}
              quoted={deposit.amount}
              securesBooking={securesBooking}
              fulfilsPromise
              isAlternative={mayVerifyDeposit}
            />
          ) : null}
        </>
      ) : null}
    </DepositFigureTable>
  )
}
