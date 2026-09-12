'use client'

import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
import { DateField } from '@/components/ui/date-field'
import { Notice } from '@/components/ui/notice'
import { QuoteLines } from '@/components/quote-lines'
import type { DayPassAgeBand, PropertyConfig } from '@/lib/domain/config'
import { formatStayDate, type StayDate } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'
import { priceDayPass } from '@/lib/domain/pricing/day-pass'

import { VehicleFields } from '@/components/vehicle-fields'

import {
  CountField,
  HoneypotField,
  PublicField,
  PublicPhoneField,
} from '../_components/booking/booking-fields'
import { createPublicDayPassAction, type PublicDayPassState } from './actions'

/**
 * Booking a day pass (capability A3).
 *
 * The bundles are the interesting part, and the customer never chooses one:
 * `priceDayPass` searches every arrangement and takes the cheapest, so a
 * family of two adults and one child is quoted the BND 20 bundle rather than
 * BND 25 of per-person rates without having to know the bundle exists. prd.md
 * §8.1 is explicit that the customer is never charged more than the cheapest
 * applicable combination, and the way to keep that promise is to not make them
 * ask for it.
 *
 * The date is the single-day picker rather than the availability calendar: a
 * pass is one day (assumption A5), and a two-month grid carrying a price on
 * every cell would be answering a question nobody asked.
 */

const initialState: PublicDayPassState = { status: 'idle' }

