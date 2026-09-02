'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
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
import { addDays, formatStayDate, todayInBrunei, type StayDate } from '@/lib/domain/dates'

import {
  endLeaseAction,
  markLeasedAction,
  markOutOfServiceAction,
  returnToServiceAction,
  type UnitActionState,
} from './actions'

/**
 * What a person can do to a unit (capability B9).
 *
 * ── The actions are buttons, not a menu ───────────────────────────────────
 *
 * They were behind a `…` trigger, on the booking screen's pattern. That was
 * the wrong borrowing: a booking has a dozen things you might do to it and the
 * menu keeps the header from becoming a toolbar, whereas a unit has **two**,
 * they are mutually exclusive with their own opposites, and which two you get
 * already depends on the unit's state. Hiding two buttons behind a click cost
 * a click and bought nothing — and worse, it made the state-dependence
 * invisible: "Return to service" reads as an available action the moment you
 * can see it, where inside a menu you have to open the menu to find out.
 *
 * ── Which of these gets a dialog, and why ─────────────────────────────────
 *
 * design.md's confirmation dialog exists for two things: stating in plain
 * sentences what an action will do, and collecting the reason that goes into
 * the record. Taking a unit out of service needs both. Letting one long-term
 * needs a form. Ending a lease needs a date, and has to say which of its two
 * outcomes the date will produce before the click.
 *
 * **Returning a unit to service gets neither**, deliberately: nothing
 * surprising happens, no booking is affected, and there is no reason worth
 * typing. A dialog there would be the "are you sure" design.md refuses.
 *
 * The buttons are quiet. design.md allows one primary fill per screen region
 * and none of these is the screen's point — the screen's point is the record.
 * Taking a unit out of service keeps the red it had as a menu item, but as
 * destructive *text* on tertiary chrome (`destructive-tertiary`) rather than a
 * fill: the fill belongs on the confirmation footer, where the irreversible
 * click is, and spending it here would leave two red fills on the path with
 * only the second one meaning anything.
 */

const initialState: UnitActionState = { status: 'idle' }

interface UnitActionsProps {
  unitId: string
  ref_: string
  isOutOfService: boolean
  /** The lease covering today, if this unit is let. `end` is null when it is open-ended. */
  lease: {
    occupancyId: string
    occupantName: string
    start: StayDate
    end: StayDate | null
  } | null
  /** Whether this unit can take a lease at all — free today, and in service. */
  mayLease: boolean
  /** `unit.manage` — out of service and back. */
  canManageUnit: boolean
  /** `tenancy.manage` — leases. */
  canManageTenancy: boolean
}

type OpenDialog = 'out_of_service' | 'lease' | 'end_lease' | null

export function UnitActions(props: UnitActionsProps) {
  const { unitId, ref_, isOutOfService, lease, mayLease, canManageUnit, canManageTenancy } = props
  const [open, setOpen] = useState<OpenDialog>(null)

  return (
    <>
      {canManageUnit ? (
        isOutOfService ? (
          <ReturnToServiceButton unitId={unitId} ref_={ref_} />
        ) : (
          <Button variant="destructive-tertiary" onClick={() => setOpen('out_of_service')}>
            Take out of service
          </Button>
        )
      ) : null}

      {canManageTenancy && lease ? (
        <Button variant="tertiary" onClick={() => setOpen('end_lease')}>
          End the lease
        </Button>
      ) : null}

      {/* Absent rather than disabled when the unit cannot take one: an
          affordance that will refuse you is worse than no affordance. A unit
          that is occupied today, or out of service, is not a unit anyone can
          let — and the reason is legible from the badge beside the title. */}
      {canManageTenancy && !lease && mayLease ? (
        <Button variant="tertiary" onClick={() => setOpen('lease')}>
          Mark leased long-term
        </Button>
      ) : null}

      {open === 'out_of_service' ? (
        <OutOfServiceDialog unitId={unitId} ref_={ref_} onClose={() => setOpen(null)} />
      ) : null}

      {open === 'lease' ? (
        <LeaseDialog unitId={unitId} ref_={ref_} onClose={() => setOpen(null)} />
      ) : null}

      {open === 'end_lease' && lease ? (
        <EndLeaseDialog ref_={ref_} lease={lease} onClose={() => setOpen(null)} />
      ) : null}
    </>
  )
}

/**
 * Returning to service is one click, submitted as a form so it goes through the
 * same server action and the same permission gate as everything else here.
 */
function ReturnToServiceButton({ unitId, ref_ }: { unitId: string; ref_: string }) {
  const [state, formAction, isPending] = useActionState(returnToServiceAction, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: `${ref_} is back in service`,
        description: 'It can be booked again.',
      })
      router.refresh()
    }

    if (state.status === 'error' && state.message) {
      toast({ tone: 'negative', title: 'That did not work', description: state.message })
    }
  }, [state, ref_, router])

  return (
    <form action={formAction}>
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="ref" value={ref_} />
      <Button type="submit" variant="tertiary" disabled={isPending}>
        {isPending ? 'Returning…' : 'Return to service'}
      </Button>
    </form>
  )
}

