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
import { NumberField, PhoneField, TextField } from '@/components/portal/form-fields'
import { FormSection } from '@/components/portal/form-section'
import { VehicleFields } from '@/components/vehicle-fields'
import { QuoteSummary } from '@/components/portal/quote-summary'
import { QuoteLines } from '@/components/quote-lines'
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
import { formatCents, type Cents } from '@/lib/domain/money'
import type { PaymentMethod } from '@/lib/domain/payment'
import { priceStay } from '@/lib/domain/pricing/stay'

import type { WalkInBookingState } from './actions'

/** What crosses the counter now: the customer's two answers (prd.md §10.3). */
type PayingNow = 'deposit_only' | 'everything'

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

/** The "no unit type filter" option's value. A select option needs one. */
const ANY_UNIT_TYPE = 'any'

interface BookingFormProps {
  /** Every unit free for these dates, of every type. Narrowed here, not there. */
  units: readonly Unit[]
  /**
   * The unit type to open the filter on, when the calendar named one. Absent
   * means "any", which is what somebody who arrived by picking dates wants.
   */
  preferredUnitTypeId?: string
  /**
   * The unit to open on, when something already chose one — the calendar,
   * where a row was clicked. Already checked against `units` by the page, so
   * it is either free for these dates or absent.
   */
  preferredUnitId?: string
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
  preferredUnitTypeId,
  preferredUnitId,
  config,
  checkIn,
  checkOut,
  mayDiscount,
  mayWaiveDeposit,
  state,
  formAction,
  isPending,
}: BookingFormProps) {
  // The narrowing control, client state because that is the whole point — see
  // page.tsx for what it cost when this was a round trip.
  const [unitTypeId, setUnitTypeId] = useState(preferredUnitTypeId ?? ANY_UNIT_TYPE)
  const [unitId, setUnitId] = useState(preferredUnitId ?? units[0]?.id ?? '')
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
  // The customer's two answers (prd.md §10.3), given here on their behalf.
  // **Paying in full is the default**, which reverses what this form opened on
  // until 19 September 2026 and closes a gap rather than opening one: the
  // customer's own page was reversed to the same default on 18 September
  // (§10.3), and this control's reasoning cited that page for a rule it had
  // stopped following. The desk's case is the stronger of the two — the walk-in
  // at the counter is paying for the stay now, and leaving on `deposit_only`
  // recorded a booking with a balance nobody had agreed to defer.
  //
  // The old default guarded against over-collecting in cash. What guards
  // against it now is the same thing that always did: the figure crossing the
  // counter is on the submit button, and the summary beside it itemises how it
  // is made up.
  const [payingNow, setPayingNow] = useState<PayingNow>('everything')
  const [discount, setDiscount] = useState<DiscountValue>(NO_DISCOUNT)
  const [waiver, setWaiver] = useState<DepositWaiverValue>(NO_WAIVER)

  const visibleUnits =
    unitTypeId === ANY_UNIT_TYPE ? units : units.filter((unit) => unit.unitTypeId === unitTypeId)

  /*
   * Derived rather than corrected by an effect.
   *
   * Narrowing the list can leave `unitId` pointing at a unit that is no longer
   * on it. Falling through to the first visible unit answers that in the same
   * render the type changed in — so the price beside the form is never, even
   * for a frame, the price of a unit the clerk can no longer see. An effect
   * would fix it one render later, which is exactly the window a fast clerk
   * submits in.
   */
  const selectedUnit = visibleUnits.find((unit) => unit.id === unitId) ?? visibleUnits[0]
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

  // What crosses the counter now. A waived booking has nothing to secure it
  // but the stay, so the choice collapses to the stay — the same rule the
  // customer's page and the write path apply (prd.md §10.3).
  const depositNow = quote?.ok && !waiver.waived ? quote.securityDeposit : 0
  const takesDeposit = depositNow > 0
  const paysStay = !takesDeposit || payingNow === 'everything'
  const payingTotal = depositNow + (paysStay && quote?.ok ? quote.total : 0)

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
          {/* Type then unit, which is the order the question is asked in — "a
              two-bedroom?", then "which one?" — and the narrower control comes
              first because it decides what the second one contains. Both are
              client state, so changing either reprices the card beside the
              form without touching anything already typed below. */}
          <div className="flex flex-wrap items-start gap-lg">
            <div className="grid gap-sm">
              <Label htmlFor="unitTypeId">Unit type</Label>
              <Select value={unitTypeId} onValueChange={setUnitTypeId}>
                <SelectTrigger id="unitTypeId" className="w-[264px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_UNIT_TYPE}>Any type</SelectItem>
                  {config.unitTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name} — BND {formatCents(type.baseRatePerNight)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-sm">
              <Label htmlFor="unitId">
                {visibleUnits.length} free for these dates
                {unitTypeId === ANY_UNIT_TYPE ? '' : ' in this type'}
              </Label>
              <Select
                name="unitId"
                value={selectedUnit?.id ?? ''}
                onValueChange={setUnitId}
                disabled={visibleUnits.length === 0}
              >
                <SelectTrigger id="unitId" className="w-[360px] max-w-full">
                  <SelectValue placeholder="Choose a unit" />
                </SelectTrigger>
                <SelectContent>
                  {visibleUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.ref} — {unit.unitTypeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={state.fieldErrors?.unitId} />
            </div>
          </div>

          {/* Said here rather than only in the price card, because the fix is
              here: the control that emptied the list is the one above it. */}
          {visibleUnits.length === 0 ? (
            <Callout className="mt-md" placement="nested">
              Nothing of this type is free for these dates. Choose another type, or change the dates
              above.
            </Callout>
          ) : null}
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
          <p className="mt-sm text-body-sm text-muted-foreground">
            Check-in {config.standardCheckInTime ?? 'time not set'}, check-out{' '}
            {config.standardCheckOutTime}. Early check-in is not sold here — it depends on the unit
            being ready, and that rule is still to be agreed (open-questions.md N31).
          </p>
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
            <PhoneField
              id="guestPhone"
              label="Phone"
              placeholder="712 3456"
              value={guestPhone}
              onChange={setGuestPhone}
              className="w-[260px]"
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
          {/* Two answers, then the method — the order a clerk asks them in:
              "just the deposit, or the whole stay?", then "cash or transfer?".
              The figures sit in the options so the amount being taken is
              chosen rather than worked out; the button on the price card
              repeats it. */}
          <div className="flex flex-wrap items-start gap-lg">
            {/* Each column is its control's width, so the caption wraps under
                the thing it explains rather than stretching the column and
                pushing the second question onto its own row. */}
            <div className="grid w-[300px] gap-sm">
              <Label htmlFor="payingNow">Paying now</Label>
              {takesDeposit ? (
                <Select
                  name="payingNow"
                  value={payingNow}
                  onValueChange={(next) => setPayingNow(next as PayingNow)}
                >
                  <SelectTrigger id="payingNow" className="w-[300px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit_only">
                      Deposit only — BND {formatCents(depositNow)}
                    </SelectItem>
                    <SelectItem value="everything">
                      Deposit and the stay — BND{' '}
                      {formatCents(depositNow + (quote?.ok ? quote.total : 0))}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <input type="hidden" name="payingNow" value="everything" />
                  <p id="payingNow" className="text-body-sm text-foreground tabular-nums">
                    The stay — BND {formatCents(quote?.ok ? quote.total : 0)}
                  </p>
                </>
              )}
              <p className="text-caption text-muted-foreground">
                {takesDeposit
                  ? payingNow === 'deposit_only'
                    ? 'The deposit secures the booking. The stay is settled when the guest arrives.'
                    : 'Nothing is owed on arrival.'
                  : 'No deposit is quoted, so the stay is what secures the booking.'}
              </p>
            </div>

            <div className="grid w-[280px] gap-sm">
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
                  <SelectItem value="cash">Cash — counted now</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer — verify later</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                {paymentMethod === 'cash'
                  ? 'Counted now, so the booking is confirmed as soon as it is created.'
                  : 'The guest quotes the booking reference in the transfer. The booking waits in the verification queue until someone checks the bank.'}
              </p>
            </div>
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

            {takesDeposit ? (
              <TakingNow
                stay={paysStay ? quote.total : 0}
                deposit={depositNow}
                total={payingTotal}
                method={paymentMethod}
              />
            ) : null}

            {/* Only where it still says something. A waived booking needs the
                sentence because the absence of a deposit is the fact; a
                deposit-only booking needs the one about arrival, which is the
                money the block above deliberately does not show. Everything
                else is now itemised rather than described, so the paragraph
                that used to restate the figures has gone. */}
            {waiver.waived ? (
              <Notice className="mt-lg">
                No security deposit — waived on this booking. Nothing is held against the stay, so
                the stay is paid now.
              </Notice>
            ) : takesDeposit && !paysStay ? (
              <Notice className="mt-lg">
                Deposit only. The BND {formatCents(quote.total)} for the stay is settled when the
                guest arrives.
              </Notice>
            ) : null}
          </>
        ) : (
          <Callout className="mt-lg">
            {quote?.ok === false
              ? quote.error.message
              : visibleUnits.length === 0
                ? 'Nothing of this unit type is free for these dates.'
                : 'Choose a unit to see the price.'}
          </Callout>
        )}

        {/* The figure crossing the counter is on the button, so a clerk who
            left the choice above on its default is told what is about to be
            recorded before it is. */}
        <Button type="submit" className="mt-lg w-full" disabled={isPending || !quote?.ok}>
          {isPending
            ? 'Creating…'
            : !quote?.ok
              ? // Disabled, and with no unit there is no figure — "BND 0.00"
                // would be the button stating a price rather than admitting it
                // has none.
                'Create booking'
              : paymentMethod === 'cash'
                ? `Create & take BND ${formatCents(payingTotal)}`
                : `Create & await BND ${formatCents(payingTotal)}`}
        </Button>

        {state.status === 'error' ? <FieldError className="mt-md" message={state.message} /> : null}
      </QuoteSummary>
    </form>
  )
}

