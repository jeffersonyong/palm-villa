'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DateField } from '@/components/ui/date-field'
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
import { todayInBrunei } from '@/lib/domain/dates'
import { centsFromInput, formatCents, type Cents } from '@/lib/domain/money'
import { describeVariance, requiresReasons } from '@/lib/domain/payment-match'

import {
  matchPaymentManuallyAction,
  verifyDepositAction,
  verifyPaymentAction,
  type PaymentActionState,
} from './actions'

/**
 * Confirming a payment, and matching one by hand (capabilities B5 and B6).
 *
 * Two dialogs rather than a menu of three, and the amount override is not one
 * of them. A clerk does not know before opening their bank app whether the
 * figure matches, so making them pre-declare an override invites picking the
 * wrong door — and the lenient door is the one that gets picked by default,
 * which is precisely the failure B5 exists to prevent. Instead the reason
 * field appears the moment the typed amount disagrees with what is due. The
 * discrepancy *is* the flag.
 *
 * `requiresReasons` and `describeVariance` here are the same functions the
 * server action enforces with (lib/domain/payment-match.ts). This copy decides
 * only what to show; the action re-reads the amount due and decides again,
 * because a booking repriced while this dialog sat open must not be confirmed
 * against a figure nobody owes any more.
 */

const initialState: PaymentActionState = { status: 'idle' }

export interface PaymentActionsProps {
  paymentId: string
  bookingReference: string
  guestName: string
  /** What is owed now, in cents. */
  due: Cents
}

