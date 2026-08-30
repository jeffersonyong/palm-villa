'use client'

import { useActionState, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { Unit } from '@/lib/db/inventory'
import type { PropertyConfig } from '@/lib/domain/config'
import { formatStayDate } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'
import { priceStay } from '@/lib/domain/pricing/stay'
import { cn } from '@/lib/utils'

import { createWalkInBookingAction, type WalkInBookingState } from './actions'

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
 * The only client island on the screen. It exists so the price updates as
 * staff type — a clerk reading a total back to a guest should not wait on a
 * round trip per keystroke. Pricing runs here AND on the server; that is not
 * duplication, `priceStay` is one pure function used in both places, and the
 * submitted total is never trusted (see actions.ts).
 */

interface BookingFormProps {
  units: readonly Unit[]
  config: PropertyConfig
  checkIn: string
  checkOut: string
}

const initialState: WalkInBookingState = { status: 'idle' }

export function BookingForm({ units, config, checkIn, checkOut }: BookingFormProps) {
  const [state, formAction, isPending] = useActionState(createWalkInBookingAction, initialState)

  const [unitId, setUnitId] = useState(units[0]?.id ?? '')
  const [chargeableGuests, setChargeableGuests] = useState(2)
  const [exemptGuests, setExemptGuests] = useState(0)
  const [sofaBeds, setSofaBeds] = useState(0)
  const [lateCheckOutHours, setLateCheckOutHours] = useState(0)

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
        },
        config,
      )
    : null

  if (state.status === 'created' && state.created) {
    const { created } = state

    return (
      <Card className="max-w-[520px]">
        <div className="flex items-start justify-between gap-lg">
          <div>
            <p className="micro-label text-muted-foreground">Booking created</p>
            <p className="mt-xs font-mono text-display-sm text-foreground">{created.reference}</p>
          </div>
          <Badge tone="positive">Confirmed</Badge>
        </div>

        <p className="mt-sm text-body-md text-copy">
          {created.unitRef} · {formatStayDate(created.checkIn)} → {formatStayDate(created.checkOut)}
        </p>

        <dl className="mt-lg border-t border-divider pt-lg">
          <div className="flex items-baseline justify-between gap-lg">
            <dt className="text-body-md text-copy">Paid</dt>
            <dd className="text-body-md-strong text-foreground tabular-nums">
              BND {formatCents(created.total)}
            </dd>
          </div>
          <div className="mt-sm flex items-baseline justify-between gap-lg">
            <dt className="text-body-md text-copy">Security deposit collected</dt>
            <dd className="text-body-md-strong text-foreground tabular-nums">
              BND {formatCents(created.securityDeposit)}
            </dd>
          </div>
        </dl>

        <p className="mt-lg text-body-sm text-muted-foreground">
          Give the guest the reference above — it is what they quote at the gate.
        </p>

        {/* A full reload on purpose: it clears the `useActionState` state and
            re-renders the availability counts for the next booking, which a
            client-side navigation back to this same route would not. The lint
            rule cannot see that intent — it only sees an anchor to a known
            page — so it is silenced here rather than obeyed. */}
        {/* eslint-disable @next/next/no-html-link-for-pages */}
        <Button asChild variant="tertiary" className="mt-lg">
          <a href="/portal/bookings/new">Take another booking</a>
        </Button>
        {/* eslint-enable @next/next/no-html-link-for-pages */}
      </Card>
    )
  }

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
        <section>
          <SectionHeading>Unit</SectionHeading>
          <div className="mt-md grid gap-sm">
            <Label htmlFor="unitId">{units.length} free for these dates</Label>
            <NativeSelect
              className="max-w-[360px]"
              id="unitId"
              name="unitId"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.ref} — {unit.unitTypeName}
                </option>
              ))}
            </NativeSelect>
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
          <p className="mt-sm text-body-sm text-muted-foreground">
            Guests aged {config.paxExemptAgeMax} and under are not counted towards occupancy.
          </p>
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
          {config.standardCheckInTime === null && (
            <p className="mt-sm text-body-sm text-muted-foreground">
              Early check-in is not offered yet — the standard check-in time is still to be
              confirmed with the client (prd.md §18 N6).
            </p>
          )}
        </section>

        <section className="mt-xl border-t border-divider pt-xl">
          <SectionHeading>Guest</SectionHeading>
          <div className="mt-md grid gap-lg">
            <TextField
              id="guestName"
              label="Name"
              autoComplete="name"
              className="max-w-[420px]"
              error={state.fieldErrors?.guestName}
            />
            <div className="flex flex-wrap gap-lg">
              <TextField
                id="guestPhone"
                label="Phone"
                type="tel"
                autoComplete="tel"
                className="w-[220px]"
                error={state.fieldErrors?.guestPhone}
              />
              <TextField
                id="vehicleRegistration"
                label="Vehicle reg (optional)"
                className="w-[220px]"
                error={state.fieldErrors?.vehicleRegistration}
              />
            </div>
          </div>
        </section>
      </Card>

      <div className="lg:sticky lg:top-xl">
        <Card>
          <p className="micro-label text-muted-foreground">Booking summary</p>
          <p className="mt-sm text-body-md-strong text-foreground">
            {formatStayDate(checkIn)} → {formatStayDate(checkOut)}
          </p>
          <p className="mt-xxs text-body-sm text-muted-foreground">
            {quote?.ok ? `${quote.nights} ${quote.nights === 1 ? 'night' : 'nights'} · ` : ''}
            {selectedUnit?.ref ?? 'no unit'} · {totalGuests}{' '}
            {totalGuests === 1 ? 'guest' : 'guests'}
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

              <p className="mt-lg rounded-md bg-muted p-md text-body-sm text-copy">
                Plus BND {formatCents(quote.securityDeposit)} refundable security deposit, collected
                on arrival.
              </p>
            </>
          ) : (
            <p className="mt-lg rounded-md bg-negative-tint p-md text-body-sm text-negative-deep">
              {quote?.ok === false ? quote.error.message : 'Choose a unit to see the price.'}
            </p>
          )}

          <Button type="submit" className="mt-lg w-full" disabled={isPending || !quote?.ok}>
            {isPending ? 'Creating…' : 'Create & take payment'}
          </Button>

          {state.status === 'error' && state.message && (
            <p role="alert" className="mt-md text-body-sm text-negative-deep">
              {state.message}
            </p>
          )}
        </Card>
      </div>
    </form>
  )
}

/** The labelling voice (design.md §Typography `micro`), as section headers. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="micro-label text-muted-foreground">{children}</h2>
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null
  }

  return <p className="text-body-sm text-negative-deep">{message}</p>
}

interface NumberFieldProps {
  id: string
  label: string
  value: number
  min: number
  onChange: (value: number) => void
  error?: string
}

function NumberField({ id, label, value, min, onChange, error }: NumberFieldProps) {
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

interface TextFieldProps {
  id: string
  label: string
  type?: string
  autoComplete?: string
  className?: string
  error?: string
}

function TextField({ id, label, type = 'text', autoComplete, className, error }: TextFieldProps) {
  return (
    <div className={cn('grid gap-sm', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
      />
      <FieldError message={error} />
    </div>
  )
}
