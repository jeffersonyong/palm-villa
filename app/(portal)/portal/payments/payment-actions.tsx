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

import { matchPaymentManuallyAction, verifyPaymentAction, type PaymentActionState } from './actions'

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

/** Shared: the toast, the close and the refresh a successful write needs. */
function useCompletion(
  state: PaymentActionState,
  bookingReference: string,
  guestName: string,
  onClose: () => void,
) {
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: `${bookingReference} confirmed`,
        description: `Payment verified · ${guestName}`,
      })
      onClose()
      router.refresh()
    }
  }, [state.status, bookingReference, guestName, onClose, router])
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
            Check the amount against your bank app before confirming. The slip a guest sends is
            evidence, not verification.
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
              placeholder="SITI BINTI ABDULLAH"
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