/**
 * What crosses the counter, itemised (prd.md §10.3).
 *
 * **The booking total above stays the stay alone**, and that is the whole
 * reason this is a separate block rather than one more line in `QuoteLines`.
 * §11 makes the security deposit a liability the property owes back and the
 * stay revenue it has earned; N29 settles that the deposit leaves the booking's
 * balance untouched. A deposit line inside the total would have made this card
 * say BND 300 about a booking every other screen — the booking screen, the
 * balance, the accounting pack, the customer's own page — calls BND 200. The
 * public site says in as many words that its total *excludes* the deposit.
 *
 * What was genuinely wrong is what this fixes: the card said BND 200, the
 * button beneath it said BND 300, and nothing on the screen showed the working.
 * So the working is here, under its own heading, adding up to the figure on the
 * button — two ledgers kept apart and the arithmetic shown.
 *
 * A deposit-only booking shows the deposit alone. The stay is not money
 * crossing the counter today, and putting it here greyed out would be
 * describing what is *not* happening in the block about what is.
 */
function TakingNow({
  stay,
  deposit,
  total,
  method,
}: {
  /** Zero where the guest is settling on arrival. */
  stay: Cents
  deposit: Cents
  total: Cents
  method: PaymentMethod
}) {
  const isCash = method === 'cash'

  return (
    <section className="mt-lg border-t border-divider pt-md">
      <p className="micro-label text-muted-foreground">
        {isCash ? 'Taking now' : 'Awaiting by transfer'}
      </p>

      <dl className="mt-sm grid gap-xs">
        {stay > 0 ? <TakingNowLine label="Stay" amount={stay} /> : null}
        <TakingNowLine label="Security deposit — refundable" amount={deposit} />
      </dl>

      {/* `body-md-strong`, not `display-sm`. design.md keeps one large number
          per card and the booking total is it; this is the second figure and
          reads as the sum of the two lines above it, not as a rival headline. */}
      <div className="mt-sm flex items-baseline justify-between gap-lg border-t border-divider pt-sm">
        <span className="text-body-sm-strong text-foreground">
          {isCash ? 'To collect' : 'To confirm'}
        </span>
        <span className="text-body-md-strong text-foreground tabular-nums">
          BND {formatCents(total)}
        </span>
      </div>
    </section>
  )
}

function TakingNowLine({ label, amount }: { label: string; amount: Cents }) {
  return (
    <div className="flex items-baseline justify-between gap-lg">
      <dt className="text-body-sm text-muted-foreground">{label}</dt>
      <dd className="text-body-sm text-foreground tabular-nums">{formatCents(amount)}</dd>
    </div>
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
