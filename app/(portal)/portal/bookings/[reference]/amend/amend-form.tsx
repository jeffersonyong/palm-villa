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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import type { Booking } from '@/lib/db/bookings'
import type { Unit } from '@/lib/db/inventory'
import {
  describeAmendment,
  hasAmendment,
  type AmendmentSnapshot,
} from '@/lib/domain/booking-amendment'
import type { PropertyConfig } from '@/lib/domain/config'
import { formatStayDate } from '@/lib/domain/dates'
import { extrasFromLines } from '@/lib/domain/lines'
import { formatCents } from '@/lib/domain/money'
import { priceStay } from '@/lib/domain/pricing/stay'
import { cn } from '@/lib/utils'

import { amendBookingAction, type AmendBookingState } from './actions'

/**
 * The amendment form (capability B3, amend half).
 *
 * A sibling of the walk-in form rather than an extraction of it. The two look
 * alike but differ where it counts: every field here is prefilled and
 * controlled, because the screen has to know whether the draft still matches
 * what the server holds, and the summary panel shows a *diff* rather than a
 * price for something that does not exist yet. Pulling a shared shell out of
 * the two would have meant reworking a form that is already delivered and
 * working. What is genuinely shared — `priceStay`, the formatters, the line
 * shape — is imported, so no pricing logic is duplicated.
 *
 * Dates are URL state on the page around this, so changing them re-renders
 * availability server-side. They arrive here as fixed props, which is also how
 * the walk-in form receives them.
 *
 * Save is dirty-gated (design.md §Components) and passes through a confirmation
 * that names every change, because an amendment alters what a guest pays.
 */

const FORM_ID = 'amend-booking'
const initialState: AmendBookingState = { status: 'idle' }

interface AmendFormProps {
  booking: Booking
  units: readonly Unit[]
  config: PropertyConfig
  checkIn: string
  checkOut: string
}

