'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Unit } from '@/lib/db/inventory'
import { formatStayDate, type StayDate } from '@/lib/domain/dates'

/**
 * What was chosen on the grid, before anything is created.
 *
 * The two clicks that pick a stay are cheap to make and easy to make wrong —
 * a pointer that slipped a column is a booking on the wrong night — so they
 * do not navigate anywhere on their own. This reads the choice back in the
 * words the desk would use, and only then hands over to the booking form.
 *
 * It creates nothing itself. The form is where a guest's name, the party, the
 * payment and the deposit are taken, and it is the one place a booking is
 * made; this is the step that says *which* booking is about to be started.
 * Everything it shows is carried in the link, so the form opens already
 * holding the unit and the dates rather than asking for them again.
 */

export interface ChosenNights {
  unit: Unit
  checkIn: StayDate
  checkOut: StayDate
  nights: number
}

interface NewBookingDialogProps {
  chosen: ChosenNights | null
  onClose: () => void
}

export function NewBookingDialog({ chosen, onClose }: NewBookingDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function proceed() {
    if (!chosen) {
      return
    }

    const params = new URLSearchParams({
      from: chosen.checkIn,
      to: chosen.checkOut,
      type: chosen.unit.unitTypeId,
      // The row that was clicked. The form lists every unit free for these
      // dates and would otherwise open on the first of them, which is not the
      // one this dialog just named.
      unit: chosen.unit.ref,
    })

    startTransition(() => {
      router.push(`/portal/bookings/new?${params.toString()}` as Route)
    })
  }

  return (
    <Dialog open={chosen !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Start this booking?</DialogTitle>
          <DialogDescription>
            Nothing is held yet. The next screen takes the guest and the payment.
          </DialogDescription>
        </DialogHeader>

        {chosen ? (
          <dl className="grid gap-md">
            <Line label="Unit" value={chosen.unit.ref} mono />
            <Line label="Check-in" value={formatStayDate(chosen.checkIn)} />
            <Line label="Check-out" value={formatStayDate(chosen.checkOut)} />
            <Line
              label="Nights"
              value={`${chosen.nights} ${chosen.nights === 1 ? 'night' : 'nights'}`}
            />
          </dl>
        ) : null}

        <DialogFooter>
          <Button variant="tertiary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={proceed} disabled={isPending}>
            {isPending ? 'Opening…' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One fact, label left and value right — the receipt grammar the booking
 * confirmation already uses, so the dialog reads like the screen it leads to.
 */
function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-md">
      <dt className="micro-label text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? 'font-mono text-body-sm text-foreground tabular-nums'
            : 'text-body-sm text-foreground'
        }
      >
        {value}
      </dd>
    </div>
  )
}
