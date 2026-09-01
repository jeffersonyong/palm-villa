'use client'

import { MoreHorizontal } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Notice } from '@/components/ui/notice'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import { formatStayDate, todayInBrunei, type StayDate } from '@/lib/domain/dates'

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
 * ── Which of these gets a dialog, and why ─────────────────────────────────
 *
 * design.md's confirmation dialog exists for two things: stating in plain
 * sentences what an action will do, and collecting the reason that goes into
 * the record. Taking a unit out of service needs both. Letting one long-term
 * needs a form. Ending a lease needs a date, and has to say which of its two
 * outcomes the date will produce before the click.
 *
 * **Returning a unit to service gets neither**, and that is deliberate rather
 * than an omission: nothing surprising happens, no booking is affected, and
 * there is no reason worth typing. A dialog there would be the "are you sure"
 * design.md refuses.
 *
 * The menu only ever offers what the unit's current state allows, so there is
 * no disabled item that never explains itself. A unit that is out of service
 * cannot be let; a unit with no lease has nothing to end.
 */

const initialState: UnitActionState = { status: 'idle' }

interface UnitActionsProps {
  unitId: string
  ref_: string
  isOutOfService: boolean
  /** The lease covering today, if this unit is let. */
  lease: { occupancyId: string; occupantName: string; start: StayDate; end: StayDate } | null
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

  const items = [
    canManageUnit && !isOutOfService && 'out_of_service',
    canManageUnit && isOutOfService && 'return',
    canManageTenancy && !lease && mayLease && 'lease',
    canManageTenancy && lease && 'end_lease',
  ].filter(Boolean)

  // No menu at all rather than an empty one: a trigger that opens onto nothing
  // is worse than no trigger.
  if (items.length === 0) {
    return null
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="tertiary" size="icon" aria-label={`Actions for ${ref_}`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canManageUnit && !isOutOfService ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpen('out_of_service')}>
              Take out of service
            </DropdownMenuItem>
          ) : null}

          {canManageUnit && isOutOfService ? (
            <ReturnToServiceItem unitId={unitId} ref_={ref_} />
          ) : null}

          {canManageTenancy && !lease && mayLease ? (
            <DropdownMenuItem onSelect={() => setOpen('lease')}>
              Mark leased long-term
            </DropdownMenuItem>
          ) : null}

          {canManageTenancy && lease ? (
            <DropdownMenuItem onSelect={() => setOpen('end_lease')}>End the lease</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

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
 * Returning to service is one click, submitted from the menu item itself.
 *
 * A form rather than a fetch, so it goes through the same server action and the
 * same permission gate as everything else here.
 */
function ReturnToServiceItem({ unitId, ref_ }: { unitId: string; ref_: string }) {
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
      <DropdownMenuItem asChild>
        <button type="submit" disabled={isPending} className="w-full">
          {isPending ? 'Returning…' : 'Return to service'}
        </button>
      </DropdownMenuItem>
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

  useEffect(() => {
    if (state.status === 'done') {
      toast({ tone: 'positive', title: `${ref_} is out of service`, description: 'It has left availability.' })
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

  useEffect(() => {
    if (state.status === 'done') {
      toast({ tone: 'positive', title: `${ref_} is let long-term`, description: 'It will not be offered for those dates.' })
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
              aria-invalid={Boolean(state.fieldErrors?.occupantName)}
            />
            {state.fieldErrors?.occupantName ? (
              <FieldError message={state.fieldErrors.occupantName} />
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-md">
            <div className="grid gap-sm">
              <Label htmlFor="start">Starts</Label>
              <DateField
                id="start"
                name="start"
                defaultValue={today}
                invalid={Boolean(state.fieldErrors?.start)}
              />
              {state.fieldErrors?.start ? <FieldError message={state.fieldErrors.start} /> : null}
            </div>

            <div className="grid gap-sm">
              <Label htmlFor="end">Ends</Label>
              <DateField
                id="end"
                name="end"
                min={today}
                invalid={Boolean(state.fieldErrors?.end)}
                describedBy={state.fieldErrors?.end ? 'end-error' : undefined}
              />
              {state.fieldErrors?.end ? (
                <FieldError id="end-error" message={state.fieldErrors.end} />
              ) : null}
            </div>
          </div>

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
              Don’t mark it
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
  lease: { occupancyId: string; occupantName: string; start: StayDate; end: StayDate }
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

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title:
          state.outcome === 'cancelled'
            ? `The lease on ${ref_} was removed`
            : `The lease on ${ref_} now ends ${formatStayDate(end ?? lease.end)}`,
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
            Let to {lease.occupantName} until {formatStayDate(lease.end)}. The unit becomes
            available again from the day the lease ends.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="occupancyId" value={lease.occupancyId} />
          <input type="hidden" name="ref" value={ref_} />

          <div className="grid gap-sm">
            <Label htmlFor="lease-end">Ends on</Label>
            <DateField
              id="lease-end"
              name="end"
              value={end}
              onChange={setEnd}
              invalid={Boolean(state.fieldErrors?.end)}
            />
            {state.fieldErrors?.end ? (
              <FieldError message={state.fieldErrors.end} />
            ) : (
              <p className="text-caption text-muted-foreground">
                {willUnwind
                  ? `That is on or before the lease started (${formatStayDate(lease.start)}), so the lease will be removed altogether and the unit freed immediately.`
                  : `The unit is free again from ${formatStayDate(end ?? lease.end)}.`}
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
            <Button type="submit" variant={willUnwind ? 'destructive' : 'primary'} disabled={isPending}>
              {isPending ? 'Saving…' : willUnwind ? 'Remove the lease' : 'Change the end date'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