export function AmendForm({ booking, units, config, checkIn, checkOut }: AmendFormProps) {
  const [state, formAction, isPending] = useActionState(amendBookingAction, initialState)
  const router = useRouter()

  const existing = extrasFromLines(booking.lines)

  const [unitId, setUnitId] = useState(booking.unitId)
  const [chargeableGuests, setChargeableGuests] = useState(booking.chargeableGuests)
  const [exemptGuests, setExemptGuests] = useState(booking.exemptGuests)
  const [sofaBeds, setSofaBeds] = useState(existing.sofaBeds)
  const [lateCheckOutHours, setLateCheckOutHours] = useState(existing.lateCheckOutHours)
  const [guestName, setGuestName] = useState(booking.guestName)
  const [guestPhone, setGuestPhone] = useState(booking.guestPhone)
  const [vehicleRegistration, setVehicleRegistration] = useState(booking.vehicleRegistration ?? '')
  const [reason, setReason] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)

  // Navigating away is what dismisses the confirmation on success, so nothing
  // here sets state — a `setIsConfirming(false)` would only race the unmount.
  useEffect(() => {
    if (state.status === 'amended' && state.reference) {
      toast({ tone: 'positive', title: `${state.reference} amended` })
      router.push(`/portal/bookings/${state.reference}`)
    }
  }, [state.status, state.reference, router])

  const selectedUnit = units.find((unit) => unit.id === unitId)

  /**
   * The guest's current unit can be unavailable for a newly requested range —
   * a neighbouring booking has it from part-way through. The select then has no
   * option matching the state, and a browser silently displays its first option
   * instead: the screen would show one unit, price another, and refuse to save
   * with a message about choosing a unit that already looks chosen. Naming the
   * situation is the only honest way out of it.
   */
  const isCurrentUnitAvailable = units.some((unit) => unit.id === booking.unitId)

  const quote = selectedUnit
    ? priceStay(
        {
          unitTypeId: selectedUnit.unitTypeId,
          checkIn,
          checkOut,
          party: { chargeableGuests, exemptGuests },
          sofaBeds,
          earlyCheckInHours: 0,
          lateCheckOutHours,
        },
        config,
      )
    : null

  const before: AmendmentSnapshot = {
    unitRef: booking.unitRef,
    checkIn: booking.range.start,
    checkOut: booking.range.end,
    chargeableGuests: booking.chargeableGuests,
    exemptGuests: booking.exemptGuests,
    vehicleRegistration: booking.vehicleRegistration,
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    total: booking.total,
  }

  const after: AmendmentSnapshot = {
    unitRef: selectedUnit?.ref ?? booking.unitRef,
    // Only ever read while a unit is selected — Save is gated on the quote,
    // which needs one.
    checkIn,
    checkOut,
    chargeableGuests,
    exemptGuests,
    vehicleRegistration: vehicleRegistration.trim().toUpperCase() || null,
    guestName: guestName.trim(),
    guestPhone: guestPhone.trim(),
    total: quote?.ok ? quote.total : booking.total,
  }

  const changes = describeAmendment(before, after)
  const isDirty = hasAmendment(before, after) || reason.trim().length > 0
  const canSave = isDirty && quote?.ok === true && !isPending

  return (
    <>
      <form
        id={FORM_ID}
        action={formAction}
        className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start"
      >
        <input type="hidden" name="bookingId" value={booking.id} />
        <input type="hidden" name="expectedUpdatedAt" value={booking.updatedAt} />
        <input type="hidden" name="checkIn" value={checkIn} />
        <input type="hidden" name="checkOut" value={checkOut} />
        <input type="hidden" name="unitTypeId" value={selectedUnit?.unitTypeId ?? ''} />

        <Card>
          <section>
            <SectionHeading>Unit</SectionHeading>
            <div className="mt-md grid gap-sm">
              <Label htmlFor="unitId">{units.length} available for these dates</Label>
              {/* The empty value is the placeholder, not an option in the
                  list: the control never offers a unit the form is not
                  actually using, and `SelectValue`'s mute placeholder says so —
                  which is the job the "Choose a unit" row used to do, without
                  pretending to be a choice. Empty string rather than
                  `undefined`, so the select stays controlled either way. */}
              <Select name="unitId" value={selectedUnit ? unitId : ''} onValueChange={setUnitId}>
                <SelectTrigger id="unitId" className="max-w-[360px]">
                  <SelectValue placeholder="Choose a unit" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.ref} — {unit.unitTypeName}
                      {unit.id === booking.unitId ? ' (current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isCurrentUnitAvailable ? (
                <p className="text-body-sm text-copy">
                  {booking.unitRef} is not free for these dates — another booking has it for part of
                  the range.
                  {/* The instruction drops away once it has been acted on; the
                      fact behind it stays, because it is why the guest moved. */}
                  {selectedUnit ? null : ' Move the guest to another unit, or change the dates.'}
                </p>
              ) : null}
              <FieldError message={state.fieldErrors?.unitId} />
            </div>
          </section>

          <section className="mt-xl border-t border-divider pt-xl">
            <SectionHeading>Guests</SectionHeading>
            <div className="mt-md flex flex-wrap gap-lg">
              <NumberField
                id="chargeableGuests"
                label={`Over ${config.paxExemptAgeMax}`}
                value={chargeableGuests}
                min={1}
                onChange={setChargeableGuests}
                error={state.fieldErrors?.chargeableGuests}
              />
              <NumberField
                id="exemptGuests"
                label={`Aged ${config.paxExemptAgeMax} and under`}
                value={exemptGuests}
                min={0}
                onChange={setExemptGuests}
                error={state.fieldErrors?.exemptGuests}
              />
            </div>
          </section>

          <section className="mt-xl border-t border-divider pt-xl">
            <SectionHeading>Extras</SectionHeading>
            <div className="mt-md flex flex-wrap gap-lg">
              <NumberField
                id="sofaBeds"
                label="Sofa beds"
                value={sofaBeds}
                min={0}
                onChange={setSofaBeds}
                error={state.fieldErrors?.sofaBeds}
              />
              <NumberField
                id="lateCheckOutHours"
                label="Late check-out, hours"
                value={lateCheckOutHours}
                min={0}
                onChange={setLateCheckOutHours}
                error={state.fieldErrors?.lateCheckOutHours}
              />
            </div>
          </section>

          <section className="mt-xl border-t border-divider pt-xl">
            <SectionHeading>Guest</SectionHeading>
            <div className="mt-md grid gap-lg">
              <TextField
                id="guestName"
                label="Name"
                value={guestName}
                onChange={setGuestName}
                autoComplete="name"
                className="max-w-[420px]"
                error={state.fieldErrors?.guestName}
              />
              <div className="flex flex-wrap gap-lg">
                <TextField
                  id="guestPhone"
                  label="Phone"
                  type="tel"
                  value={guestPhone}
                  onChange={setGuestPhone}
                  autoComplete="tel"
                  className="w-[220px]"
                  error={state.fieldErrors?.guestPhone}
                />
                <TextField
                  id="vehicleRegistration"
                  label="Vehicle reg (optional)"
                  value={vehicleRegistration}
                  onChange={setVehicleRegistration}
                  className="w-[220px]"
                  error={state.fieldErrors?.vehicleRegistration}
                />
              </div>
            </div>
          </section>

          <section className="mt-xl border-t border-divider pt-xl">
            <SectionHeading>Note</SectionHeading>
            <div className="mt-md grid max-w-[420px] gap-sm">
              <Label htmlFor="reason">Why is this changing? (optional)</Label>
              <Textarea
                id="reason"
                name="reason"
                maxLength={280}
                value={reason}
                placeholder="Guest asked for one more night"
                onChange={(event) => setReason(event.target.value)}
              />
              <p className="text-caption text-muted-foreground">
                Kept with the change, your name and the time.
              </p>
            </div>
          </section>
        </Card>

        <div className="lg:sticky lg:top-xl">
          <Card>
            <p className="micro-label text-muted-foreground">After this change</p>
            <p className="mt-sm text-body-md-strong text-foreground">
              {formatStayDate(checkIn)} → {formatStayDate(checkOut)}
            </p>
            <p className="mt-xxs text-body-sm text-muted-foreground">
              {selectedUnit?.ref ?? 'no unit chosen'} · {chargeableGuests + exemptGuests}{' '}
              {chargeableGuests + exemptGuests === 1 ? 'guest' : 'guests'}
            </p>

            {quote?.ok ? (
              <>
                <dl className="mt-lg divide-y divide-divider border-t border-divider">
                  {quote.lines.map((line) => (
                    <div
                      key={`${line.type}-${line.description}`}
                      className="flex items-baseline justify-between gap-lg py-sm"
                    >
                      <dt className="text-body-sm text-copy">{line.description}</dt>
                      <dd className="text-body-sm-strong text-foreground tabular-nums">
                        {formatCents(line.amount)}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="flex items-baseline justify-between gap-lg border-t border-divider pt-md">
                  <span className="text-body-md-strong text-foreground">Total</span>
                  <span className="text-display-sm text-foreground tabular-nums">
                    BND {formatCents(quote.total)}
                  </span>
                </div>

                {quote.total !== booking.total ? (
                  <p className="mt-sm text-body-sm text-copy">
                    Was BND {formatCents(booking.total)} — a difference of BND{' '}
                    {formatCents(Math.abs(quote.total - booking.total))}{' '}
                    {quote.total > booking.total ? 'more' : 'less'}. Collect or refund it outside
                    the system.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-lg rounded-md bg-negative-tint p-md text-body-sm text-negative-deep">
                {quote?.ok === false ? quote.error.message : 'Choose a unit to see the price.'}
              </p>
            )}

            <Button
              type="button"
              className="mt-lg w-full"
              disabled={!canSave}
              onClick={() => setIsConfirming(true)}
            >
              {isPending ? 'Saving…' : 'Review change'}
            </Button>

            {!isDirty ? (
              <p className="mt-md text-caption text-muted-foreground">Nothing has changed yet.</p>
            ) : null}

            {state.status === 'error' && state.message ? (
              <p role="alert" className="mt-md text-body-sm text-negative-deep">
                {state.message}
              </p>
            ) : null}
          </Card>
        </div>
      </form>

      {isConfirming ? (
        <ConfirmAmendmentDialog
          reference={booking.reference}
          changes={changes}
          isPending={isPending}
          error={state.status === 'error' ? state.message : undefined}
          onClose={() => setIsConfirming(false)}
        />
      ) : null}
    </>
  )
}

/* ── The confirmation ──────────────────────────────────────────────────── */

/**
 * The confirmation stays open when the write is refused, and shows why.
 *
 * Closing it to reveal a message on the panel behind would move the answer away
 * from the button that asked the question — and the commonest refusal here is
 * "that unit was taken while this form was open", which the staff member has to
 * act on immediately.
 */
function ConfirmAmendmentDialog({
  reference,
  changes,
  isPending,
  error,
  onClose,
}: {
  reference: string
  changes: ReturnType<typeof describeAmendment>
  isPending: boolean
  error?: string
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Amend {reference}?</DialogTitle>
          <DialogDescription>
            Recorded against the booking with your name and the time, and both the old and new
            values are kept.
          </DialogDescription>
        </DialogHeader>

        {changes.length > 0 ? (
          <dl className="divide-y divide-divider border-y border-divider">
            {changes.map((change) => (
              <div key={change.field} className="grid gap-xxs py-sm">
                <dt className="micro-label text-muted-foreground">{change.label}</dt>
                <dd className="text-body-sm text-foreground">
                  <span className="text-muted-foreground line-through">{change.from}</span>
                  <span aria-hidden> → </span>
                  <span className="sr-only">changes to</span>
                  <span className="text-body-sm-strong">{change.to}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-body-sm text-copy">
            Only the note is being added — nothing about the stay itself changes.
          </p>
        )}

        {error ? (
          <p role="alert" className="text-body-sm text-negative-deep">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="tertiary" onClick={onClose}>
            Keep editing
          </Button>
          {/* Submits the form outside this portal by id, so the dialog stays a
              confirmation and never becomes a second copy of the fields. */}
          <Button type="submit" form={FORM_ID} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save amendment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Field primitives ──────────────────────────────────────────────────── */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="micro-label text-muted-foreground">{children}</h2>
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null
  }

  return <p className="text-body-sm text-negative-deep">{message}</p>
}

function NumberField({
  id,
  label,
  value,
  min,
  onChange,
  error,
}: {
  id: string
  label: string
  value: number
  min: number
  onChange: (value: number) => void
  error?: string
}) {
  return (
    <div className="grid w-[150px] gap-sm">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        aria-invalid={error ? true : undefined}
        className="tabular-nums"
        onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))}
      />
      <FieldError message={error} />
    </div>
  )
}

function TextField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  className,
  error,
}: {
  id: string
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  className?: string
  error?: string
}) {
  return (
    <div className={cn('grid gap-sm', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError message={error} />
    </div>
  )
}
