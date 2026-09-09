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
import { formatCents, type Cents } from '@/lib/domain/money'
import type { PaymentMethod } from '@/lib/domain/payment'

import { recordDepositAction, type RecordDepositState } from './actions'

/**
 * Taking the security deposit at the desk (capability B16, staff half).
 *
 * `record-payment.tsx`'s shape deliberately, because to a clerk it is the same
 * act at the same counter — money arriving against a booking, in one of two
 * ways. What is different is the two things that would be wrong to copy.
 *
 * **It asks for no amount.** A deposit is the figure the booking quoted and
 * nothing else: prd.md §11 makes what is held immovable by an amendment, and
 * the database reads it under the row lock rather than trusting this form. A
 * booking payment has a field here because a guest can hand over part of what
 * they owe; a guest cannot hand over part of a deposit and have the unit
 * secured, so there is no figure to type and no override reason to write.
 *
 * **It says what each method does to the booking**, because they differ in the
 * way that matters most to the person pressing the button. Cash is counted, so
 * the booking is confirmed on the spot. A transfer is a promise, so it joins
 * the verification queue and the unit stays held until somebody opens the bank
 * app — which is the same wait the customer's own page describes, reached from
 * the other side of the desk.
 */

const initialState: RecordDepositState = { status: 'idle' }

interface RecordDepositProps {
  bookingId: string
  reference: string
  /** What the booking quotes. Always positive — the caller checks. */
  quoted: Cents
  /** Whether taking it confirms the booking, or it is already confirmed. */
  securesBooking: boolean
  /**
   * A transfer is already awaited on this booking, and cash settles it.
   *
   * The method choice disappears here rather than being shown and refused: a
   * second promise clears nothing, so cash is the only answer and offering the
   * other one would be offering a dead end.
   */
  fulfilsPromise?: boolean
}

export function RecordDeposit(props: RecordDepositProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" className="mt-lg w-full" onClick={() => setIsOpen(true)}>
        {props.fulfilsPromise ? 'Take the deposit in cash' : 'Record the deposit'}
      </Button>

      {/* Mounted only while open, so it opens with fresh action state. */}
      {isOpen ? <RecordDepositDialog {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function RecordDepositDialog({
  bookingId,
  reference,
  quoted,
  securesBooking,
  fulfilsPromise = false,
  onClose,
}: RecordDepositProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(recordDepositAction, initialState)
  const router = useRouter()

  const [method, setMethod] = useState<PaymentMethod>('cash')

  useEffect(() => {
    if (state.status === 'done' && state.recorded) {
      toast(
        state.recorded.method === 'cash'
          ? {
              tone: 'positive',
              title: `BND ${formatCents(state.recorded.amount)} deposit collected`,
              description: state.recorded.confirmed
                ? `${reference} is confirmed`
                : `Held against ${reference}`,
            }
          : {
              tone: 'positive',
              title: 'Deposit transfer awaited',
              description: `${reference} is in the payment queue`,
            },
      )
      onClose()
      router.refresh()
    }
  }, [state.status, state.recorded, reference, onClose, router])

  const isCash = method === 'cash'

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            {fulfilsPromise ? 'Take the deposit in cash' : 'Record the deposit'}
          </DialogTitle>
          <DialogDescription>
            {fulfilsPromise
              ? `${reference} is waiting on a BND ${formatCents(quoted)} transfer that has not been verified.`
              : `${reference} quotes a BND ${formatCents(quoted)} refundable security deposit.`}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="bookingId" value={bookingId} />

          {fulfilsPromise ? (
            <input type="hidden" name="method" value="cash" />
          ) : (
            <div className="grid gap-sm">
              <Label htmlFor="deposit-method">How was it taken?</Label>
              <Select
                name="method"
                value={method}
                onValueChange={(next) => setMethod(next as PaymentMethod)}
              >
                <SelectTrigger id="deposit-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash — counted now</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer — verify later</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Notice>
            {fulfilsPromise ? (
              <>
                The awaited transfer is settled by the BND {formatCents(quoted)} counted here, and
                the booking is confirmed. What the customer said they sent stays on the record, so
                the deposit still shows that a transfer was claimed.
              </>
            ) : isCash ? (
              <>
                BND {formatCents(quoted)} goes on the deposit ledger as money the property holds and
                owes back after the stay.{' '}
                {securesBooking
                  ? 'This confirms the booking — the stay itself is still settled on arrival.'
                  : 'The booking is already confirmed, so nothing about it moves.'}
              </>
            ) : (
              <>
                A BND {formatCents(quoted)} transfer will appear in the verification queue. Nothing
                is held until someone checks the bank and confirms it
                {securesBooking ? ', and the unit stays held until then' : ''}.
              </>
            )}
          </Notice>

          {state.status === 'error' ? <FieldError message={state.message} /> : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? 'Recording…'
                : isCash || fulfilsPromise
                  ? 'Record the deposit'
                  : 'Send to the queue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
