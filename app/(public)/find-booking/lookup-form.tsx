'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'

import { HoneypotField, PublicField } from '../_components/booking/booking-fields'
import { findBookingAction, type LookupState } from './actions'

/**
 * Two fields and a button (capability A9).
 *
 * **One card and no `<legend>`.** design.md's public-form idiom is one card
 * with its sections divided by hairlines under `micro` headers — but a form
 * with one section has nothing to divide, and a legend naming the only group
 * on the screen would label a rule that is not drawn. The heading above the
 * card is already doing that job.
 *
 * **The refusal is a `Callout` above the fields, never a `FieldError` beside
 * one.** A reference that turned red on the phone field alone would have
 * confirmed the booking exists, which is the one thing this screen withholds.
 * The action returns a single sentence for every failure and this renders it
 * in one place; `role="alert"` comes with the callout, which is what design.md
 * asks for when a callout stands in for a form's rejection.
 */

const initialState: LookupState = { status: 'idle' }

export function LookupForm() {
  const [state, formAction, pending] = useActionState(findBookingAction, initialState)

  return (
    <form action={formAction} className="mt-xl">
      <Card>
        {state.status === 'error' && state.message ? (
          <Callout tone="negative" className="mb-lg">
            {state.message}
          </Callout>
        ) : null}

        <div className="flex flex-col gap-lg">
          <PublicField
            id="lookup-reference"
            name="reference"
            label="Booking reference"
            hint="Found on your booking confirmation page or in your confirmation email."
            placeholder="PV-XXXX"
            required
            defaultValue={state.submitted?.reference}
            autoComplete="off"
            inputClassName="font-mono"
          />
          <PublicField
            id="lookup-phone"
            name="phone"
            label="The number you booked with"
            placeholder="8007000"
            required
            defaultValue={state.submitted?.phone}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
          />
          <HoneypotField />
        </div>

        <Button type="submit" className="mt-xl w-full sm:w-auto" disabled={pending}>
          {pending ? 'Looking…' : 'Find my booking'}
        </Button>
      </Card>
    </form>
  )
}
