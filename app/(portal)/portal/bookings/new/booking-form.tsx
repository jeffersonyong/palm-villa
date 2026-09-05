'use client'

import { useState } from 'react'

import {
  DepositWaiverControl,
  NO_WAIVER,
  type DepositWaiverValue,
} from '@/components/portal/deposit-waiver-control'
import {
  DiscountFields,
  NO_DISCOUNT,
  toDiscountFormValues,
  type DiscountValue,
} from '@/components/portal/discount-fields'
import { NumberField, TextField } from '@/components/portal/form-fields'
import { FormSection } from '@/components/portal/form-section'
import { VehicleFields } from '@/components/portal/vehicle-fields'
import { QuoteLines, QuoteSummary } from '@/components/portal/quote-summary'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
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
import type { Unit } from '@/lib/db/inventory'
import type { PropertyConfig } from '@/lib/domain/config'
import { formatStayDate } from '@/lib/domain/dates'
import { parseDiscount } from '@/lib/domain/discount'
import { formatCents } from '@/lib/domain/money'
import type { PaymentMethod } from '@/lib/domain/payment'
import { priceStay } from '@/lib/domain/pricing/stay'

import type { WalkInBookingState } from './actions'

/**
 * The walk-in booking form (capability B2).
 *
 * Composition, per design.md §Components "Portal forms": ONE summary card, not
 * a stack of sibling cards — sections divide with hairlines and take the
 * data-surface header voice (caption uppercase mute). Fields are sized to
 * their content: a two-digit guest count does not get a full row. The price
 * sits beside the form as the signature `booking-summary-card`, sticky, with
 * tabular figures, carrying the screen's one primary CTA.
 *
 * Client-side so the price updates as staff type — a clerk reading a total
 * back to a guest should not wait on a round trip per keystroke. Pricing runs
 * here AND on the server; that is not duplication, `priceStay` is one pure
 * function used in both places, and the submitted total is never trusted (see
 * actions.ts).
 *
 * The fields are this component's; the *outcome* is not. `NewBookingScreen`
 * owns the action state and swaps the whole screen for the confirmation when
 * a booking is created, because that outcome stands down the server-rendered
 * header and availability tiles too — which is more of the screen than a form
 * should be reaching for.
 */

interface BookingFormProps {
  units: readonly Unit[]
  config: PropertyConfig
  checkIn: string
  checkOut: string
  /** Whether this staff member holds `booking.discount`. Decided by the page. */
  mayDiscount: boolean
  /** Whether this staff member holds `deposit.waive`. Decided by the page. */
  mayWaiveDeposit: boolean
  /**
   * The create action's state, owned by `NewBookingScreen`. It lives there
   * rather than here because a booking that succeeds stands the whole screen
   * down — header, date controls and availability tiles included — and a form
   * cannot remove the chrome it is rendered inside.
   */
  state: WalkInBookingState
  formAction: (formData: FormData) => void
  isPending: boolean
}

