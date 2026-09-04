'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogIn, LogOut } from 'lucide-react'

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
import { formatStayDate } from '@/lib/domain/dates'
import { formatCents, type Cents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/domain/payment'

import { checkInAction, checkOutAction, type StayActionState } from './stay-actions'

/**
 * Arriving and leaving.
 *
 * Two buttons rather than a `…` menu, and never both at once: a booking is
 * either due to arrive or in the building. Which one shows is the caller's
 * question, answered from the state machine before this renders — so a booking
 * that cannot move has no button rather than a disabled one that never
 * explains itself (the units board's rule: an affordance that will refuse you
 * is worse than no affordance).
 *
 * Both open a dialog, and both dialogs exist for the same reason the units
 * board's do: to say in plain sentences what is about to happen. Check-in also
 * collects money, so it asks the one question it cannot answer itself — how
 * the deposit was taken.
 *
 * **The screen's one primary fill** (2026-09-04; it was `tertiary` beside
 * Edit). Arriving and leaving is the record's forward action — what the desk
 * came to this screen to do with the guest standing there — where Edit is an
 * errand and Cancel an exception. Because the button exists only when the
 * state machine allows the move, the fill is on screen exactly when it is
 * actionable and absent otherwise. A record screen has no control line, so
 * design.md's rule keeping the fill out of a list screen's header does not
 * apply; the Payments card's Confirm is a fill in its own region. It leads
 * the row rather than sitting between Edit and the overflow, where a filled
 * button flanked by two bordered ones read as a pattern rather than a rank.
 */

const initialState: StayActionState = { status: 'idle' }

interface StayButtonsProps {
  bookingId: string
  reference: string
  guestName: string
  /** What this booking quotes as a deposit. Zero is a real answer. */
  securityDeposit: Cents
  /** The day the stay begins, so the dialog can say when today is not it. */
  checkInDate: string | null
  /** Today, in the property's timezone — resolved on the server. */
  today: string
  canCheckIn: boolean
  canCheckOut: boolean
}

export function StayButtons({ canCheckIn, canCheckOut, ...stay }: StayButtonsProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!canCheckIn && !canCheckOut) {
    return null
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        {canCheckIn ? <LogIn aria-hidden /> : <LogOut aria-hidden />}
        {canCheckIn ? 'Check in' : 'Check out'}
      </Button>

      {/* Mounted only while open, so it opens with fresh action state. */}
      {isOpen ? (
        canCheckIn ? (
          <CheckInDialog {...stay} onClose={() => setIsOpen(false)} />
        ) : (
          <CheckOutDialog {...stay} onClose={() => setIsOpen(false)} />
        )
      ) : null}
    </>
  )
}

type DialogProps = Omit<StayButtonsProps, 'canCheckIn' | 'canCheckOut'> & { onClose: () => void }

function CheckInDialog({
  bookingId,
  guestName,
  securityDeposit,
  checkInDate,
  today,
  onClose,
}: DialogProps) {
  const [state, formAction, isPending] = useActionState(checkInAction, initialState)
  // Held in state rather than left to the DOM: React resets an uncontrolled
  // form as soon as its action returns, so a refusal would clear the answer
  // the clerk had already given.
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const router = useRouter()

  const takesDeposit = securityDeposit > 0
  const isEarly = checkInDate !== null && checkInDate !== today

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: `${guestName} is checked in`,
        description: state.collected
          ? `BND ${formatCents(state.collected.amount)} deposit held, taken in ${PAYMENT_METHOD_LABELS[state.collected.method].toLowerCase()}.`
          : 'No security deposit was due on this booking.',
      })
      onClose()
      router.refresh()
    }
  }, [state.status, state.collected, guestName, onClose, router])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Check in {guestName}?</DialogTitle>
          <DialogDescription>
            {takesDeposit
              ? `The stay begins now and the BND ${formatCents(securityDeposit)} security deposit is taken. It is held until the unit has been inspected and the release is approved.`
              : 'The stay begins now. This booking quotes no security deposit, so nothing is collected.'}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="method" value={method} />

          {takesDeposit ? (
            <div className="grid gap-sm">
              <Label htmlFor="method">How was the deposit taken?</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                <SelectTrigger id="method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{PAYMENT_METHOD_LABELS.cash}</SelectItem>
                  <SelectItem value="bank_transfer">
                    {PAYMENT_METHOD_LABELS.bank_transfer}
                  </SelectItem>
                </SelectContent>
              </Select>
              {state.fieldErrors?.method ? (
                <FieldError message={state.fieldErrors.method} />
              ) : (
                <p className="text-caption text-muted-foreground">
                  Recorded against the deposit with your name and the time. It is held apart from
                  what the booking was paid, and never counted as revenue.
                </p>
              )}
            </div>
          ) : null}

          {/* Said, not refused. A guest arriving a day early or late is a
              front-desk decision, and a system that blocks it sends somebody to
              amend the dates purely to satisfy it. */}
          {isEarly && checkInDate ? (
            <Notice>
              This booking is dated {formatStayDate(checkInDate)}. Checking in today is recorded as
              happening today.
            </Notice>
          ) : null}

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? 'Checking in…'
                : takesDeposit
                  ? `Check in and hold BND ${formatCents(securityDeposit)}`
                  : 'Check in'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CheckOutDialog({ bookingId, reference, guestName, onClose }: DialogProps) {
  const [state, formAction, isPending] = useActionState(checkOutAction, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: `${reference} checked out`,
        description: 'The deposit stays held until the unit is inspected.',
      })
      onClose()
      router.refresh()
    }
  }, [state.status, reference, onClose, router])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Check out {guestName}?</DialogTitle>
          <DialogDescription>
            The stay ends and the booking is closed — it cannot be edited or reopened afterwards.
            Any deposit stays held until Housekeeping records an inspection and the release is
            approved.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="bookingId" value={bookingId} />

          {state.status === 'error' ? <FieldError message={state.message} /> : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Checking out…' : 'Check out'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
