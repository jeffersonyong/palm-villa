'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
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
import { Notice } from '@/components/ui/notice'
import { toast } from '@/components/ui/toast-store'
import { formatStayDate, formatTimestamp } from '@/lib/domain/dates'
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
 * board's do: to say in plain sentences what is about to happen.
 *
 * ── Check-in collects nothing ─────────────────────────────────────────────
 *
 * The security deposit is taken when the booking is made (prd.md §9.1,
 * capability B16), so by the time a guest is at the door it is either held,
 * promised and not yet verified, or was never taken — and only the first of
 * those can check in. This dialog used to ask how the deposit was being
 * taken, which was the screen assuming the door was where it happened. It now
 * states which of the three the booking is in and, for the two that cannot
 * proceed, names the way out rather than offering a button that would refuse.
 * The database refuses last, with the same sentence, for the clerk whose
 * colleague verified the transfer a second after this dialog opened.
 *
 * **The screen's one primary fill** (2026-09-04; it was `tertiary` beside
 * Edit). Arriving and leaving is the record's forward action — what the desk
 * came to this screen to do with the guest standing there — where Edit is an
 * errand and Cancel an exception. Because the button exists only when the
 * state machine allows the move, the fill is on screen exactly when it is
 * actionable and absent otherwise.
 */

const initialState: StayActionState = { status: 'idle' }

/** Where the booking's security deposit stands, as the door needs to know it. */
export interface CheckInDepositFacts {
  /** What the booking quotes. Zero is a real answer. */
  quoted: Cents
  /** Why no deposit is quoted, when the booking waived it. Null otherwise. */
  waiverReason: string | null
  /** The deposit in the safe, or null while nothing has been collected. */
  held: { amount: Cents; method: PaymentMethod; collectedAt: string } | null
  /** A transfer the customer says they sent, which nobody has verified. */
  promised: boolean
}

interface StayButtonsProps {
  bookingId: string
  reference: string
  guestName: string
  deposit: CheckInDepositFacts
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

/** Which of the three doors the guest is standing at. */
type DepositState = 'none_quoted' | 'held' | 'promised' | 'not_taken'

function depositStateOf(deposit: CheckInDepositFacts): DepositState {
  if (deposit.quoted === 0 && deposit.held === null) {
    return 'none_quoted'
  }

  if (deposit.held) {
    return 'held'
  }

  return deposit.promised ? 'promised' : 'not_taken'
}

function CheckInDialog({
  bookingId,
  reference,
  guestName,
  deposit,
  checkInDate,
  today,
  onClose,
}: DialogProps) {
  const [state, formAction, isPending] = useActionState(checkInAction, initialState)
  const router = useRouter()

  const depositState = depositStateOf(deposit)
  const canProceed = depositState === 'held' || depositState === 'none_quoted'
  const isEarly = checkInDate !== null && checkInDate !== today

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: `${guestName} is checked in`,
        description: state.held
          ? `BND ${formatCents(state.held.amount)} security deposit is held against the stay.`
          : deposit.waiverReason
            ? 'The security deposit was waived on this booking.'
            : 'No security deposit was due on this booking.',
      })
      onClose()
      router.refresh()
    }
  }, [state.status, state.held, guestName, deposit.waiverReason, onClose, router])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Check in {guestName}?</DialogTitle>
          <DialogDescription>
            {depositState === 'held' && deposit.held
              ? `The stay begins now. The BND ${formatCents(deposit.held.amount)} security deposit is already held — taken in ${PAYMENT_METHOD_LABELS[deposit.held.method].toLowerCase()} on ${formatTimestamp(deposit.held.collectedAt)} — and stays held until the unit has been inspected and the release is approved.`
              : depositState === 'none_quoted'
                ? deposit.waiverReason
                  ? `The stay begins now. The security deposit was waived when this booking was made — “${deposit.waiverReason}” — so nothing is held.`
                  : 'The stay begins now. This booking quotes no security deposit, so nothing is held.'
                : `The BND ${formatCents(deposit.quoted)} security deposit secures this booking, and it is not in yet.`}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="bookingId" value={bookingId} />

          {/* The two doors that do not open, each naming its way out. A
              notice rather than a callout: this is what to know before
              acting, not an outcome — and nothing here takes money. The
              deposit is the booking's, and the Money card on this same screen
              is where it is taken. */}
          {depositState === 'promised' ? (
            <Notice>
              The customer says they transferred it, and nobody has verified that yet.{' '}
              <Link href="/portal/payments" className="underline underline-offset-2">
                Confirm it from the payments queue
              </Link>
              , or take it in cash from the Money card below, then check the guest in.
            </Notice>
          ) : null}

          {depositState === 'not_taken' ? (
            <Notice>
              Nothing has been recorded against it. Record the deposit from the Money card below —
              in cash, or as a transfer for the queue — then check the guest in.
            </Notice>
          ) : null}

          {/* Said, not refused. A guest arriving a day early or late is a
              front-desk decision, and a system that blocks it sends somebody to
              amend the dates purely to satisfy it. */}
          {canProceed && isEarly && checkInDate ? (
            <Notice>
              This booking is dated {formatStayDate(checkInDate)}. Checking in today is recorded as
              happening today.
            </Notice>
          ) : null}

          {state.status === 'error' ? <FieldError message={state.message} /> : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              {canProceed ? 'Not yet' : 'Close'}
            </Button>
            {canProceed ? (
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Checking in…' : `Check in ${reference}`}
              </Button>
            ) : null}
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
