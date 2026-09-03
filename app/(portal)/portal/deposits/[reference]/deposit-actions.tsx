'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

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
import { Label } from '@/components/ui/label'
import { Notice } from '@/components/ui/notice'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import { MAX_RELEASE_NOTE_LENGTH, type DepositFigures } from '@/lib/domain/deposit'
import { formatCents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/domain/payment'

import { approveReleaseAction, settleOwedAction, type DepositActionState } from './actions'

/**
 * Approving a release, and recording what a guest owed as paid (capability E2).
 *
 * ── The approval is the point of the whole slice ──────────────────────────
 *
 * prd.md §11 requirement 5: "Approval is a recorded event (who, when,
 * amounts), not a status flag. The audit trail is the point of an approval
 * step." So the dialog states the three figures before the click and the event
 * keeps them afterwards, and the button names what is being approved rather
 * than saying "confirm".
 *
 * **No figures are submitted.** The form carries an id and an optional note;
 * what is released is computed in the database under the deposit's own lock.
 * A charge added while this dialog sat open is therefore either counted or
 * refuses the approval outright — it can never be signed against a list that
 * moved underneath it. That also means the figures shown here are a
 * *preview*, which is why a refusal keeps the dialog open and says so.
 *
 * **No money moves.** The notes are handed back at the desk, or transferred
 * from a bank app; this records that somebody with the authority said it
 * should be. Every other money-out path in this product takes the same
 * position (architecture.md §6.4), and N5 is why.
 */

const initialState: DepositActionState = { status: 'idle' }

interface ApproveReleaseProps {
  depositId: string
  reference: string
  guestName: string
  figures: DepositFigures
  chargeCount: number
}

export function ApproveRelease(props: ApproveReleaseProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <CheckCircle2 aria-hidden />
        Approve release
      </Button>

      {isOpen ? <ApproveReleaseDialog {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function ApproveReleaseDialog({
  depositId,
  reference,
  guestName,
  figures,
  chargeCount,
  onClose,
}: ApproveReleaseProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(approveReleaseAction, initialState)
  const [note, setNote] = useState(state.submitted?.note ?? '')
  const router = useRouter()

  const owes = figures.owed > 0

  useEffect(() => {
    if (state.status === 'done' && state.released) {
      toast({
        tone: 'positive',
        title: 'Release approved',
        description:
          state.released.owed > 0
            ? `BND ${formatCents(state.released.owed)} is owed by ${guestName}.`
            : `BND ${formatCents(state.released.releasedAmount)} goes back to ${guestName}.`,
      })
      onClose()
      router.refresh()
    }
  }, [state.status, state.released, guestName, onClose, router])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Approve the release for {reference}?</DialogTitle>
          <DialogDescription>
            {owes
              ? 'The charges come to more than the deposit, so nothing goes back and the difference is recorded as owed.'
              : 'This records who approved the release, when, and the figures below.'}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="depositId" value={depositId} />
          <input type="hidden" name="reference" value={reference} />

          {/* The gray inset is the panel for figures (design.md). These are the
              numbers the event will carry, stated before the click rather than
              reported after it. */}
          <Card surface="inset" className="grid gap-xs">
            <FigureRow label="Deposit held" value={figures.amount} />
            <FigureRow
              label={chargeCount === 1 ? 'Less 1 charge' : `Less ${chargeCount} charges`}
              value={figures.chargesTotal}
            />
            <div className="mt-xs border-t border-divider pt-xs">
              <FigureRow
                label={owes ? 'Owed by guest' : 'Returned to guest'}
                value={owes ? figures.owed : figures.releasable}
                strong
              />
            </div>
          </Card>

          <div className="grid gap-sm">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              name="note"
              rows={2}
              maxLength={MAX_RELEASE_NOTE_LENGTH}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Charged for the screen only; the marks were pre-existing."
              aria-invalid={Boolean(state.fieldErrors?.note)}
            />
            {state.fieldErrors?.note ? (
              <FieldError message={state.fieldErrors.note} />
            ) : (
              <p className="text-caption text-muted-foreground">
                Kept with the approval and shown on the guest&rsquo;s statement.
              </p>
            )}
          </div>

          <Notice>
            No money moves here. This records that the release was authorised and the figures it was
            authorised at — handing the deposit back happens at the desk or from a bank app.
          </Notice>

          {/* A refusal keeps the dialog open and says why, because the answer
              belongs at the button that asked the question. The one that
              actually happens is a charge landing first: the figures above are
              then stale, and reloading is the honest fix. */}
          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? 'Approving…'
                : owes
                  ? `Approve — BND ${formatCents(figures.owed)} owed`
                  : `Approve release of BND ${formatCents(figures.releasable)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FigureRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-lg">
      <span
        className={
          strong ? 'text-body-sm-strong text-foreground' : 'text-body-sm text-muted-foreground'
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? 'text-body-sm-strong text-foreground tabular-nums'
            : 'text-body-sm text-foreground tabular-nums'
        }
      >
        BND {formatCents(value)}
      </span>
    </div>
  )
}

/* ── Recording the excess as paid ─────────────────────────────────────────── */

interface SettleOwedProps {
  depositId: string
  reference: string
  owed: number
}

/**
 * What happens after a guest is told they owe something.
 *
 * **[A]**, and deliberately minimal. prd.md §11's own note is that recovery of
 * charges above the deposit "will be poor in practice" and that the system
 * provides the record rather than the collection — so this records the whole
 * amount as recovered and nothing else. Part payment, and what happens to an
 * amount nobody ever pays, are N21.
 *
 * Gated by `payment.record_cash`: it is not a booking payment, appears in no
 * cash-up and settles no booking, but whoever may say money arrived is the
 * same person either way (prd.md §10.7).
 */
export function SettleOwed(props: SettleOwedProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Record as settled
      </Button>

      {isOpen ? <SettleOwedDialog {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function SettleOwedDialog({
  depositId,
  reference,
  owed,
  onClose,
}: SettleOwedProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(settleOwedAction, initialState)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: 'Recorded as settled',
        description: `BND ${formatCents(owed)} recovered against ${reference}.`,
      })
      onClose()
      router.refresh()
    }
  }, [state.status, owed, reference, onClose, router])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Record BND {formatCents(owed)} as settled?</DialogTitle>
          <DialogDescription>
            The guest has paid what they owed beyond their deposit. This is recorded against the
            deposit with your name and the time.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="depositId" value={depositId} />
          <input type="hidden" name="reference" value={reference} />
          <input type="hidden" name="method" value={method} />

          <div className="grid gap-sm">
            <Label htmlFor="settle-method">How did it arrive?</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
              <SelectTrigger id="settle-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{PAYMENT_METHOD_LABELS.cash}</SelectItem>
                <SelectItem value="bank_transfer">{PAYMENT_METHOD_LABELS.bank_transfer}</SelectItem>
              </SelectContent>
            </Select>
            {state.fieldErrors?.method ? <FieldError message={state.fieldErrors.method} /> : null}
          </div>

          <Notice>
            This is not a booking payment. It settles no booking and does not appear in the daily
            cash-up — it records that the amount owed on this deposit has been recovered.
          </Notice>

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Recording…' : 'Record as settled'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
