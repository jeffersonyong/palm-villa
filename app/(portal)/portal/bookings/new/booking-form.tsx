'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'

import { NumberField, TextField } from '@/components/portal/form-fields'
import { FormSection } from '@/components/portal/form-section'
import { QuoteLines, QuoteSummary } from '@/components/portal/quote-summary'
import { Badge } from '@/components/ui/badge'
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
import { formatCents } from '@/lib/domain/money'
import type { PaymentMethod } from '@/lib/domain/payment'
import { priceStay } from '@/lib/domain/pricing/stay'

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
  // prd.md §10.1 [C]'s two methods. Cash confirms outright; a transfer is paid
  // but not yet seen, so it goes to the verification queue (§10.3).
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')

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
    const isTransfer = created.paymentMethod === 'bank_transfer'

    return (
      <Card className="max-w-[520px]">
        <div className="flex items-start justify-between gap-lg">
          <div>
            <p className="micro-label text-muted-foreground">Booking created</p>
            <p className="mt-xs font-mono text-display-sm text-foreground">{created.reference}</p>
          </div>
          <Badge tone={isTransfer ? 'warning' : 'positive'}>
            {isTransfer ? 'Awaiting payment' : 'Confirmed'}
          </Badge>
        </div>

        <p className="mt-sm text-body-md text-copy">
          {created.unitRef} · {formatStayDate(created.checkIn)} → {formatStayDate(created.checkOut)}
        </p>

        <dl className="mt-lg border-t border-divider pt-lg">
          <div className="flex items-baseline justify-between gap-lg">
            <dt className="text-body-md text-muted-foreground">
              {isTransfer ? 'To transfer' : 'Paid'}
            </dt>
            <dd className="text-body-md-strong text-foreground tabular-nums">
              BND {formatCents(created.total)}
            </dd>
          </div>
          <div className="mt-sm flex items-baseline justify-between gap-lg">
            <dt className="text-body-md text-muted-foreground">Security deposit collected</dt>
            <dd className="text-body-md-strong text-foreground tabular-nums">
              BND {formatCents(created.securityDeposit)}
            </dd>
          </div>
        </dl>

        <p className="mt-lg text-body-sm text-muted-foreground">
          {isTransfer
            ? 'The guest must quote the reference above in the transfer description — it is how the payment is matched. It is also what they quote at the gate.'
            : 'Give the guest the reference above — it is what they quote at the gate.'}
        </p>

        {isTransfer ? (
          <Notice className="mt-md">
            The unit is held for this booking now. It stays held until someone confirms the transfer
            landed, so this booking needs working off the verification queue.
          </Notice>
        ) : null}

        {isTransfer ? (
          <Button asChild variant="tertiary" className="mt-lg mr-sm">
            <Link href="/portal/payments">Open the verification queue</Link>
          </Button>
        ) : null}

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

        <FormSection title="Guest">
          <div className="grid gap-lg">
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
              Plus BND {formatCents(quote.securityDeposit)} refundable security deposit, collected
              on arrival.
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
