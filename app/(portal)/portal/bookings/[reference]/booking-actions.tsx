'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import { Notice } from '@/components/ui/notice'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import type { DepositAtClose } from '@/lib/domain/deposit'
import { formatCents } from '@/lib/domain/money'

import { cancelBookingAction, markNoShowAction, type CloseBookingState } from './close-actions'

/**
 * The two ways a booking closes without a stay, and only those.
 *
 * Amend is a link to its own screen and stays a server-rendered button on the
 * page; this island exists because both closes need a confirmation that says
 * what happens to the money. Keeping it that narrow is what lets the detail
 * screen itself remain a server component.
 *
 * Whether either is offered is the caller's question, answered from the state
 * machine and the calendar before this renders (`allowedEvents`,
 * `canMarkNoShow`). A booking that can do neither has no menu button, rather
 * than a menu that opens onto nothing.
 *
 * ── The deposit, said before the click ────────────────────────────────────
 *
 * prd.md §9.5: a guest who cancels or never arrives forfeits the security
 * deposit. Both dialogs state what that means for *this* booking, from
 * `depositAtClose()` — a figure in the safe, a transfer that never arrived, a
 * waiver, or nothing quoted — so nobody closes a booking wondering what
 * happened to the BND 100. Only a cancellation with a deposit actually held
 * asks anything, and what it asks is whether this is the cancellation the
 * rule is about.
 */

const initialState: CloseBookingState = { status: 'idle' }

interface BookingActionsProps {
  bookingId: string
  reference: string
  guestName: string
  mayCancel: boolean
  mayMarkNoShow: boolean
  /** What closing the booking would do to its deposit. */
  deposit: DepositAtClose
}

type Closing = 'cancel' | 'no_show' | null

export function BookingActions(props: BookingActionsProps) {
  const [closing, setClosing] = useState<Closing>(null)
  const close = () => setClosing(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="tertiary" size="icon" aria-label={`Actions for ${props.reference}`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {props.mayMarkNoShow ? (
            <DropdownMenuItem onSelect={() => setClosing('no_show')}>
              Mark as no-show
            </DropdownMenuItem>
          ) : null}
          {props.mayCancel ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setClosing('cancel')}>
              Cancel booking
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mounted only while open, so each opens with fresh action state. */}
      {closing === 'cancel' ? <CancelBookingDialog {...props} onClose={close} /> : null}
      {closing === 'no_show' ? <NoShowDialog {...props} onClose={close} /> : null}
    </>
  )
}

type DialogProps = BookingActionsProps & { onClose: () => void }

