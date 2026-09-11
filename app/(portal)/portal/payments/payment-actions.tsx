'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import { centsFromInput, formatCents, type Cents } from '@/lib/domain/money'
import { describeVariance, matchKindFor } from '@/lib/domain/payment-match'

import { verifyDepositAction, verifyPaymentAction, type PaymentActionState } from './actions'

/**
 * Confirming money against a booking — a payment for the stay, or a promised
 * security deposit (capabilities B5, B6 and B16).
 *
 * **One dialog, one button, both kinds of money** (19 September 2026). The
 * queue used to offer a payment two doors — *Confirm* and *Match manually* —
 * and a deposit one, on the reasoning that a manual match exists to attach an
 * unattached transfer and a deposit is raised against a booking by the
 * customer pressing a button on that booking's own page. That argument does
 * not survive contact with the other half of the screen: a pending *payment*
 * is raised by the same button on the same page, and matching manually never
 * attached a floating payment to an arbitrary booking — it recorded what the
 * bank showed against a row that was already attached. The case it existed for
 * happens to deposits identically, so the choice was a door a clerk had to
 * pick before opening their bank app, which is the failure the amount override
 * is deliberately not.
 *
 * So the rule is the one this dialog already used for the amount, applied to
 * the reference: **the absence is the flag.** A clerk who finds the reference
 * in the bank leaves it as it is and the note below is optional. A clerk who
 * finds nothing clears it, and the note becomes the only thing identifying the
 * transfer — so it is required, and the row is recorded as a hand match
 * without anybody having declared one.
 *
 * `matchKindFor` and `describeVariance` here are the same functions the server
 * action enforces with (lib/domain/payment-match.ts). This copy decides only
 * what to show; the action re-reads the amount due and decides again, because
 * a booking repriced while this dialog sat open must not be confirmed against
 * a figure nobody owes any more.
 */

const initialState: PaymentActionState = { status: 'idle' }

/** What the dialog is confirming. The two differ in copy, not in behaviour. */
type MoneyKind = 'payment' | 'deposit'

export interface PaymentActionsProps {
  paymentId: string
  bookingReference: string
  guestName: string
  /** What is owed now, in cents. */
  due: Cents
}