export function DayPassBooking({
  config,
  today,
  lastDay,
  placesLeft,
  included,
}: {
  config: PropertyConfig
  today: StayDate
  lastDay: StayDate
  /** Places left, per date. Absent where no capacity is configured (C2). */
  placesLeft: Readonly<Record<string, number>>
  /** What the pass admits, from settings rather than from copy. */
  included: readonly string[]
}) {
  const [state, formAction, isPending] = useActionState(createPublicDayPassAction, initialState)

  const [date, setDate] = useState<StayDate | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const adults = adultBandOf(config.dayPassAgeBands)

    return Object.fromEntries(
      config.dayPassAgeBands.map((band) => [band.id, band.id === adults?.id ? 2 : 0]),
    )
  })
  const [vehicles, setVehicles] = useState<readonly string[]>([''])
  const [noVehicle, setNoVehicle] = useState(false)

  const party = Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0))
  const headcount = Object.values(counts).reduce((total, count) => total + count, 0)
  const quote = headcount > 0 ? priceDayPass(party, config) : null

  const left = date ? placesLeft[date] : undefined
  const full = left !== undefined && left < headcount

  return (
    <>
      <section aria-labelledby="day-pass-heading" className="bg-card px-xl pt-3xl pb-xl">
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="micro-label text-accent-foreground">Day passes</p>
          <h1
            id="day-pass-heading"
            className="mt-md font-display text-display-md text-foreground sm:text-display-lg"
          >
            Spend the day with us
          </h1>
          <p className="mt-md max-w-[52ch] text-body-lg text-copy">
            Book a day pass for your family. We always charge you the cheapest combination of rates
            and family bundles — you do not have to work it out.
          </p>
        </div>
      </section>

      <form action={formAction} className="border-t border-divider bg-card px-xl pt-xl pb-3xl">
        <div className="mx-auto grid w-full max-w-[1120px] gap-xl lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <Card>
              {/* ── The day ───────────────────────────────────────────── */}
              <fieldset>
                <legend className="pe-md micro-label text-muted-foreground">Which day</legend>

                <div className="mt-md max-w-[260px]">
                  <DateField
                    id="passDate"
                    name="passDate"
                    value={date}
                    onChange={setDate}
                    min={today}
                    max={lastDay}
                    placeholder="Pick a day"
                    invalid={Boolean(state.fieldErrors?.passDate)}
                  />
                </div>

                {/* The server checks the day against the window this calendar
                    was built from, and until now that refusal arrived as a red
                    outline and nothing else — the field carried the error but
                    never said it. The one way a customer meets it honestly is
                    leaving the page open past midnight, when "today" moves
                    under them, and "pick another day" is no use without the
                    reason. Same shape as the party error below. */}
                {state.fieldErrors?.passDate ? (
                  <p role="alert" className="mt-sm text-body-sm text-negative-text">
                    {state.fieldErrors.passDate}
                  </p>
                ) : null}

                {included.length > 0 ? (
                  <Notice placement="nested" className="mt-lg">
                    <p className="text-body-sm">
                      A pass admits you to the {formatList(included)}. It runs all day — there are
                      no time slots.
                    </p>
                  </Notice>
                ) : null}
              </fieldset>

              {/* ── No. of guests ─────────────────────────────────────── */}
              <fieldset className="mt-xl border-t border-divider pt-lg">
                <legend className="pe-md micro-label text-muted-foreground">No. of guests</legend>

                <div className="mt-md flex flex-wrap gap-lg">
                  {config.dayPassAgeBands.map((band) => (
                    <CountField
                      key={band.id}
                      id={`band-${band.id}`}
                      name={`band-${band.id}`}
                      label={band.label}
                      hint={
                        band.pricePerPerson === 0
                          ? 'Free'
                          : `BND ${formatCents(band.pricePerPerson)} each`
                      }
                      value={counts[band.id] ?? 0}
                      onChange={(value) =>
                        setCounts((current) => ({ ...current, [band.id]: value }))
                      }
                    />
                  ))}
                </div>

                {/* Dropped once the counts change, because every party error
                    the server can return is a statement about the counts it
                    was sent — and those are no longer the counts on screen.
                    Leaving it up made a customer who had just added guests
                    read "add at least one guest" and go looking for which
                    field the system meant. If the new counts are also wrong,
                    the next submit says so. */}
                {state.fieldErrors?.party && headcount === 0 ? (
                  <p role="alert" className="mt-md text-body-sm text-negative-text">
                    {state.fieldErrors.party}
                  </p>
                ) : null}
              </fieldset>

              {/* ── Your details ──────────────────────────────────────── */}
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
                    hint="For your confirmation."
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

              <input type="hidden" name="headcount" value={String(headcount)} />
            </Card>
          </div>

          {/* ── The quote ───────────────────────────────────────────── */}
          <div className="lg:sticky lg:top-lg lg:self-start">
            <Card>
              <p className="micro-label text-muted-foreground">Your day pass</p>
              <p className="mt-sm text-body-md-strong text-foreground">
                {date ? formatStayDate(date) : 'Pick a day'}
              </p>
              <p className="mt-xxs text-body-sm text-muted-foreground">
                {headcount > 0
                  ? `${headcount} ${headcount === 1 ? 'person' : 'people'}`
                  : 'Add who is coming'}
              </p>

              {quote?.ok ? (
                <QuoteLines lines={quote.lines} total={quote.total} />
              ) : (
                <p className="mt-lg text-caption text-muted-foreground">
                  Bundles are applied automatically where they work out cheaper.
                </p>
              )}

              {full ? (
                <Callout tone="negative" placement="nested" className="mt-lg" role="alert">
                  {left === 0
                    ? 'That day is fully booked. Please pick another.'
                    : `Only ${left} ${left === 1 ? 'place is' : 'places are'} left on that day.`}
                </Callout>
              ) : null}

              {state.status === 'error' && state.message ? (
                <Callout tone="negative" placement="nested" className="mt-lg" role="alert">
                  {state.message}
                </Callout>
              ) : null}

              <Button
                type="submit"
                className="mt-lg w-full"
                disabled={isPending || !quote?.ok || !date || full}
              >
                {isPending ? 'Booking…' : 'Book day pass'}
              </Button>

              <p className="mt-sm text-caption text-muted-foreground">
                Nothing is charged now. You transfer the amount above and we confirm your pass.
              </p>
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}

/** "the pool, the water park and the playroom" — an Oxford-free list. */
/**
 * The band a lone adult falls in, whatever the property has called it.
 *
 * Found by shape rather than by id: age bands became editable rows with
 * capability F3, so their ids are database uuids and the `band.id === 'adult'`
 * this replaced matched nothing — the form opened with every count at zero and
 * refused to submit until the customer worked out why. The open-ended top band
 * is the adult one by construction (`maxAgeExclusive === null`, and
 * lib/domain/config.ts requires bands not to overlap), which survives a rename,
 * a re-price, and a property that bands its guests differently.
 */
function adultBandOf(bands: PropertyConfig['dayPassAgeBands']): DayPassAgeBand | null {
  return bands.find((band) => band.maxAgeExclusive === null) ?? bands.at(-1) ?? null
}

function formatList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? ''
  }

  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