function CancelBookingDialog({ bookingId, reference, guestName, deposit, onClose }: DialogProps) {
  const [state, formAction, isPending] = useActionState(cancelBookingAction, initialState)
  useClosedToast(state, `${reference} cancelled`, guestName, onClose)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Cancel {reference}?</DialogTitle>
          <DialogDescription>
            The unit returns to availability immediately. The booking stays on the record and in the
            audit trail, but it cannot be reinstated — if this guest rebooks, that is a new booking.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="bookingId" value={bookingId} />

          <div className="grid gap-sm">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              name="reason"
              required
              maxLength={280}
              placeholder="Guest cancelled by phone"
              aria-invalid={Boolean(state.fieldErrors?.reason)}
            />
            {state.fieldErrors?.reason ? (
              <FieldError message={state.fieldErrors.reason} />
            ) : (
              <p className="text-caption text-muted-foreground">
                Recorded against the booking with your name and the time.
              </p>
            )}
          </div>

          {deposit.kind === 'held' ? (
            <fieldset className="grid gap-sm">
              <legend className="mb-sm text-body-sm-strong text-foreground">
                The BND {formatCents(deposit.amount)} security deposit
              </legend>
              {deposit.shortfall > 0 ? (
                <p className="text-caption text-muted-foreground">
                  Only BND {formatCents(deposit.amount)} arrived, BND{' '}
                  {formatCents(deposit.shortfall)} short of the quote. That is what is kept or given
                  back.
                </p>
              ) : null}
              <OutcomeOption
                value="keep"
                defaultChecked
                title="Keep it — the guest cancelled"
                hint="Forfeited under the cancellation policy, and counted as revenue today."
              />
              <OutcomeOption
                value="return"
                title="Give it back — cancelled by us, or made in error"
                hint="Recorded as returned, against the reason above. Handing it back happens outside the system."
              />
            </fieldset>
          ) : (
            <>
              <input type="hidden" name="depositOutcome" value="keep" />
              <NothingKept deposit={deposit} />
            </>
          )}

          <Notice>Anything paid for the stay itself is refunded outside the system.</Notice>

          {state.status === 'error' ? <FieldError message={state.message} /> : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Keep booking
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? 'Cancelling…' : 'Cancel booking'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NoShowDialog({ bookingId, reference, guestName, deposit, onClose }: DialogProps) {
  const [state, formAction, isPending] = useActionState(markNoShowAction, initialState)
  useClosedToast(state, `${reference} marked as a no-show`, guestName, onClose)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Mark {reference} as a no-show?</DialogTitle>
          <DialogDescription>
            {guestName} did not arrive. The booking closes and cannot be reopened, and the unit goes
            back on sale for the nights they did not use — a guest who turns up later needs a new
            booking.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="bookingId" value={bookingId} />

          {deposit.kind === 'held' ? (
            <Notice>
              The BND {formatCents(deposit.amount)} security deposit is kept — a guest who does not
              arrive forfeits it — and counts as revenue today.
            </Notice>
          ) : (
            <NothingKept deposit={deposit} />
          )}

          {state.status === 'error' ? <FieldError message={state.message} /> : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? 'Closing…' : 'Mark as no-show'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One choice of two, drawn as a bordered row a finger or a pointer can hit
 * anywhere on. Native radios, because a form post is all this needs and the
 * browser's own keyboard handling for a group is the correct one.
 */
function OutcomeOption({
  value,
  title,
  hint,
  defaultChecked,
}: {
  value: 'keep' | 'return'
  title: string
  hint: string
  defaultChecked?: boolean
}) {
  const id = `deposit-outcome-${value}`

  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-sm rounded-md border border-border p-md transition-colors has-[:checked]:border-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
    >
      <input
        id={id}
        type="radio"
        name="depositOutcome"
        value={value}
        defaultChecked={defaultChecked}
        className="mt-[3px] size-4 shrink-0 accent-foreground"
      />
      <span className="grid gap-xxs">
        <span className="text-body-sm-strong text-foreground">{title}</span>
        <span className="text-caption text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

/** The sentence for a close that keeps nothing, and why it keeps nothing. */
function NothingKept({ deposit }: { deposit: Exclude<DepositAtClose, { kind: 'held' }> }) {
  switch (deposit.kind) {
    case 'promised':
      return (
        <Notice>
          The deposit transfer was never verified, so nothing is held and nothing is kept. It leaves
          the payments queue — if the money does arrive, it is given back outside the system.
        </Notice>
      )
    case 'waived':
      return (
        <Notice>
          The security deposit was waived when the booking was made (&ldquo;{deposit.reason}
          &rdquo;), so nothing is kept.
        </Notice>
      )
    case 'not_taken':
      return (
        <Notice>No security deposit was taken against this booking, so nothing is kept.</Notice>
      )
    case 'not_quoted':
      return <Notice>This booking quotes no security deposit, so nothing is kept.</Notice>
    case 'settled':
      return null
  }
}

/** Says what happened, closes the dialog, and asks the server-rendered screen to rebuild. */
function useClosedToast(
  state: CloseBookingState,
  title: string,
  guestName: string,
  onClose: () => void,
): void {
  const router = useRouter()

  useEffect(() => {
    if (state.status !== 'done') {
      return
    }

    const closed = state.closed
    const description =
      closed?.deposit === 'kept'
        ? `BND ${formatCents(closed.amount)} security deposit kept`
        : closed?.deposit === 'returned'
          ? `BND ${formatCents(closed.amount)} security deposit recorded as returned`
          : guestName

    toast({ tone: 'positive', title, description })
    onClose()
    // The status badge, the Money card and the action set all change; the
    // screen is server rendered, so it has to be asked to rebuild.
    router.refresh()
  }, [state.status, state.closed, title, guestName, onClose, router])
}
