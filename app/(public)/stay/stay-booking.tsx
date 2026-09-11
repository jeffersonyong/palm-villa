'use client'

import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
import type { StayDateRange } from '@/components/ui/calendar-grid'
import { Notice } from '@/components/ui/notice'
import { QuoteLines } from '@/components/quote-lines'
import type { PropertyConfig } from '@/lib/domain/config'
import { formatStayRange, nightsBetween, type StayDate } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'
import { priceStay } from '@/lib/domain/pricing/stay'
import { cn } from '@/lib/utils'

import { AvailabilityCalendar } from '../_components/booking/availability-calendar'
import { VehicleFields } from '@/components/vehicle-fields'

import {
  CountField,
  HoneypotField,
  PublicField,
  PublicPhoneField,
} from '../_components/booking/booking-fields'
import { createPublicStayAction, type PublicStayState } from './actions'

/**
 * Booking a short stay (capabilities A1, A2, A4).
 *
 * One client island, and it owns exactly what a customer is *choosing*: the
 * type, the dates, who is coming, and the extras. Everything it prices with
 * came from the server on the page around it.
 *
 * **The quote is computed here and re-computed on the server, and that is not
 * duplication.** `priceStay` is one pure function called in both places: here
 * so the total moves as the customer changes their mind, there because the
 * price charged is never one a browser submitted. It is the arrangement the
 * walk-in form set, and it matters more on this surface — the person filling
 * this in is a stranger.
 *
 * Early check-in is not offered, which is N31: the client's own answer makes
 * it a desk judgement about whether a unit is ready, not a checkbox. The form
 * sends zero hours and says who to ask.
 */

const initialState: PublicStayState = { status: 'idle' }

