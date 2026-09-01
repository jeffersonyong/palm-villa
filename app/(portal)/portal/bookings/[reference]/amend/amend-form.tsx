'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { NumberField, TextField } from '@/components/portal/form-fields'
import {
  DiscountFields,
  NO_DISCOUNT,
  toDiscountFormValues,
  type DiscountValue,
} from '@/components/portal/discount-fields'
import { FormSection } from '@/components/portal/form-section'
import { VehicleFields } from '@/components/portal/vehicle-fields'
import { QuoteLines, QuoteSummary } from '@/components/portal/quote-summary'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import type { Booking, BookingStay } from '@/lib/db/bookings'
import type { Unit } from '@/lib/db/inventory'
import {
  describeAmendment,
  hasAmendment,
  type AmendmentSnapshot,
} from '@/lib/domain/booking-amendment'
import type { PropertyConfig } from '@/lib/domain/config'
import { formatStayDate } from '@/lib/domain/dates'
import { parseDiscount, type Discount } from '@/lib/domain/discount'
import { extrasFromLines } from '@/lib/domain/lines'
import { formatCents } from '@/lib/domain/money'
import { priceStay } from '@/lib/domain/pricing/stay'
import { normaliseVehicleRegistrations } from '@/lib/domain/vehicle'

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
 * shape, and now the section, field and summary-card primitives — is
 * imported, so no pricing logic and no chrome is duplicated.
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
  /**
   * The booking's occupancy, narrowed by the page.
   *
   * `Booking.stay` is nullable now that the read model carries every stream,
   * and this form amends a *stay*: it picks a unit and a range, and reprices
   * nights. Rather than checking for null at each of the eight places it is
   * read, the page refuses a booking without one and hands the rest down
   * already narrowed.
   */
  stay: BookingStay
  units: readonly Unit[]
  config: PropertyConfig
  checkIn: string
  checkOut: string
  /**
   * Whether this staff member holds `booking.discount`.
   *
   * When false the control is not rendered and the form submits nothing for
   * it — and the action then carries the booking's existing discount through
   * untouched, rather than reading a removal into the silence.
   */
  mayDiscount: boolean
}

