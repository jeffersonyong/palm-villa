'use client'

import { useActionState, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Unit } from '@/lib/db/inventory'
import type { PropertyConfig } from '@/lib/domain/config'
import { formatCents } from '@/lib/domain/money'
import { priceStay } from '@/lib/domain/pricing/stay'

import { createWalkInBookingAction, type WalkInBookingState } from './actions'

/**
 * The walk-in booking form (capability B2).
 *
 * The only client island on this screen. It exists so the price updates as
 * staff type — a booking clerk reading a total back to a guest should not wait
 * on a round trip per keystroke.
 *
 * Pricing runs here AND on the server. That is deliberate, not duplication:
 * `priceStay` is a pure function with no server dependencies, so the same code
 * gives an instant preview here and the authoritative figure in the action. The
 * submitted total is never trusted — see actions.ts.
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
    return (
      <Card surface="summary" className="max-w-[560px]">
        <Badge tone="positive">Confirmed</Badge>
        <p className="mt-lg text-display-xs text-foreground">{state.created.reference}</p>
        <p className="mt-xs text-body-md text-copy">
          Booking created and paid. Give the guest the reference above.
        </p>

        <dl className="mt-lg border-t border-divider pt-lg">
          <div className="flex items-baseline justify-between gap-lg">
            <dt className="text-body-md text-copy">Paid</dt>
            <dd className="text-body-md-strong text-foreground">
              BND {formatCents(state.created.total)}
            </dd>
          </div>
          <div className="mt-sm flex items-baseline justify-between gap-lg">
            <dt className="text-body-md text-copy">Security deposit collected</dt>
            <dd className="text-body-md-strong text-foreground">
              BND {formatCents(state.created.securityDeposit)}
            </dd>
          </div>
        </dl>

        <Button asChild variant="tertiary" className="mt-lg">
          <a href="/portal/bookings/new">Take another booking</a>
        </Button>
      </Card>
    )
  }

  return (
    <form action={formAction} className="grid gap-xl lg:grid-cols-[1fr_380px] lg:items-start">
      <input type="hidden" name="checkIn" value={checkIn} />
      <input type="hidden" name="checkOut" value={checkOut} />
      <input type="hidden" name="unitTypeId" value={selectedUnit?.unitTypeId ?? ''} />
      <input type="hidden" name="earlyCheckInHours" value={0} />

      <div className="grid gap-xl">
        <Card surface="summary">
          <h2 className="text-display-xs text-foreground">Unit</h2>

          <div className="mt-lg grid gap-sm">
            <Label htmlFor="unitId">Available units ({units.length})</Label>
            <select
              id="unitId"
              name="unitId"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
              className="h-control w-full rounded-md border border-border bg-card px-lg text-body-md text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.ref} — {unit.unitTypeName}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.unitId} />
          </div>
        </Card>

        <Card surface="summary">
          <h2 className="text-display-xs text-foreground">Guests</h2>
          <p className="mt-xs text-body-sm text-muted-foreground">
            Guests aged {config.paxExemptAgeMax} and under are not counted towards occupancy.
          </p>

          <div className="mt-lg grid gap-lg sm:grid-cols-2">
            <NumberField
              id="chargeableGuests"
              label={`Guests over ${config.paxExemptAgeMax}`}
              value={chargeableGuests}
              min={1}
              onChange={setChargeableGuests}
              error={state.fieldErrors?.chargeableGuests}
            />
            <NumberField
              id="exemptGuests"
              label={`Guests aged ${config.paxExemptAgeMax} and under`}
              value={exemptGuests}
              min={0}
              onChange={setExemptGuests}
              error={state.fieldErrors?.exemptGuests}
            />
          </div>
        </Card>

        <Card surface="summary">
          <h2 className="text-display-xs text-foreground">Extras</h2>

          <div className="mt-lg grid gap-lg sm:grid-cols-2">
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
              label="Late check-out (hours)"
              value={lateCheckOutHours}
              min={0}
              onChange={setLateCheckOutHours}
              error={state.fieldErrors?.lateCheckOutHours}
            />
          </div>

          {config.standardCheckInTime === null && (
            <p className="mt-lg border-t border-divider pt-lg text-body-sm text-muted-foreground">
              Early check-in is not offered yet — the standard check-in time is still to be
              confirmed with the client (prd.md §18 N6).
            </p>
          )}
        </Card>

        <Card surface="summary">
          <h2 className="text-display-xs text-foreground">Guest details</h2>

          <div className="mt-lg grid gap-lg">
            <TextField
              id="guestName"
              label="Name"
              autoComplete="name"
              error={state.fieldErrors?.guestName}
            />
            <div className="grid gap-lg sm:grid-cols-2">
              <TextField
                id="guestPhone"
                label="Phone"
                type="tel"
                autoComplete="tel"
                error={state.fieldErrors?.guestPhone}
              />
              <TextField
                id="vehicleRegistration"
                label="Vehicle registration (optional)"
                error={state.fieldErrors?.vehicleRegistration}
              />
            </div>
          </div>
        </Card>
      </div>

      <Card surface="summary" className="lg:sticky lg:top-xl">
        <h2 className="text-display-xs text-foreground">Price</h2>

        {quote?.ok ? (
          <>
            <dl className="mt-lg">
              {quote.lines.map((line) => (
                <div
                  key={`${line.type}-${line.description}`}
                  className="flex items-baseline justify-between gap-lg border-b border-divider py-sm"
                >
                  <dt className="text-body-sm text-copy">{line.description}</dt>
                  <dd className="text-body-sm-strong text-foreground tabular-nums">
                    {formatCents(line.amount)}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-lg flex items-baseline justify-between gap-lg">
              <span className="text-body-md-strong text-foreground">Total</span>
              <span className="text-display-xs text-foreground tabular-nums">
                BND {formatCents(quote.total)}
              </span>
            </div>

            <p className="mt-sm text-body-sm text-muted-foreground">
              Plus BND {formatCents(quote.securityDeposit)} refundable security deposit, collected
              on arrival.
            </p>

            <Button type="submit" className="mt-xl w-full" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create & take payment'}
            </Button>
          </>
        ) : (
          <p className="mt-lg text-body-sm text-negative-deep">
            {quote?.ok === false ? quote.error.message : 'Choose a unit to see the price.'}
          </p>
        )}

        {state.status === 'error' && state.message && (
          <p role="alert" className="mt-lg text-body-sm text-negative-deep">
            {state.message}
          </p>
        )}
      </Card>
    </form>
  )
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
    <div className="grid gap-sm">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        aria-invalid={error ? true : undefined}
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
  error?: string
}

function TextField({ id, label, type = 'text', autoComplete, error }: TextFieldProps) {
  return (
    <div className="grid gap-sm">
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