function OutOfServiceDialog({
  unitId,
  ref_,
  onClose,
}: {
  unitId: string
  ref_: string
  onClose: () => void
}) {
  const [state, formAction, isPending] = useActionState(markOutOfServiceAction, initialState)
  const router = useRouter()
  // Held here rather than left to the DOM, because React resets an uncontrolled
  // form as soon as its action returns — so a rejected submit used to hand back
  // an error *and* an empty box, asking the person to retype what they had
  // already written correctly. State survives the round trip; a DOM value does
  // not.
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: `${ref_} is out of service`,
        description: 'It has left availability.',
      })
      onClose()
      router.refresh()
    }
  }, [state.status, ref_, onClose, router])

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Take {ref_} out of service?</DialogTitle>
          {/* What will happen, in plain sentences — design.md, rather than
              "are you sure". */}
          <DialogDescription>
            It stops appearing in availability, so nobody can be booked into it, and it drops out of
            the free-unit counts. Its bookings and its history stay exactly as they are. You can
            return it to service at any time.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="ref" value={ref_} />

          <div className="grid gap-sm">
            <Label htmlFor="reason">What is wrong with it?</Label>
            <Textarea
              id="reason"
              name="reason"
              required
              maxLength={280}
              placeholder="Aircon compressor failed — parts ordered"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors?.reason)}
            />
            {state.fieldErrors?.reason ? (
              <FieldError message={state.fieldErrors.reason} />
            ) : (
              <p className="text-caption text-muted-foreground">
                Shown on the units board, so the next person does not have to ring anyone to find
                out.
              </p>
            )}
          </div>

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Leave it in service
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? 'Taking out…' : 'Take out of service'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LeaseDialog({
  unitId,
  ref_,
  onClose,
}: {
  unitId: string
  ref_: string
  onClose: () => void
}) {
  const [state, formAction, isPending] = useActionState(markLeasedAction, initialState)
  const router = useRouter()
  const [today] = useState(() => todayInBrunei())
  // Every field is controlled, for the reason `OutOfServiceDialog` gives: React
  // resets an uncontrolled form once its action returns, so the old version
  // answered "you didn't pick an end date" by also throwing away the tenant's
  // name.
  const [occupantName, setOccupantName] = useState('')
  const [start, setStart] = useState<StayDate>(today)
  const [end, setEnd] = useState<StayDate | null>(null)

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: `${ref_} is let long-term`,
        description: 'It will not be offered for those dates.',
      })
      onClose()
      router.refresh()
    }
  }, [state.status, ref_, onClose, router])

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Mark {ref_} leased long-term</DialogTitle>
          <DialogDescription>
            The unit stops being offered for those dates, by the same rule that stops two guests
            booking the same night. It becomes available again the day the lease ends.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="ref" value={ref_} />

          <div className="grid gap-sm">
            <Label htmlFor="occupantName">Let to</Label>
            <Input
              id="occupantName"
              name="occupantName"
              required
              maxLength={120}
              placeholder="Tan Family"
              value={occupantName}
              onChange={(event) => setOccupantName(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors?.occupantName)}
            />
            {state.fieldErrors?.occupantName ? (
              <FieldError message={state.fieldErrors.occupantName} />
            ) : null}
          </div>

          {/* `items-start`, or the two columns stretch to each other's height:
              the taller one — an error message under the end date — makes the
              shorter one distribute the slack between its own rows, and
              "Starts" visibly drops below "Ends" the moment a submit is
              rejected. */}
          <div className="grid grid-cols-2 items-start gap-md">
            <div className="grid gap-sm">
              <Label htmlFor="start">Starts</Label>
              <DateField
                id="start"
                name="start"
                value={start}
                onChange={(day) => setStart(day ?? today)}
                invalid={Boolean(state.fieldErrors?.start)}
              />
              {state.fieldErrors?.start ? <FieldError message={state.fieldErrors.start} /> : null}
            </div>

            <div className="grid gap-sm">
              <Label htmlFor="end">
                Ends <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              {/* Bounded by the start rather than by today: a lease covers at
                  least one night, so the day before the end date is not a
                  choice the calendar should offer and then have the server
                  refuse. `clearable`, because a date picked by mistake has to
                  be removable now that the field is not required (N19). */}
              <DateField
                id="end"
                name="end"
                value={end}
                onChange={setEnd}
                min={addDays(start, 1)}
                clearable
                placeholder="No end date"
                invalid={Boolean(state.fieldErrors?.end)}
                // Both, in reading order, when there is a rejection: what is
                // wrong, then what to put there. The trigger is a button, so
                // this is the only way either reaches a screen reader.
                describedBy={state.fieldErrors?.end ? 'end-error end-hint' : 'end-hint'}
              />
              {state.fieldErrors?.end ? (
                <FieldError id="end-error" message={state.fieldErrors.end} />
              ) : null}
            </div>
          </div>

          {/* Full width, under both dates rather than squeezed into the right
              column — a hint that wraps to four lines in a half-width column
              reads as a warning rather than as help. What it has to say is that
              leaving the field empty is a real answer and not an omission
              (N19): a month-to-month tenancy has no agreed last day, and the
              form used to make staff invent one so the software would accept
              the truth. */}
          <p id="end-hint" className="-mt-sm text-caption text-muted-foreground">
            Leave the end date empty for a month-to-month tenancy. The unit stays occupied until
            somebody ends the lease.
          </p>

          {/* scope X5: full tenancy management — agreements, rent collection,
              renewals — is a defined phase-three extension. Saying so here is
              what stops this dialog reading as the beginning of one. */}
          <Notice>
            No rent, agreement or renewal is recorded here. This marks the unit as occupied so
            availability stays honest.
          </Notice>

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Don&rsquo;t mark it
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Mark leased'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EndLeaseDialog({
  ref_,
  lease,
  onClose,
}: {
  ref_: string
  lease: { occupancyId: string; occupantName: string; start: StayDate; end: StayDate | null }
  onClose: () => void
}) {
  const [state, formAction, isPending] = useActionState(endLeaseAction, initialState)
  const router = useRouter()
  const [end, setEnd] = useState<StayDate | null>(lease.end)

  // Which outcome the chosen date produces, said before the click rather than
  // discovered afterwards. A lease cannot end on the day it began — an
  // occupancy covers at least one night — so a date that early is not an
  // ending at all, it is a lease recorded in error.
  const willUnwind = end !== null && end <= lease.start

  // This dialog now does two jobs, because they are one statement in the
  // database: moving the last day of a lease that has one, and giving a last
  // day to a month-to-month tenancy that never had one (N19). Only the wording
  // differs, and it has to — "Change the end date" against a lease with no end
  // date describes something that is not happening.
  const isOpenEnded = lease.end === null

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title:
          state.outcome === 'cancelled'
            ? `The lease on ${ref_} was removed`
            : `The lease on ${ref_} now ends ${end === null ? 'as recorded' : formatStayDate(end)}`,
        description: lease.occupantName,
      })
      onClose()
      router.refresh()
    }
  }, [state.status, state.outcome, ref_, end, lease.end, lease.occupantName, onClose, router])

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>End the lease on {ref_}?</DialogTitle>
          <DialogDescription>
            {isOpenEnded
              ? `Let to ${lease.occupantName} since ${formatStayDate(lease.start)}, with no end date. Give it one and the unit becomes available again from that day.`
              : `Let to ${lease.occupantName} until ${formatStayDate(lease.end!)}. The unit becomes available again from the day the lease ends.`}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="occupancyId" value={lease.occupancyId} />
          <input type="hidden" name="ref" value={ref_} />

          <div className="grid gap-sm">
            <Label htmlFor="lease-end">Ends on</Label>
            {/* Required here, unlike the field that creates a lease: this
                dialog exists to set a last day. Clearing one — turning a fixed
                term back into a month-to-month tenancy — is a different action
                and does not belong behind a button called "End the lease". */}
            <DateField
              id="lease-end"
              name="end"
              value={end}
              onChange={setEnd}
              min={addDays(lease.start, 1)}
              invalid={Boolean(state.fieldErrors?.end)}
              describedBy={state.fieldErrors?.end ? 'lease-end-error' : 'lease-end-hint'}
            />
            {state.fieldErrors?.end ? (
              <FieldError id="lease-end-error" message={state.fieldErrors.end} />
            ) : (
              <p id="lease-end-hint" className="text-caption text-muted-foreground">
                {willUnwind
                  ? `That is on or before the lease started (${formatStayDate(lease.start)}), so the lease will be removed altogether and the unit freed immediately.`
                  : end === null
                    ? 'Pick the day the tenant leaves. The unit is bookable again from that day.'
                    : `The unit is free again from ${formatStayDate(end)}.`}
              </p>
            )}
          </div>

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Leave the lease
            </Button>
            <Button
              type="submit"
              variant={willUnwind ? 'destructive' : 'primary'}
              disabled={isPending}
            >
              {isPending
                ? 'Saving…'
                : willUnwind
                  ? 'Remove the lease'
                  : isOpenEnded
                    ? 'Set the end date'
                    : 'Change the end date'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
