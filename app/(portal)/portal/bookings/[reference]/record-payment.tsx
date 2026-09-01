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
import { centsFromInput, formatCents, type Cents } from '@/lib/domain/money'
import type { PaymentMethod } from '@/lib/domain/payment'

import { recordPaymentAction, type RecordPaymentState } from './actions'

/**
 * Settling what a booking still owes (capability B13).
 *
 * Offered only when something is actually outstanding — the caller asks
 * `canSettle()` — so a clerk is never shown a button that is going to refuse.
 *
 * The two methods behave differently, and the dialog says so rather than
 * hiding it, because the difference decides whether the guest can walk away.
 * **Cash** is counted here and settles the balance now. **A transfer** has
 * been promised, not seen: it goes to the verification queue and the balance
 * moves only once somebody has checked the bank.
 *
 * A transfer asks for no amount, which is not an omission. `payment.amount_cents`
 * stays null until the bank has been looked at, so the figure is entered at
 * verification against the statement — asking here would invite the second
 * answer to disagree with the first.
 */

const initialState: RecordPaymentState = { status: 'idle' }

interface RecordPaymentProps {
  bookingId: string
  reference: string
  /** What the booking still owes. Always positive — see `canSettle`. */
  outstanding: Cents
}

export function RecordPayment(props: RecordPaymentProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" className="mt-lg w-full" onClick={() => setIsOpen(true)}>
        Record a payment
      </Button>

      {/* Mounted only while open, so it opens with fresh action state. */}
      {isOpen ? <RecordPaymentDialog {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function RecordPaymentDialog({
  bookingId,
  reference,
  outstanding,
  onClose,
}: RecordPaymentProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(recordPaymentAction, initialState)
  const router = useRouter()

  const [method, setMethod] = useState<PaymentMethod>('cash')
  // Defaulted to the outstanding figure, which is what is being settled in
  // almost every case — and typed rather than fixed, because a guest handing
  // over what they have is the case the reason field exists for.
  const [amount, setAmount] = useState(formatCents(outstanding))

  useEffect(() => {
    if (state.status === 'done' && state.recorded) {
      toast(
        state.recorded.method === 'cash'
          ? {
              tone: 'positive',
              title: `BND ${formatCents(state.recorded.amount ?? 0)} recorded`,
              description: `Cash against ${reference}`,
            }
          : {
              tone: 'positive',
              title: 'Transfer awaiting verification',
              description: `${reference} is in the payment queue`,
            },
      )
      onClose()
      router.refresh()
    }
  }, [state.status, state.recorded, reference, onClose, router])

  const isCash = method === 'cash'
  const typed = centsFromInput(amount)
  // Revealed live, unlike the standalone cash form — that screen does not know
  // the booking until it submits, and this one is *on* the booking. The server
  // enforces the same rule either way; this only means a clerk is told before
  // they press the button rather than after.
  const needsReason =
    isCash && typed !== null && typed !== outstanding && !state.fieldErrors?.amount

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {reference} still owes BND {formatCents(outstanding)}.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="bookingId" value={bookingId} />

          <div className="grid gap-sm">
            <Label htmlFor="method">Method</Label>
            <Select
              name="method"
              value={method}
              onValueChange={(next) => setMethod(next as PaymentMethod)}
            >
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash — collected now</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer — verify later</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCash ? (
            <div className="grid gap-sm">
              <Label htmlFor="settle-amount">Amount collected</Label>
              <div className="flex items-center gap-sm">
                <span className="text-body-sm text-muted-foreground">BND</span>
                <Input
                  id="settle-amount"
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  className="w-[160px] tabular-nums"
                  value={amount}
                  aria-invalid={Boolean(state.fieldErrors?.amount)}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              {state.fieldErrors?.amount ? (
                <FieldError message={state.fieldErrors.amount} />
              ) : (
                <p className="text-caption text-muted-foreground">
                  Count the notes. Anything other than BND {formatCents(outstanding)} needs a
                  reason.
                </p>
              )}
            </div>
          ) : (
            <Notice>
              A transfer for BND {formatCents(outstanding)} will appear in the verification queue.
              The booking is not settled until someone checks the bank and confirms it — the amount
              is entered then, against the statement.
            </Notice>
          )}

          {needsReason ? (
            <Card surface="inset" className="grid gap-sm">
              <Label htmlFor="amountOverrideReason">
                This is not what is outstanding — why is that?
              </Label>
              <Textarea
                id="amountOverrideReason"
                name="amountOverrideReason"
                required
                maxLength={280}
                placeholder="Guest paying the rest on arrival"
                defaultValue={state.submitted?.amountOverrideReason ?? ''}
                aria-invalid={Boolean(state.fieldErrors?.amountOverrideReason)}
              />
              <FieldError message={state.fieldErrors?.amountOverrideReason} />
            </Card>
          ) : null}

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Recording…' : isCash ? 'Record cash' : 'Send to the queue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