export function StayBooking({
  config,
  unitTypes,
  today,
  lastNight,
  nightsFree,
}: {
  config: PropertyConfig
  /** The types the building actually has units of — see the page. */
  unitTypes: PropertyConfig['unitTypes']
  today: StayDate
  /** One day past the furthest night the advance rule allows. */
  lastNight: StayDate
  nightsFree: Readonly<Record<string, Readonly<Record<string, number>>>>
}) {
  const [state, formAction, isPending] = useActionState(createPublicStayAction, initialState)

  const [unitTypeSlug, setUnitTypeSlug] = useState(unitTypes[0]?.id ?? '')
  const [range, setRange] = useState<StayDateRange | null>(null)
  const [chargeableGuests, setChargeableGuests] = useState(2)
  const [exemptGuests, setExemptGuests] = useState(0)
  const [sofaBeds, setSofaBeds] = useState(0)
  const [lateCheckOutHours, setLateCheckOutHours] = useState(0)
  const [vehicles, setVehicles] = useState<readonly string[]>([''])
  const [noVehicle, setNoVehicle] = useState(false)

  const unitType = unitTypes.find((type) => type.id === unitTypeSlug)

  const quote = range
    ? priceStay(
        {
          unitTypeId: unitTypeSlug,
          checkIn: range.start,
          checkOut: range.end,
          party: { chargeableGuests, exemptGuests },
          sofaBeds,
          earlyCheckInHours: 0,
          lateCheckOutHours,
        },
        config,
        today,
      )
    : null

  const nights = range ? nightsBetween(range.start, range.end) : 0

  return (
    <>
      <section aria-labelledby="stay-heading" className="bg-card px-xl pt-3xl pb-xl">
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="micro-label text-accent-foreground">Short stays</p>
          <h1
            id="stay-heading"
            className="mt-md font-display text-display-md text-foreground sm:text-display-lg"
          >
            Check what is free, and book it
          </h1>
          <p className="mt-md max-w-[52ch] text-body-lg text-copy">
            Prices are per night and include everything but the extras you choose below. Nothing is
            charged online — you transfer the {formatCents(config.securityDeposit)} deposit to
            secure the unit, and settle the stay when you arrive.
          </p>
        </div>
      </section>

      <form action={formAction} className="border-t border-divider bg-card px-xl pt-xl pb-3xl">
        <div className="mx-auto grid w-full max-w-[1120px] gap-xl lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <Card>
              {/* ── Which unit ─────────────────────────────────────────── */}
              <fieldset>
                <legend className="pe-md micro-label text-muted-foreground">Which unit</legend>

                <div className="mt-md flex flex-wrap gap-sm">
                  {unitTypes.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setUnitTypeSlug(type.id)}
                      aria-pressed={type.id === unitTypeSlug}
                      className={cn(
                        // `grow basis-48` rather than intrinsic width: the row
                        // reads as a set of equal choices filling the card, and
                        // a ragged right edge on three cards of different name
                        // lengths was the only uneven seam on the form. The
                        // basis is the wrap threshold, not the width — a phone
                        // stacks them, and a fourth type (N1'''s 2-bedroom) joins
                        // the row rather than forcing a new layout.
                        'flex grow basis-48 flex-col items-start gap-xxs rounded-md border px-lg py-md text-left transition-colors',
                        type.id === unitTypeSlug
                          ? 'border-primary bg-accent text-accent-foreground'
                          : 'border-border bg-card text-foreground hover:bg-muted',
                      )}
                    >
                      <span className="text-body-sm-strong">{type.name}</span>
                      <span className="text-caption text-muted-foreground tabular-nums">
                        BND {formatCents(type.baseRatePerNight)} / night · sleeps {type.maxPax}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* ── Your dates ─────────────────────────────────────────── */}
              <fieldset className="mt-xl border-t border-divider pt-lg">
                <legend className="pe-md micro-label text-muted-foreground">Your dates</legend>

                <AvailabilityCalendar
                  className="mt-md"
                  nightsFree={nightsFree}
                  unitTypeSlug={unitTypeSlug}
                  ratePerNight={unitType?.baseRatePerNight ?? 0}
                  today={today}
                  bounds={{ min: today, max: lastNight }}
                  value={range}
                  onSelect={setRange}
                />
              </fieldset>

              {/* ── No. of guests ──────────────────────────────────────── */}
              <fieldset className="mt-xl border-t border-divider pt-lg">
                <legend className="pe-md micro-label text-muted-foreground">No. of guests</legend>

                <div className="mt-md flex flex-wrap gap-lg">
                  <CountField
                    id="chargeableGuests"
                    name="chargeableGuests"
                    label={`Over age ${config.paxExemptAgeMax}`}
                    value={chargeableGuests}
                    min={1}
                    onChange={setChargeableGuests}
                    error={state.fieldErrors?.chargeableGuests}
                  />
                  <CountField
                    id="exemptGuests"
                    name="exemptGuests"
                    label={`Age ${config.paxExemptAgeMax} and under`}
                    hint="Not charged for."
                    value={exemptGuests}
                    onChange={setExemptGuests}
                    error={state.fieldErrors?.exemptGuests}
                  />
                </div>
              </fieldset>

              {/* ── Extras ─────────────────────────────────────────────── */}
              <fieldset className="mt-xl border-t border-divider pt-lg">
                <legend className="pe-md micro-label text-muted-foreground">Extras</legend>

                <div className="mt-md flex flex-wrap gap-lg">
                  <CountField
                    id="sofaBeds"
                    name="sofaBeds"
                    label="Sofa beds"
                    hint={`BND ${formatCents(config.sofaBedFlatFee)} each, with a pillow and blanket.`}
                    value={sofaBeds}
                    max={20}
                    onChange={setSofaBeds}
                    error={state.fieldErrors?.sofaBeds}
                  />
                  <CountField
                    id="lateCheckOutHours"
                    name="lateCheckOutHours"
                    label="Late check-out (hours)"
                    hint={`Check-out is ${config.standardCheckOutTime ?? '12:00'}. BND ${formatCents(
                      config.lateCheckOutPerHour,
                    )} an hour after that.`}
                    value={lateCheckOutHours}
                    max={12}
                    onChange={setLateCheckOutHours}
                    error={state.fieldErrors?.lateCheckOutHours}
                  />
                </div>

                <p className="mt-md text-caption text-muted-foreground">
                  Arriving before {config.standardCheckInTime ?? '14:00'}? Ask us when you get here
                  — it depends on whether the unit is ready.
                </p>
              </fieldset>

              {/* ── Your details ───────────────────────────────────────── */}
              <fieldset className="mt-xl border-t border-divider pt-lg">
                <legend className="pe-md micro-label text-muted-foreground">Your details</legend>

                <div className="mt-md grid gap-lg sm:grid-cols-2">
                  <PublicField
                    id="guestName"
                    name="guestName"
                    label="Your name"
                    required
                    placeholder="John Doe"
                    autoComplete="name"
                    defaultValue={state.submitted?.guestName}
                    error={state.fieldErrors?.guestName}
                  />
                  <PublicPhoneField
                    id="guestPhone"
                    name="guestPhone"
                    label="Mobile number"
                    required
                    placeholder="712 3456"
                    defaultValue={state.submitted?.guestPhone}
                    error={state.fieldErrors?.guestPhone}
                  />
                  <PublicField
                    id="guestEmail"
                    name="guestEmail"
                    label="Email"
                    hint="For your confirmation. We will not email you anything else."
                    type="email"
                    inputMode="email"
                    placeholder="john@email.com"
                    autoComplete="email"
                    defaultValue={state.submitted?.guestEmail}
                    error={state.fieldErrors?.guestEmail}
                  />
                </div>

                {/* One row per car. A family arriving in two is the ordinary
                    case, and prd.md §12.5 makes the plate the guard's primary
                    lookup — so a second car with nowhere to go is a car nobody
                    can match at the gate. */}
                <div className="mt-lg">
                  <VehicleFields
                    vehicles={vehicles}
                    onChange={setVehicles}
                    noVehicle={noVehicle}
                    onNoVehicleChange={setNoVehicle}
                    error={state.fieldErrors?.vehicles}
                    noVehicleDescription={null}
                  />
                </div>
              </fieldset>

              <HoneypotField />

              {/* The values the island owns, submitted with the form. */}
              <input type="hidden" name="unitTypeSlug" value={unitTypeSlug} />
              <input type="hidden" name="checkIn" value={range?.start ?? ''} />
              <input type="hidden" name="checkOut" value={range?.end ?? ''} />
            </Card>
          </div>

          {/* ── The quote ────────────────────────────────────────────── */}
          <div className="lg:sticky lg:top-lg lg:self-start">
            <Card>
              <p className="micro-label text-muted-foreground">Your booking</p>
              <p className="mt-sm text-body-md-strong text-foreground">
                {unitType?.name ?? 'Pick a unit'}
              </p>
              <p className="mt-xxs text-body-sm text-muted-foreground">
                {range
                  ? `${formatStayRange(range.start, range.end)} · ${nights} ${
                      nights === 1 ? 'night' : 'nights'
                    }`
                  : 'Pick your dates to see the price'}
              </p>

              {quote?.ok ? (
                <>
                  <QuoteLines lines={quote.lines} total={quote.total} />

                  {/* What the total does and does not cover, and nothing
                      else: the two amounts and which of them to send are the
                      next screen's job (transfer-instructions.tsx), and
                      saying it here as well made a guest read the payment
                      terms twice. Rendered only where a deposit is quoted —
                      the sentence has no meaning without one. */}
                  {quote.securityDeposit > 0 ? (
                    <Notice placement="nested" className="mt-lg">
                      <p className="text-body-sm">
                        The total amount above excludes a{' '}
                        <strong className="text-body-sm-strong">
                          BND {formatCents(quote.securityDeposit)}
                        </strong>{' '}
                        security deposit, which is refundable subject to the condition of the
                        property upon check-out.
                      </p>
                    </Notice>
                  ) : null}
                </>
              ) : quote && !quote.ok ? (
                <Callout tone="negative" placement="nested" className="mt-lg" role="alert">
                  {quote.error.message}
                </Callout>
              ) : (
                <p className="mt-lg text-caption text-muted-foreground">
                  Everything is priced before you commit to anything.
                </p>
              )}

              {state.status === 'error' && state.message ? (
                <Callout tone="negative" placement="nested" className="mt-lg" role="alert">
                  {state.message}
                </Callout>
              ) : null}

              <Button type="submit" className="mt-lg w-full" disabled={isPending || !quote?.ok}>
                {isPending ? 'Proceeding…' : 'Proceed to bank transfer'}
              </Button>

              <p className="mt-sm text-caption text-muted-foreground">
                Nothing is charged now. We hold the unit while you transfer the deposit.
              </p>
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