export function BookingForm({
  units,
  config,
  checkIn,
  checkOut,
  mayDiscount,
  mayWaiveDeposit,
  state,
  formAction,
  isPending,
}: BookingFormProps) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '')
  const [chargeableGuests, setChargeableGuests] = useState(2)
  const [exemptGuests, setExemptGuests] = useState(0)
  const [sofaBeds, setSofaBeds] = useState(0)
  const [lateCheckOutHours, setLateCheckOutHours] = useState(0)
  // Controlled, like every other field here. React 19 resets an uncontrolled
  // field once a form action settles, so a submit refused for a missing
  // vehicle registration was also silently clearing the guest's name and
  // number — and asking a clerk to retype them with the guest standing there
  // is exactly the friction this screen exists to remove.
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  // One empty row to type into. prd.md §13 [C] requires a registration, so the
  // form opens asking for one rather than offering the exception first.
  const [vehicles, setVehicles] = useState<readonly string[]>([''])
  const [noVehicle, setNoVehicle] = useState(false)
  // prd.md §10.1 [C]'s two methods. Cash confirms outright; a transfer is paid
  // but not yet seen, so it goes to the verification queue (§10.3).
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [discount, setDiscount] = useState<DiscountValue>(NO_DISCOUNT)
  const [waiver, setWaiver] = useState<DepositWaiverValue>(NO_WAIVER)

  const selectedUnit = units.find((unit) => unit.id === unitId)
  const totalGuests = chargeableGuests + exemptGuests

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
          discount: previewDiscount(discount),
        },
        config,
      )
    : null

  return (
    <form
      action={formAction}
      className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start"
    >
      <input type="hidden" name="checkIn" value={checkIn} />
      <input type="hidden" name="checkOut" value={checkOut} />
      <input type="hidden" name="unitTypeId" value={selectedUnit?.unitTypeId ?? ''} />
      <input type="hidden" name="earlyCheckInHours" value={0} />

      <Card>
        <FormSection title="Unit">
          <div className="grid gap-sm">
            <Label htmlFor="unitId">{units.length} free for these dates</Label>
            <Select name="unitId" value={unitId} onValueChange={setUnitId}>
              <SelectTrigger id="unitId" className="max-w-[360px]">
                <SelectValue placeholder="Choose a unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.ref} — {unit.unitTypeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <p className="mt-sm text-body-sm text-muted-foreground">
            Guests aged {config.paxExemptAgeMax} and under are not counted towards occupancy.
          </p>
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
          {config.standardCheckInTime === null && (
            <p className="mt-sm text-body-sm text-muted-foreground">
              Early check-in is not offered yet — the standard check-in time is still to be
              confirmed with the client (prd.md §18 N6).
            </p>
          )}
        </FormSection>

        {mayDiscount ? (
          <FormSection title="Discount">
            <DiscountFields value={discount} onChange={setDiscount} errors={state.fieldErrors} />
          </FormSection>
        ) : null}

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

        <FormSection title="Payment">
          <div className="grid gap-sm">
            <Label htmlFor="paymentMethod">Method</Label>
            <Select
              name="paymentMethod"
              value={paymentMethod}
              onValueChange={(next) => setPaymentMethod(next as PaymentMethod)}
            >
              <SelectTrigger id="paymentMethod" className="w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash — collected now</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer — verify later</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-caption text-muted-foreground">
              {paymentMethod === 'cash'
                ? 'The booking is confirmed as soon as it is created.'
                : 'The guest quotes the booking reference in the transfer. The booking waits in the verification queue until someone checks the bank.'}
            </p>
          </div>
        </FormSection>

        {/* Last, after the money the guest pays: this is the money they do not.
            A "by the way" the desk needs rarely, so it sits outside the price
            card rather than on it — but ticking it asks first, in a dialog
            (B15). Rendered only for a staff member who may waive; the action
            checks `deposit.waive` again on every submit. */}
        {mayWaiveDeposit ? (
          <FormSection title="Security deposit">
            <DepositWaiverControl
              value={waiver}
              onChange={setWaiver}
              amount={config.securityDeposit}
              error={state.fieldErrors?.depositWaiverReason}
            />
          </FormSection>
        ) : null}
      </Card>

      <QuoteSummary
        eyebrow="Booking summary"
        headline={`${formatStayDate(checkIn)} → ${formatStayDate(checkOut)}`}
        detail={
          <>
            {quote?.ok ? `${quote.nights} ${quote.nights === 1 ? 'night' : 'nights'} · ` : ''}
            {selectedUnit?.ref ?? 'no unit'} · {totalGuests}{' '}
            {totalGuests === 1 ? 'guest' : 'guests'}
          </>
        }
      >
        {quote?.ok ? (
          <>
            <QuoteLines lines={quote.lines} total={quote.total} />

            <Notice className="mt-lg">
              {waiver.waived
                ? 'No security deposit — waived on this booking. Nothing is held against the stay.'
                : `Plus BND ${formatCents(quote.securityDeposit)} refundable security deposit, collected on arrival.`}
            </Notice>
          </>
        ) : (
          <Callout className="mt-lg">
            {quote?.ok === false ? quote.error.message : 'Choose a unit to see the price.'}
          </Callout>
        )}

        <Button type="submit" className="mt-lg w-full" disabled={isPending || !quote?.ok}>
          {isPending
            ? 'Creating…'
            : paymentMethod === 'cash'
              ? 'Create & take payment'
              : 'Create & await transfer'}
        </Button>

        {state.status === 'error' ? <FieldError className="mt-md" message={state.message} /> : null}
      </QuoteSummary>
    </form>
  )
}

/**
 * The discount as the price card should show it while it is still being typed.
 *
 * `parseDiscount` requires a reason, because saving without one is refused —
 * but a clerk who has entered "10%" and not yet said why should still see what
 * the guest will pay. The stand-in reason exists only to satisfy the parse for
 * this preview; nothing submits it, and the server parses the real form values
 * with the same function.
 *
 * A figure that cannot be read at all — mid-keystroke, or nonsense — previews
 * as no discount rather than as an error. The field says what is wrong once
 * the form is submitted; the price card's job is to stay legible.
 */
function previewDiscount(value: DiscountValue) {
  if (value.kind === 'none') {
    return null
  }

  const parsed = parseDiscount({
    ...toDiscountFormValues(value),
    reason: value.reason.trim() || 'pending',
  })

  return parsed.ok ? parsed.discount : null
}