export function AmendForm({
  booking,
  stay,
  units,
  config,
  checkIn,
  checkOut,
  mayDiscount,
}: AmendFormProps) {
  const [state, formAction, isPending] = useActionState(amendBookingAction, initialState)
  const router = useRouter()

  const existing = extrasFromLines(booking.lines)

  const [unitId, setUnitId] = useState(stay.unitId)
  const [chargeableGuests, setChargeableGuests] = useState(booking.chargeableGuests)
  const [exemptGuests, setExemptGuests] = useState(booking.exemptGuests)
  const [sofaBeds, setSofaBeds] = useState(existing.sofaBeds)
  const [lateCheckOutHours, setLateCheckOutHours] = useState(existing.lateCheckOutHours)
  const [guestName, setGuestName] = useState(booking.guestName)
  const [guestPhone, setGuestPhone] = useState(booking.guestPhone)
  // An empty row when the booking predates the requirement, so the section
  // asks for the plate rather than showing a filled-in nothing.
  const [vehicles, setVehicles] = useState<readonly string[]>(
    booking.vehicles.length > 0 ? [...booking.vehicles] : [''],
  )
  const [noVehicle, setNoVehicle] = useState(booking.noVehicle)
  const [discount, setDiscount] = useState<DiscountValue>(discountValueOf(booking.discount))
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
  const isCurrentUnitAvailable = units.some((unit) => unit.id === stay.unitId)

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
          discount: mayDiscount ? previewDiscount(discount) : booking.discount,
        },
        config,
      )
    : null

  const before: AmendmentSnapshot = {
    unitRef: stay.unitRef,
    checkIn: stay.range.start,
    checkOut: stay.range.end,
    chargeableGuests: booking.chargeableGuests,
    exemptGuests: booking.exemptGuests,
    vehicles: booking.vehicles,
    noVehicle: booking.noVehicle,
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    discount: booking.discount,
    total: booking.total,
  }

  const after: AmendmentSnapshot = {
    unitRef: selectedUnit?.ref ?? stay.unitRef,
    // Only ever read while a unit is selected — Save is gated on the quote,
    // which needs one.
    checkIn,
    checkOut,
    chargeableGuests,
    exemptGuests,
    // Normalised for the diff the same way the action normalises for the
    // write, so the confirmation names the plates that will actually be
    // stored — including the blank rows it drops.
    vehicles: normaliseVehicleRegistrations(vehicles),
    noVehicle,
    guestName: guestName.trim(),
    guestPhone: guestPhone.trim(),
    // The same value the action will store: read off the control when this
    // staff member may move it, and carried through unchanged when they may not.
    discount: mayDiscount ? previewDiscount(discount) : booking.discount,
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
          <FormSection title="Unit">
            <div className="grid gap-sm">
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
                      {unit.id === stay.unitId ? ' (current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isCurrentUnitAvailable ? (
                <p className="text-body-sm text-copy">
                  {stay.unitRef} is not free for these dates — another booking has it for part of
                  the range.
                  {/* The instruction drops away once it has been acted on; the
                      fact behind it stays, because it is why the guest moved. */}
                  {selectedUnit ? null : ' Move the guest to another unit, or change the dates.'}
                </p>
              ) : null}
              <FieldError message={state.fieldErrors?.unitId} />
            </div>
          </FormSection>

          <FormSection title="Guests">
            <div className="flex flex-wrap gap-lg">
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
          </FormSection>

          <FormSection title="Extras">
            <div className="flex flex-wrap gap-lg">
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
          </FormSection>

          <FormSection title="Guest">
            {/* One row, sized to what each field holds rather than split evenly:
                a name needs room, a Brunei number does not. Two full-width rows for
                two short fields was a row of empty space in a form the desk fills in
                with a guest waiting. */}
            <div className="flex flex-wrap items-start gap-lg">
              <TextField
                id="guestName"
                label="Name"
                placeholder="John Doe"
                value={guestName}
                onChange={setGuestName}
                autoComplete="name"
                className="w-[320px]"
                error={state.fieldErrors?.guestName}
              />
              <TextField
                id="guestPhone"
                label="Phone"
                type="tel"
                placeholder="+673 712 3456"
                value={guestPhone}
                onChange={setGuestPhone}
                autoComplete="tel"
                className="w-[220px]"
                error={state.fieldErrors?.guestPhone}
              />
            </div>
          </FormSection>

          <FormSection title="Vehicles">
            <VehicleFields
              vehicles={vehicles}
              onChange={setVehicles}
              noVehicle={noVehicle}
              onNoVehicleChange={setNoVehicle}
              error={state.fieldErrors?.vehicles}
            />
          </FormSection>

          {mayDiscount ? (
            <FormSection title="Discount">
              <DiscountFields value={discount} onChange={setDiscount} errors={state.fieldErrors} />
            </FormSection>
          ) : null}

          <FormSection title="Note">
            <div className="grid max-w-[420px] gap-sm">
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
          </FormSection>
        </Card>

        <QuoteSummary
          eyebrow="After this change"
          headline={`${formatStayDate(checkIn)} → ${formatStayDate(checkOut)}`}
          detail={
            <>
              {selectedUnit?.ref ?? 'no unit chosen'} · {chargeableGuests + exemptGuests}{' '}
              {chargeableGuests + exemptGuests === 1 ? 'guest' : 'guests'}
            </>
          }
        >
          {quote?.ok ? (
            <>
              <QuoteLines lines={quote.lines} total={quote.total} />

              {quote.total !== booking.total ? (
                <p className="mt-sm text-body-sm text-copy">
                  Was BND {formatCents(booking.total)} — a difference of BND{' '}
                  {formatCents(Math.abs(quote.total - booking.total))}{' '}
                  {quote.total > booking.total ? 'more' : 'less'}. Collect or refund it outside the
                  system.
                </p>
              ) : null}
            </>
          ) : (
            <Callout className="mt-lg">
              {quote?.ok === false ? quote.error.message : 'Choose a unit to see the price.'}
            </Callout>
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

          {state.status === 'error' ? (
            <FieldError className="mt-md" message={state.message} />
          ) : null}
        </QuoteSummary>
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

        <FieldError message={error} />

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

/**
 * The stored instruction as the control's three strings.
 *
 * A percentage comes back as a percentage and an amount as BND, so an
 * amendment reprices what was actually agreed rather than the cents it
 * happened to produce on the shorter stay.
 */
function discountValueOf(discount: Discount | null): DiscountValue {
  if (!discount) {
    return NO_DISCOUNT
  }

  return {
    kind: discount.kind,
    value: discount.kind === 'percent' ? String(discount.value) : formatCents(discount.value),
    reason: discount.reason,
  }
}

/**
 * The discount as the price card should show it mid-edit.
 *
 * The stand-in reason exists only to satisfy the parse while a clerk is still
 * typing one; nothing submits it, and a figure that cannot be read yet
 * previews as no discount rather than as an error. Same helper, same reasoning,
 * as the walk-in form's.
 */
function previewDiscount(value: DiscountValue): Discount | null {
  if (value.kind === 'none') {
    return null
  }

  const parsed = parseDiscount({
    ...toDiscountFormValues(value),
    reason: value.reason.trim() || 'pending',
  })

  return parsed.ok ? parsed.discount : null
}
