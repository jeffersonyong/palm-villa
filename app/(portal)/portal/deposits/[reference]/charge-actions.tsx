'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
import { Notice } from '@/components/ui/notice'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import { MAX_CHARGE_REASON_LENGTH, MAX_WAIVE_REASON_LENGTH } from '@/lib/domain/deposit'
import { formatCents, type Cents } from '@/lib/domain/money'

import { addChargeAction, waiveChargeAction, type DepositActionState } from './actions'

/**
 * Raising a charge against a deposit, and dropping one (capability E3).
 *
 * Two dialogs, two permissions. `charge.create` is Front Office's — raising a
 * charge is an operational act at the desk — and `charge.waive` is Finance's,
 * because dropping one is giving money back. prd.md §4 seeds them to different
 * roles, and the caller renders each button only for whoever holds it: an
 * affordance that will refuse you is worse than no affordance.
 *
 * Both require a typed reason, and the database requires it too. prd.md §11
 * requirement 3 asks for charges "itemised with a reason and an author", and
 * the reason is the whole of what makes a deduction defensible three months
 * later — the same argument §8.4 makes about a discount.
 */

const initialState: DepositActionState = { status: 'idle' }

/* ── Adding one ───────────────────────────────────────────────────────────── */

interface AddChargeProps {
  depositId: string
  reference: string
  /** What is held, so the dialog can say when a charge exceeds it. */
  amount: Cents
  /** What is already charged, for the same reason. */
  chargesTotal: Cents
}

export function AddCharge(props: AddChargeProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        <Plus aria-hidden />
        Add charge
      </Button>

      {isOpen ? <AddChargeDialog {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function AddChargeDialog({
  depositId,
  reference,
  amount,
  chargesTotal,
  onClose,
}: AddChargeProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(addChargeAction, initialState)
  const [typed, setTyped] = useState(state.submitted?.amount ?? '')
  const [reason, setReason] = useState(state.submitted?.reason ?? '')
  const router = useRouter()

  // Live, from what has been typed, so the sentence about exceeding the
  // deposit appears as the figure crosses it rather than after submitting.
  const entered = Number.parseFloat(typed)
  const cents = Number.isFinite(entered) ? Math.round(entered * 100) : 0
  const exceeds = cents > 0 && chargesTotal + cents > amount

  useEffect(() => {
    if (state.status === 'done') {
      toast({ tone: 'positive', title: 'Charge added', description: `Against ${reference}.` })
      onClose()
      router.refresh()
    }
  }, [state.status, reference, onClose, router])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Charge against this deposit</DialogTitle>
          <DialogDescription>
            It comes off what is returned when the release is approved. Charges can be added until
            then, and can be dropped by whoever may waive one.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="depositId" value={depositId} />
          <input type="hidden" name="reference" value={reference} />

          <div className="grid w-[180px] gap-sm">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="30.00"
              className="tabular-nums"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors?.amount)}
            />
            <FieldError message={state.fieldErrors?.amount} />
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="reason">What is it for?</Label>
            <Textarea
              id="reason"
              name="reason"
              required
              rows={3}
              maxLength={MAX_CHARGE_REASON_LENGTH}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Shower screen cracked — replacement quoted at BND 130"
              aria-invalid={Boolean(state.fieldErrors?.reason)}
            />
            {state.fieldErrors?.reason ? (
              <FieldError message={state.fieldErrors.reason} />
            ) : (
              <p className="text-caption text-muted-foreground">
                Recorded with your name and the time, and shown on the guest&rsquo;s statement.
              </p>
            )}
          </div>

          {/* prd.md §11 [C]: the deposit is not a cap on liability. Said before
              the click rather than discovered at approval, because the person
              raising it is usually the person who will have to ask for it. */}
          {exceeds ? (
            <Notice>
              This takes the charges past the BND {formatCents(amount)} held. The difference becomes
              an amount owed by the guest, which the system records but cannot collect.
            </Notice>
          ) : null}

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add charge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Dropping one ─────────────────────────────────────────────────────────── */

interface WaiveChargeProps {
  chargeId: string
  reference: string
  amount: Cents
  chargeReason: string
}

export function WaiveCharge(props: WaiveChargeProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant="tertiary" onClick={() => setIsOpen(true)}>
        Waive
      </Button>

      {isOpen ? <WaiveChargeDialog {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function WaiveChargeDialog({
  chargeId,
  reference,
  amount,
  chargeReason,
  onClose,
}: WaiveChargeProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(waiveChargeAction, initialState)
  const [reason, setReason] = useState(state.submitted?.reason ?? '')
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: 'Charge waived',
        description: `BND ${formatCents(amount)} no longer comes off this deposit.`,
      })
      onClose()
      router.refresh()
    }
  }, [state.status, amount, onClose, router])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Waive BND {formatCents(amount)}?</DialogTitle>
          <DialogDescription>
            &ldquo;{chargeReason}&rdquo; stops counting against this deposit and the guest gets that
            much more back. The charge stays on the record with your reason beside it — waiving is
            not deleting.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="chargeId" value={chargeId} />
          <input type="hidden" name="reference" value={reference} />

          <div className="grid gap-sm">
            <Label htmlFor="waive-reason">Why is it being dropped?</Label>
            <Textarea
              id="waive-reason"
              name="reason"
              required
              rows={3}
              maxLength={MAX_WAIVE_REASON_LENGTH}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Damage was pre-existing — noted on the previous inspection"
              aria-invalid={Boolean(state.fieldErrors?.reason)}
            />
            {state.fieldErrors?.reason ? (
              <FieldError message={state.fieldErrors.reason} />
            ) : (
              <p className="text-caption text-muted-foreground">
                Recorded with your name and the time.
              </p>
            )}
          </div>

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Keep the charge
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Waiving…' : 'Waive charge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
