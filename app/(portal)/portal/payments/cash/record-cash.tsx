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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import { formatCents } from '@/lib/domain/money'

import { recordCashAction, type RecordCashState } from './actions'

/**
 * Recording cash against a booking (capability B7).
 *
 * One shot, no live lookup. Showing the booking's total once the reference
 * resolves would need a round trip on every keystroke, and the confirmation
 * toast names the booking and the amount — so a mistyped reference is caught
 * immediately by reading the wrong guest's name back, which is faster than
 * any amount of validation while typing.
 *
 * The reason field is not revealed live either, for the same reason: this
 * dialog does not know the booking total until it submits. When the amounts
 * disagree the server says so and the field appears with the message on it.
 */

const initialState: RecordCashState = { status: 'idle' }

export function RecordCashPayment() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus aria-hidden />
        Record cash
      </Button>

      {/* Mounted only while open, so it opens with fresh action state. */}
      {isOpen ? <RecordCashDialog onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function RecordCashDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(recordCashAction, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'done' && state.recorded) {
      toast({
        tone: 'positive',
        title: `BND ${formatCents(state.recorded.amount)} recorded`,
        description: `Cash against ${state.recorded.reference}`,
      })
      onClose()
      router.refresh()
    }
  }, [state.status, state.recorded, onClose, router])

  const needsReason = Boolean(state.fieldErrors?.amountOverrideReason)
  // React empties an uncontrolled field once the action resolves, so a refused
  // submission is re-filled from what the server echoed back rather than
  // making the clerk type it all again.
  const submitted = state.submitted

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Record cash</DialogTitle>
          <DialogDescription>
            Recorded as collected now, by you. If the booking was waiting on a transfer, this
            settles it.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <div className="grid gap-sm">
            <Label htmlFor="reference">Booking reference</Label>
            <Input
              id="reference"
              name="reference"
              required
              autoComplete="off"
              autoFocus
              placeholder="PV-4821"
              defaultValue={submitted?.reference ?? ''}
              className="w-[180px] font-mono uppercase tabular-nums"
              aria-invalid={Boolean(state.fieldErrors?.reference)}
            />
            {state.fieldErrors?.reference ? (
              <p className="text-caption text-destructive">{state.fieldErrors.reference}</p>
            ) : null}
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="cash-amount">Amount collected</Label>
            <div className="flex items-center gap-sm">
              <span className="text-body-sm text-muted-foreground">BND</span>
              <Input
                id="cash-amount"
                name="amount"
                inputMode="decimal"
                required
                autoComplete="off"
                className="w-[160px] tabular-nums"
                defaultValue={submitted?.amount ?? ''}
                aria-invalid={Boolean(state.fieldErrors?.amount)}
              />
            </div>
            {state.fieldErrors?.amount ? (
              <p className="text-caption text-destructive">{state.fieldErrors.amount}</p>
            ) : (
              <p className="text-caption text-muted-foreground">
                Count the notes. If this is not the booking total you will be asked why.
              </p>
            )}
          </div>

          {needsReason ? (
            <div className="grid gap-sm rounded-md bg-muted p-md">
              <Label htmlFor="amountOverrideReason">
                This is not the amount due — why is that?
              </Label>
              <Textarea
                id="amountOverrideReason"
                name="amountOverrideReason"
                required
                maxLength={280}
                placeholder="Late check-out collected at the desk"
                defaultValue={submitted?.amountOverrideReason ?? ''}
                aria-invalid
              />
              <p className="text-caption text-destructive">
                {state.message ?? 'Say why the amount differs.'}
              </p>
            </div>
          ) : null}

          <p className="rounded-md bg-muted p-md text-caption text-copy">
            This records the cash. It does not calculate a balance — the daily cash-up against
            banked amounts is a separate screen.
          </p>

          {state.status === 'error' && state.message && !needsReason ? (
            <p className="text-body-sm text-destructive">{state.message}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Recording…' : 'Record cash'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