export function PaymentActions(props: PaymentActionsProps) {
  const [dialog, setDialog] = useState<'confirm' | 'manual' | null>(null)
  const close = () => setDialog(null)

  return (
    <>
      <div className="flex justify-end gap-sm">
        <Button onClick={() => setDialog('confirm')}>Confirm</Button>
        <Button variant="tertiary" onClick={() => setDialog('manual')}>
          Match manually
        </Button>
      </div>

      {/* Mounted only while open, so each one opens with fresh action state. */}
      {dialog === 'confirm' ? <ConfirmDialog {...props} onClose={close} /> : null}
      {dialog === 'manual' ? <ManualMatchDialog {...props} onClose={close} /> : null}
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

function ConfirmDialog({
  paymentId,
  bookingReference,
  guestName,
  due,
  onClose,
}: PaymentActionsProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(verifyPaymentAction, initialState)
  const [typed, setTyped] = useState(() => formatCents(due))
  // React empties an uncontrolled field once the action resolves, so a refused
  // submission is re-filled from what the server echoed back.
  const submitted = state.submitted

  useCompletion(state, bookingReference, guestName, onClose)

  const observed = centsFromInput(typed)
  const variance = observed === null ? null : observed - due
  const needsReason = variance !== null && variance !== 0

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Confirm payment for {bookingReference}</DialogTitle>
          <DialogDescription>
            The money for the stay. Check the amount against your bank app before confirming — the
            slip a guest sends is evidence, not verification.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="paymentId" value={paymentId} />

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
              Expected BND {formatCents(due)}
            </p>
            <FieldError message={state.fieldErrors?.amount} />
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="observedReference">Reference as it appeared</Label>
            <Input
              id="observedReference"
              name="observedReference"
              defaultValue={submitted?.observedReference ?? bookingReference}
              autoComplete="off"
              className="font-mono"
            />
            <p className="text-caption text-muted-foreground">
              Change it if the bank shows something different from {bookingReference}.
            </p>
          </div>

          {needsReason ? <VarianceNotice variance={variance} state={state} /> : null}

          {state.status === 'error' ? <FieldError message={state.message} /> : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? 'Confirming…'
                : needsReason
                  ? 'Confirm with discrepancy'
                  : 'Confirm payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

function ManualMatchDialog({
  paymentId,
  bookingReference,
  guestName,
  due,
  onClose,
}: PaymentActionsProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(matchPaymentManuallyAction, initialState)
  const [typed, setTyped] = useState(() => formatCents(due))
  const submitted = state.submitted

  useCompletion(state, bookingReference, guestName, onClose)

  const observed = centsFromInput(typed)
  const { amount: needsReason } = requiresReasons({
    dueCents: due,
    observedCents: observed ?? due,
    match: 'manual',
  })

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Match a payment to {bookingReference}</DialogTitle>
          <DialogDescription>
            For a transfer that arrived without the reference. Describe what your bank actually
            shows; it is attached to this booking and recorded against your name.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="paymentId" value={paymentId} />

          <div className="grid gap-sm">
            <Label htmlFor="manual-amount">Amount received</Label>
            <div className="flex items-center gap-sm">
              <span className="text-body-sm text-muted-foreground">BND</span>
              <Input
                id="manual-amount"
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
              Expected BND {formatCents(due)}
            </p>
            <FieldError message={state.fieldErrors?.amount} />
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="observedSender">Sender, as the bank shows them</Label>
            <Input
              id="observedSender"
              name="observedSender"
              required
              maxLength={120}
              autoComplete="off"
              placeholder="John Doe"
              defaultValue={submitted?.observedSender ?? ''}
              aria-invalid={Boolean(state.fieldErrors?.observedSender)}
            />
            {state.fieldErrors?.observedSender ? (
              <FieldError message={state.fieldErrors.observedSender} />
            ) : (
              <p className="text-caption text-muted-foreground">
                With no reference quoted, this is the only thing identifying the payment.
              </p>
            )}
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="observedOn">Date on the statement</Label>
            {/* Not clearable: the field is required and always opens on a
                real date, so it must never be able to reach empty. Left
                unbounded, as the native input was — the server takes any
                well-formed calendar date, and narrowing it here would invent a
                rule nobody has asked for. */}
            <DateField
              id="observedOn"
              name="observedOn"
              defaultValue={submitted?.observedOn || todayInBrunei()}
              className="w-[180px]"
              invalid={Boolean(state.fieldErrors?.observedOn)}
              describedBy={state.fieldErrors?.observedOn ? 'observedOn-error' : undefined}
            />
            <FieldError id="observedOn-error" message={state.fieldErrors?.observedOn} />
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="manual-observedReference">Reference shown (if any)</Label>
            <Input
              id="manual-observedReference"
              name="observedReference"
              autoComplete="off"
              className="font-mono"
              placeholder="Leave blank if none was quoted"
              defaultValue={submitted?.observedReference ?? ''}
            />
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="matchReason">Why does this payment belong to this booking?</Label>
            <Textarea
              id="matchReason"
              name="matchReason"
              required
              maxLength={280}
              placeholder="Sender name matches the guest and the amount is exact"
              defaultValue={submitted?.matchReason ?? ''}
              aria-invalid={Boolean(state.fieldErrors?.matchReason)}
            />
            {state.fieldErrors?.matchReason ? (
              <FieldError message={state.fieldErrors.matchReason} />
            ) : (
              <p className="text-caption text-muted-foreground">
                Recorded as a formal match with your name and the time.
              </p>
            )}
          </div>

          {needsReason ? <VarianceNotice variance={(observed ?? due) - due} state={state} /> : null}

          {state.status === 'error' ? <FieldError message={state.message} /> : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Matching…' : 'Match and confirm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Confirming a promised security deposit (capability B16).
 *
 * The confirm dialog above with two things taken out, and both absences are
 * decisions rather than omissions.
 *
 * **There is no "match manually".** That escape hatch exists because a
 * customer forgets to put the reference in, and the clerk has an unattached
 * payment in the bank to attach to *some* booking. A deposit is raised against
 * one booking by the customer pressing a button on that booking's own page, so
 * there is nothing to match it to.
 *
 * **There is no slip.** A document hangs off a payment id (architecture.md
 * §8.1) and a deposit is not a payment, so a guest's screenshot of the
 * transfer has nowhere to live yet. That is the honest state and it is in the
 * register; the bank app was always the check (prd.md §10.4).
 *
 * This is the row that confirms a booking. A guest who sent the deposit and
 * the stay in one transfer leaves two rows here, and the booking is confirmed
 * on this one whichever is worked first — so the two figures are checked
 * against the bank separately, as they were sent, and neither is matched
 * against the other's expectation.
 */
export function DepositActions(props: {
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
  const { placement = 'queue', ...dialog } = props
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

      {open ? <ConfirmDepositDialog {...dialog} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function ConfirmDepositDialog({
  depositId,
  bookingReference,
  guestName,
  due,
  onClose,
}: {
  depositId: string
  bookingReference: string
  guestName: string
  due: Cents
  onClose: () => void
}) {
  const [state, formAction, isPending] = useActionState(verifyDepositAction, initialState)
  const [typed, setTyped] = useState(() => formatCents(due))

  useCompletion(state, bookingReference, guestName, onClose)

  const observed = centsFromInput(typed)
  const variance = observed === null ? null : observed - due
  const needsReason = variance !== null && variance !== 0

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Confirm the deposit for {bookingReference}</DialogTitle>
          <DialogDescription>
            The security deposit that secures this booking. Confirming it puts the money on the
            deposit ledger and confirms the booking. What the stay owes is unchanged by it.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="depositId" value={depositId} />

          <div className="grid gap-sm">
            <Label htmlFor="depositAmount">Amount received</Label>
            <div className="flex items-center gap-sm">
              <span className="text-body-sm text-muted-foreground">BND</span>
              <Input
                id="depositAmount"
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
              Quoted BND {formatCents(due)}
            </p>
            <FieldError message={state.fieldErrors?.amount} />
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="depositReference">Reference as it appeared</Label>
            <Input
              id="depositReference"
              name="observedReference"
              defaultValue={state.submitted?.observedReference ?? bookingReference}
              autoComplete="off"
              className="font-mono"
            />
          </div>

          {needsReason ? <VarianceNotice variance={variance} state={state} /> : null}

          {state.status === 'error' ? <FieldError message={state.message} /> : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? 'Confirming…'
                : needsReason
                  ? 'Confirm with discrepancy'
                  : 'Confirm deposit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
