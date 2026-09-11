'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/toast-store'
import { centsFromInput, formatCents, type Cents } from '@/lib/domain/money'
import type { PaymentMethod } from '@/lib/domain/payment'

import { topUpDepositAction, type TopUpDepositState } from './actions'

/**
 * The rest of a deposit that arrived short (capability B16; prd.md §11).
 *
 * `record-deposit.tsx`'s shape with two deliberate departures, and both are
 * the things that would be wrong to copy.
 *
 * **It asks for an amount.** Recording a deposit never does — it is the
 * booking's quoted figure and there is nothing to type. What is missing off a
 * short one is whatever the guest has just handed over, which only the person
 * holding it knows, and it is not always the whole gap: a guest who owes BND
 * 50 and brought 30 is a real afternoon at a desk. The field opens on the
 * shortfall because that is the answer most of the time, not because it is the
 * only one allowed.
 *
 * **Both methods are money already seen.** The deposit's first arrival can be
 * a promise — that is what the verification queue is for — but this row
 * stopped being a promise when somebody collected it, and a second pending
 * state on one row is the ledger shape this slice deliberately did not build.
 * So the labels say *counted* and *seen in the bank*, and nothing here joins a
 * queue.
 */

const initialState: TopUpDepositState = { status: 'idle' }

interface TopUpDepositProps {
  bookingId: string
  reference: string
  /** What the booking quotes. */
  quoted: Cents
  /** What is actually held. */
  held: Cents
  /** The difference — always positive, because the caller checks. */
  shortfall: Cents
  /** Whether completing the deposit is what confirms this booking. */
  securesBooking: boolean
}

export function TopUpDeposit(props: TopUpDepositProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* `tertiary` for `record-deposit.tsx`'s reason: this stands on a
          `Card surface="inset"`, where a secondary fill resolves to the same
          tone as the card and only the label says a button is there. */}
      <Button variant="tertiary" className="mt-lg w-full" onClick={() => setIsOpen(true)}>
        Top up the deposit
      </Button>

      {/* Mounted only while open, so it opens with fresh action state. */}
      {isOpen ? <TopUpDepositDialog {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function TopUpDepositDialog({
  bookingId,
  reference,
  quoted,
  held,
  shortfall,
  securesBooking,
  onClose,
}: TopUpDepositProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(topUpDepositAction, initialState)
  const router = useRouter()

  const [typed, setTyped] = useState(() => formatCents(shortfall))
  const [method, setMethod] = useState<PaymentMethod>('cash')

  useEffect(() => {
    if (state.status === 'done' && state.toppedUp) {
      const { added, shortfall: left, confirmed } = state.toppedUp

      toast({
        tone: 'positive',
        title: `BND ${formatCents(added)} added to the deposit`,
        description: confirmed
          ? `${reference} is confirmed`
          : left > 0
            ? `BND ${formatCents(left)} still owed on the deposit`
            : `Held in full against ${reference}`,
      })
      onClose()
      router.refresh()
    }
  }, [state.status, state.toppedUp, reference, onClose, router])

  const entered = centsFromInput(typed)
  // Only a well-formed figure short of the gap gets the second sentence; an
  // unreadable one gets the field error instead, and saying both would be the
  // dialog arguing with itself.
  const leaves = entered === null ? null : Math.max(shortfall - entered, 0)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Top up the deposit</DialogTitle>
          <DialogDescription>
            {reference} holds BND {formatCents(held)} of the BND {formatCents(quoted)} it quotes.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="bookingId" value={bookingId} />

          <div className="grid gap-sm">
            <Label htmlFor="top-up-amount">Amount received</Label>
            <div className="flex items-center gap-sm">
              <span className="text-body-sm text-muted-foreground">BND</span>
              <Input
                id="top-up-amount"
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
              Short by BND {formatCents(shortfall)}
            </p>
            <FieldError message={state.fieldErrors?.amount} />
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="top-up-method">How was it taken?</Label>
            <Select
              name="method"
              value={method}
              onValueChange={(next) => setMethod(next as PaymentMethod)}
            >
              <SelectTrigger id="top-up-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash — counted now</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer — seen in the bank</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Notice>
            {leaves !== null && leaves > 0 ? (
              <>
                This leaves BND {formatCents(leaves)} still owed on the deposit, so the booking
                stays as it is. Nothing is held against the stay until the deposit is whole.
              </>
            ) : (
              <>
                It goes onto the same deposit, bringing it to the BND {formatCents(quoted)} quoted.{' '}
                {securesBooking
                  ? 'This confirms the booking. What the stay owes is unchanged by it.'
                  : 'The booking is already confirmed, so nothing about it moves.'}
              </>
            )}
          </Notice>

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Recording…' : 'Record the top-up'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
