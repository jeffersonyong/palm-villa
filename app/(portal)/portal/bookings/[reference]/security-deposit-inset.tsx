import Link from 'next/link'

import { DepositFigureTable, DepositMark, FigureRow } from '@/components/portal/deposit-figures'
import { DepositStageBadge } from '@/components/portal/deposit-stage-badge'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { Deposit } from '@/lib/db/deposits'
import type { Document } from '@/lib/db/documents'
import { endedWithoutStay, isTerminal, type BookingStatus } from '@/lib/domain/booking-state'
import { formatTimestamp } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'
import type { Cents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS } from '@/lib/domain/payment'

import { AttachDocument } from '../../documents/attach-document'
import { DocumentRow } from '../../documents/document-row'
import { DepositActions } from '../../payments/payment-actions'
import { RecordDeposit } from './record-deposit'
import { TopUpDeposit } from './top-up-deposit'

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
 * **A booking that closed without a stay takes nothing more** (prd.md §9.5, 22
 * September 2026). Closing it settled the deposit — kept, or given back — and
 * a promise still unverified lapsed with it, so none of the ways to take money
 * are offered here any more, and the card says what happened instead.
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
  /** The transfer slip on file for the deposit, or null (N39, capability A6). */
  slip: Document | null
  /** Whether this viewer may attach or remove that slip — `payment.verify`. */
  mayAttachSlip: boolean
  /** Whether this viewer may open it. Every working role may (`booking.view`). */
  maySeeSlip: boolean
  /** Who attached it, already resolved to a name. */
  slipAttachedBy: string
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
  slip,
  mayAttachSlip,
  maySeeSlip,
  slipAttachedBy,
}: SecurityDepositInsetProps) {
  if (!deposit) {
    return (
      <Card surface="inset" className="mt-lg">
        <DepositMark className="mb-sm" />
        {/* "Owed", not "Due at check-in". The deposit secures the booking, so
            a quote with nothing against it is money the property should
            already have — and a label naming the door was how it went
            uncollected until the guest arrived. On a closed booking it is
            neither: nothing was taken, and nothing will be. */}
        <FigureRow
          label={quoted === 0 || isTerminal(bookingStatus) ? 'Quoted' : 'Owed'}
          value={quoted}
        />
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
                : 'Nothing was taken against this stay, so nothing was kept.'}
          </p>
        )}

        {/* A closed booking is not somewhere money can still arrive. */}
        {mayRecordDeposit && quoted > 0 && !isTerminal(bookingStatus) ? (
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

  const closed = endedWithoutStay(bookingStatus)

  // A promise that lapsed when the booking closed. Nothing was ever held, so
  // the figure table's "To return" would be a forecast about money that does
  // not exist; this says what was promised and that it went nowhere.
  if (deposit.collectedAt === null && closed) {
    return (
      <Card surface="inset" className="mt-lg">
        <DepositMark className="mb-sm" badge={<DepositStageBadge stage={deposit.stage} />} />
        <FigureRow label="Promised" value={deposit.amount} />
        <p className="mt-xs text-caption text-muted-foreground">
          The transfer was never verified before the booking closed, so nothing was held and nothing
          was kept. If the money does arrive, it is given back outside the system.
        </p>
      </Card>
    )
  }

  // A deposit is short when less of it arrived than the booking quotes — after
  // a verification accepted a discrepancy, or after an amendment repriced the
  // booking over what is already held. Once it is released or kept the
  // question has closed, so the flag goes with it; the statement keeps the
  // quoted line.
  const isShort = deposit.shortfall > 0 && deposit.release === null && deposit.forfeiture === null

  return (
    <DepositFigureTable
      figures={deposit.figures}
      release={deposit.release}
      forfeiture={deposit.forfeiture}
      shortfall={isShort ? deposit.shortfall : 0}
      quoted={deposit.quoted}
      className="mt-lg"
      header={
        <DepositMark
          badge={
            <span className="flex items-center gap-xs">
              {/* Warning at badge scale, beside the stage rather than instead
                  of it: short cuts across the pipeline, so a deposit can be
                  short and `in_house` at once and both need saying. */}
              {isShort ? <Badge tone="warning">Short</Badge> : null}
              <DepositStageBadge stage={deposit.stage} />
            </span>
          }
        />
      }
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

      {/* How the close settled it, in the words the dialog used. A kept deposit
          is the business's money — revenue, not a liability — and one given
          back on a cancellation is a release that needed no inspection. */}
      {deposit.forfeiture ? (
        <p className="mt-xs text-caption text-muted-foreground">
          Kept on {formatTimestamp(deposit.forfeiture.at)} —{' '}
          {bookingStatus === 'no_show' ? 'the guest did not arrive' : 'the booking was cancelled'}.
          It counts as revenue, not as money owed back.
        </p>
      ) : deposit.release && closed ? (
        <p className="mt-xs text-caption text-muted-foreground">
          Recorded as returned when the booking was cancelled, on{' '}
          {formatTimestamp(deposit.release.at)}. Handing it back happens outside the system.
        </p>
      ) : null}

      {isShort ? (
        <p className="mt-xs text-caption text-muted-foreground">
          BND {formatCents(deposit.shortfall)} short of the BND {formatCents(deposit.quoted)} this
          booking quotes.{' '}
          {securesBooking
            ? 'The deposit is what secures this booking, so it is not secured until the rest is in.'
            : 'The guest cannot be checked in until the rest is in.'}
        </p>
      ) : null}

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
              due={deposit.quoted}
              placement="panel"
            />
          ) : null}

          {mayRecordDeposit ? (
            <RecordDeposit
              bookingId={bookingId}
              reference={reference}
              quoted={deposit.quoted}
              securesBooking={securesBooking}
              fulfilsPromise
              isAlternative={mayVerifyDeposit}
            />
          ) : null}
        </>
      ) : null}

      {/* The reason the actions no longer all sit behind an uncollected
          deposit. A short one is collected — confirming it again is refused
          and recording it again is refused — so before this there was no
          correct button on the screen for the one case that needed one. */}
      {isShort && mayRecordDeposit && !closed ? (
        <TopUpDeposit
          bookingId={bookingId}
          reference={reference}
          quoted={deposit.quoted}
          held={deposit.amount}
          shortfall={deposit.shortfall}
          securesBooking={securesBooking}
        />
      ) : null}

      {/* The slip, which had nowhere to live until A6 (N39). Offered only for
          a transfer: cash was counted at the desk and has no slip to send,
          which is the rule `attach_document` refuses on. */}
      {deposit.method === 'bank_transfer' ? (
        <DepositSlip
          bookingId={bookingId}
          depositId={deposit.id}
          slip={slip}
          mayAttach={mayAttachSlip}
          maySee={maySeeSlip}
          attachedBy={slipAttachedBy}
        />
      ) : null}
    </DepositFigureTable>
  )
}