export function PaymentActions({ paymentId, ...rest }: PaymentActionsProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>Confirm</Button>
      </div>

      {/* Mounted only while open, so it opens with fresh action state. */}
      {open ? (
        <ConfirmDialog kind="payment" id={paymentId} {...rest} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}

/**
 * Confirming a promised security deposit (capability B16).
 *
 * The same dialog as a payment's, with the deposit's own sentences. It used to
 * be a separate component carrying a paragraph on why it had no manual match;
 * that paragraph is answered above, and what is left of the difference is
 * wording.
 *
 * This is the row that confirms a booking. A guest who sent the deposit and
 * the stay in one transfer leaves two rows here, and the booking is confirmed
 * on this one whichever is worked first — so the two figures are checked
 * against the bank separately, as they were sent, and neither is matched
 * against the other's expectation.
 */
export function DepositActions({
  depositId,
  placement = 'queue',
  ...rest
}: {
  depositId: string
  bookingReference: string
  guestName: string
  /** What the booking quotes, which is what the deposit is matched against. */
  due: Cents
  /**
   * Which screen the control is standing on, which decides its shape and its
   * label. The dialog behind it never changes.
   *
   * `queue` is the payments row's action cell — right-aligned, and named with
   * the noun because the row beside it is one of two kinds. The other two are
   * screens about this deposit and nothing else, so there the noun is already
   * said by everything around the button and the open question is the
   * transfer: `panel` is the booking's deposit inset, where it is full width
   * and the primary of two stacked actions; `section` is the deposit's own
   * page, where actions sit at their natural width under the content.
   */
  placement?: 'queue' | 'panel' | 'section'
}) {
  const [open, setOpen] = useState(false)

  const trigger = (
    <Button
      className={placement === 'panel' ? 'mt-lg w-full' : undefined}
      onClick={() => setOpen(true)}
    >
      {placement === 'queue' ? 'Confirm deposit' : 'Confirm the transfer'}
    </Button>
  )

  return (
    <>
      {placement === 'queue' ? <div className="flex justify-end">{trigger}</div> : trigger}

      {open ? (
        <ConfirmDialog kind="deposit" id={depositId} {...rest} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}

/**
 * Shared: the toast, the close and the refresh a successful write needs.
 *
 * The toast says what actually happened to the booking, which is not the same
 * sentence every time. A **deposit** verified is what confirms a booking
 * (prd.md §9.1). A **payment** verified confirms one only where no deposit is
 * quoted or the deposit is already in; against a booking still waiting on its
 * deposit it settles money and leaves the booking where it is, and against a
 * booking already confirmed it is a top-up. "PV-4821 confirmed" on any of
 * those but the first would be the screen claiming a thing that did not
 * happen — and this queue is exactly where a clerk would believe it.
 */
function useCompletion(
  state: PaymentActionState,
  bookingReference: string,
  guestName: string,
  onClose: () => void,
) {
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'done') {
      const done = state.done

      toast(
        done?.confirmed !== false
          ? {
              tone: 'positive',
              title: `${bookingReference} confirmed`,
              description:
                done?.kind === 'deposit'
                  ? `Security deposit verified · ${guestName}`
                  : `Payment verified · ${guestName}`,
            }
          : done.awaitingDeposit
            ? {
                tone: 'positive',
                title: `Payment verified · ${bookingReference}`,
                description: 'Confirm its security deposit to confirm the booking.',
              }
            : {
                tone: 'positive',
                // A deposit reaches this branch too — a booking confirmed by
                // some other route with its transfer still awaited, which is
                // the case the booking screen's own copy warns about. Saying
                // "Payment verified" there names the wrong ledger.
                title:
                  done.kind === 'deposit'
                    ? `Security deposit verified · ${bookingReference}`
                    : `Payment verified · ${bookingReference}`,
                description: `${guestName} — the booking was already confirmed.`,
              },
      )
      onClose()
      router.refresh()
    }
  }, [state.status, state.done, bookingReference, guestName, onClose, router])
}

/** The sentences that differ between the two kinds of money. */
const COPY = {
  payment: {
    action: verifyPaymentAction,
    idField: 'paymentId',
    title: (reference: string) => `Confirm payment for ${reference}`,
    description:
      'The money for the stay. Check the amount against your bank app before confirming — the slip a guest sends is evidence, not verification.',
    expected: 'Expected',
    submit: 'Confirm payment',
    noun: 'payment',
  },
  deposit: {
    action: verifyDepositAction,
    idField: 'depositId',
    title: (reference: string) => `Confirm the deposit for ${reference}`,
    description:
      'The security deposit that secures this booking. Confirming it puts the money on the deposit ledger and confirms the booking. What the stay owes is unchanged by it.',
    expected: 'Quoted',
    submit: 'Confirm deposit',
    noun: 'deposit',
  },
} as const

function ConfirmDialog({
  kind,
  id,
  bookingReference,
  guestName,
  due,
  onClose,
}: {
  kind: MoneyKind
  id: string
  bookingReference: string
  guestName: string
  due: Cents
  onClose: () => void
}) {
  const copy = COPY[kind]
  const [state, formAction, isPending] = useActionState(copy.action, initialState)

  const [typed, setTyped] = useState(() => formatCents(due))
  // Controlled, because whether the note below is required depends on it. It
  // opens on the booking reference — the ordinary case is that the guest
  // quoted it — and clearing it is how a clerk says the bank showed nothing.
  const [reference, setReference] = useState(
    () => state.submitted?.observedReference ?? bookingReference,
  )

  useCompletion(state, bookingReference, guestName, onClose)

  const observed = centsFromInput(typed)
  const variance = observed === null ? null : observed - due
  const needsAmountReason = variance !== null && variance !== 0
  const needsNote = matchKindFor(reference) === 'manual'

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{copy.title(bookingReference)}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name={copy.idField} value={id} />

          <div className="grid gap-sm">
            <Label htmlFor="amount">Amount received</Label>
            <div className="flex items-center gap-sm">
              <span className="text-body-sm text-muted-foreground">BND</span>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                autoComplete="off"
                className="w-[160px] tabular-nums"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors?.amount)}
              />
            </div>
            <p className="text-caption text-muted-foreground tabular-nums">
              {copy.expected} BND {formatCents(due)}
            </p>
            <FieldError message={state.fieldErrors?.amount} />
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="observedReference">Reference as it appeared</Label>
            <Input
              id="observedReference"
              name="observedReference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              autoComplete="off"
              className="font-mono"
              placeholder="Clear this if the bank showed none"
            />
            <p className="text-caption text-muted-foreground">
              Change it if the bank shows something different from {bookingReference}, or clear it
              if nothing was quoted.
            </p>
          </div>

          <NoteField required={needsNote} noun={copy.noun} state={state} />

          {needsAmountReason ? <VarianceNotice variance={variance} state={state} /> : null}

          {state.status === 'error' ? <FieldError message={state.message} /> : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? 'Confirming…'
                : needsAmountReason
                  ? 'Confirm with discrepancy'
                  : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The note, which is optional until the reference is gone.
 *
 * prd.md §10.4 asks for an escape hatch for the customer who omits the
 * reference, and this is it — one field instead of the three transcription
 * fields the separate dialog asked for. A clerk who wants to write "sent by
 * John's wife at 9pm, BIBD" writes that; the product no longer insists they
 * split it into a sender, a date and a justification.
 *
 * Promoted into a bordered panel when it is required, so the two states are
 * not the same field with a different caption. It is the same construction
 * `VarianceNotice` uses below, for the same reason: a rule that has just
 * turned on should look like something appeared.
 */
function NoteField({
  required,
  noun,
  state,
}: {
  required: boolean
  /** What the note is filed against, so it does not call a deposit a payment. */
  noun: string
  state: PaymentActionState
}) {
  const field = (
    <>
      <Label htmlFor="matchReason">{required ? 'Notes' : 'Notes (optional)'}</Label>
      <Textarea
        id="matchReason"
        name="matchReason"
        required={required}
        maxLength={280}
        defaultValue={state.submitted?.matchReason ?? ''}
        placeholder={
          required
            ? 'Sender name matches the guest and the amount is exact'
            : 'Anything worth keeping — who sent it, what time, what the bank showed'
        }
        aria-invalid={Boolean(state.fieldErrors?.matchReason)}
      />
      {state.fieldErrors?.matchReason ? (
        <FieldError message={state.fieldErrors.matchReason} />
      ) : (
        <p className="text-caption text-muted-foreground">
          {required
            ? 'No reference was quoted, so this note is the only thing identifying the transfer. Recorded as a formal match with your name and the time.'
            : `Kept with the ${noun} and shown on the booking. Leave it empty if there is nothing to say.`}
        </p>
      )}
    </>
  )

  return required ? (
    <Card surface="inset" className="grid gap-sm">
      {field}
    </Card>
  ) : (
    <div className="grid gap-sm">{field}</div>
  )
}

/**
 * The amount disagrees, so the reason field appears and the button relabels.
 *
 * Stated in words as well as figures — "Short by BND 50.00" is what a clerk
 * needs to read, not two numbers to subtract under time pressure.
 */
function VarianceNotice({ variance, state }: { variance: Cents; state: PaymentActionState }) {
  const kind = describeVariance(variance)

  return (
    <Card surface="inset" className="grid gap-sm">
      <p className="text-body-sm text-copy">
        <strong className="font-medium">
          {kind === 'short' ? 'Short by' : 'Over by'} BND {formatCents(Math.abs(variance))}
        </strong>{' '}
        against the amount due.
      </p>
      <Label htmlFor="amountOverrideReason">Why is this being confirmed?</Label>
      <Textarea
        id="amountOverrideReason"
        name="amountOverrideReason"
        required
        maxLength={280}
        defaultValue={state.submitted?.amountOverrideReason ?? ''}
        placeholder={
          kind === 'short'
            ? 'Guest is settling the balance in cash on arrival'
            : 'Guest transferred the security deposit as well'
        }
        aria-invalid={Boolean(state.fieldErrors?.amountOverrideReason)}
      />
      {state.fieldErrors?.amountOverrideReason ? (
        <FieldError message={state.fieldErrors.amountOverrideReason} />
      ) : (
        <p className="text-caption text-muted-foreground">
          Recorded against the payment with your name and the time. No refund or balance is
          calculated — any difference is settled outside the system.
        </p>
      )}
    </Card>
  )
}
