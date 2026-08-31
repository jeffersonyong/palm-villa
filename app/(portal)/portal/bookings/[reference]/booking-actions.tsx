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

import { cancelBookingAction, type BookingActionState } from './actions'

/**
 * The destructive actions on a booking, and only those.
 *
 * Amend is a link to its own screen and stays a server-rendered button on the
 * page; this island exists solely because cancelling needs a confirmation with
 * a typed reason. Keeping it that narrow is what lets the detail screen itself
 * remain a server component.
 *
 * Whether a booking may be cancelled at all is the caller's question, answered
 * from the state machine before this renders. A booking that cannot be
 * cancelled therefore has no menu button, rather than a menu that opens onto
 * nothing or a disabled item that never explains itself.
 */

const initialState: BookingActionState = { status: 'idle' }

interface BookingActionsProps {
  bookingId: string
  reference: string
  guestName: string
}

export function BookingActions({ bookingId, reference, guestName }: BookingActionsProps) {
  const [isCancelling, setIsCancelling] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="tertiary" size="icon" aria-label={`Actions for ${reference}`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setIsCancelling(true)}>
            Cancel booking
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isCancelling ? (
        <CancelBookingDialog
          bookingId={bookingId}
          reference={reference}
          guestName={guestName}
          onClose={() => setIsCancelling(false)}
        />
      ) : null}
    </>
  )
}

function CancelBookingDialog({
  bookingId,
  reference,
  guestName,
  onClose,
}: BookingActionsProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(cancelBookingAction, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'done') {
      toast({ tone: 'positive', title: `${reference} cancelled`, description: guestName })
      onClose()
      // The status badge and the action set both change; the screen is server
      // rendered, so it has to be asked to rebuild.
      router.refresh()
    }
  }, [state.status, onClose, reference, guestName, router])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
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

          {/* prd.md §18 N5 is open: the PRD forfeits "the deposit" on
              cancellation without saying which payment that means. Until the
              client answers, the honest thing is to say no money moves here
              rather than to imply a policy the system does not implement. */}
          <Notice>
            No refund or forfeiture is calculated here. Any money already taken is settled outside
            the system.
          </Notice>

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