/**
 * The transfer slip against the security deposit.
 *
 * The same construction the payment's slip and the identity document both use —
 * an inset, the absence on the left, the control that ends it on the right — so
 * a file on a record looks like one thing wherever it appears on this screen.
 *
 * It is usually the guest's own upload rather than a clerk's. Every online stay
 * is secured by the deposit and nothing else (prd.md §9.1), so the one transfer
 * a customer is asked to make is this one, and A6 is them sending the
 * screenshot of it. The desk keeps its own control for the guest who sends it
 * over WhatsApp anyway, which is what §2 describes them doing today.
 */
function DepositSlip({
  bookingId,
  depositId,
  slip,
  mayAttach,
  maySee,
  attachedBy,
}: {
  bookingId: string
  depositId: string
  slip: Document | null
  mayAttach: boolean
  maySee: boolean
  attachedBy: string
}) {
  return (
    <Card surface="inset" className="mt-md">
      <span className="text-micro text-muted-foreground">Transfer slip</span>

      {slip ? (
        <div className="mt-xs divide-y divide-border">
          <DocumentRow
            document={slip}
            mayOpen={maySee}
            mayRemove={mayAttach}
            attachedBy={attachedBy}
          />
        </div>
      ) : (
        <div className="mt-sm flex items-end justify-between gap-md">
          <p className="text-body-sm text-muted-foreground">No slip on file.</p>
          {mayAttach ? (
            <AttachDocument
              kind="payment_slip"
              bookingId={bookingId}
              depositId={depositId}
              label="Attach slip"
              title="Attach the deposit transfer slip"
              description="The bank app is still the check — a slip is evidence, not verification. Kept privately as an accounting record."
            />
          ) : null}
        </div>
      )}
    </Card>
  )
}
