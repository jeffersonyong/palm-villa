'use client'

import { useState } from 'react'

import { FormSection } from '@/components/portal/form-section'
import { MoneyField } from '@/components/portal/form-fields'
import { Card } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Notice } from '@/components/ui/notice'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderRow,
  TableHeader,
  TableRow,
  TableRowHead,
} from '@/components/ui/table'
import { pricingDraftFrom, type PricingDraft } from '@/lib/domain/settings-checks'
import type { PropertySettings } from '@/lib/domain/settings'

import { savePricingAction } from './actions'
import { SettingsForm } from './settings-form'

/**
 * Nightly rates and the policy figures behind a quote (capability F3).
 *
 * Every number here was a literal in lib/domain/config.ts until 20260912000100,
 * and several are still provisional — prd.md §18's open items. That is the
 * point of the screen: an answer from the client is a figure typed here, not a
 * deploy.
 *
 * **A change is not retrospective.** prd.md §8 makes the itemised lines the
 * price, so a booking already taken keeps what it was quoted; only a new
 * booking or an amendment reprices. Said on screen, because "does this change
 * what I already sold" is the first thing anybody wonders.
 */

interface PricingTabProps {
  settings: PropertySettings
}

export function PricingTab({ settings }: PricingTabProps) {
  const saved = pricingDraftFrom(settings)
  const [draft, setDraft] = useState<PricingDraft>(saved)

  function setUnitType(index: number, field: 'baseRate' | 'maxPax' | 'carParks', value: string) {
    setDraft((current) => ({
      ...current,
      unitTypes: current.unitTypes.map((unitType, position) =>
        position === index ? { ...unitType, [field]: value } : unitType,
      ),
    }))
  }

  function setPolicy<K extends keyof PricingDraft['policy']>(
    field: K,
    value: PricingDraft['policy'][K],
  ) {
    setDraft((current) => ({ ...current, policy: { ...current.policy, [field]: value } }))
  }

  return (
    <SettingsForm
      action={savePricingAction}
      draft={draft}
      saved={saved}
      expectedUpdatedAt={settings.settingsUpdatedAt}
      savedTitle="Rates updated"
    >
      {({ problemFor }) => (
        <Card className="p-card">
          <FormSection title="Nightly rates">
            <Table scrollX>
              <TableHeader>
                <TableHeaderRow>
                  <TableHead>Unit type</TableHead>
                  <TableHead className="text-right">Rate per night (BND)</TableHead>
                  <TableHead className="text-right">Maximum guests</TableHead>
                  <TableHead className="text-right">Car parks</TableHead>
                </TableHeaderRow>
              </TableHeader>
              <TableBody>
                {draft.unitTypes.map((unitType, index) => (
                  <TableRow key={unitType.slug}>
                    <TableRowHead>{unitType.name}</TableRowHead>
                    <TableCell className="text-right">
                      <CellInput
                        id={`rate-${unitType.slug}`}
                        label={`Rate per night for ${unitType.name}`}
                        value={unitType.baseRate}
                        error={problemFor(`unitTypes.${index}.baseRate`)}
                        onChange={(value) => setUnitType(index, 'baseRate', value)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <CellInput
                        id={`pax-${unitType.slug}`}
                        label={`Maximum guests for ${unitType.name}`}
                        value={unitType.maxPax}
                        width="w-[90px]"
                        error={problemFor(`unitTypes.${index}.maxPax`)}
                        onChange={(value) => setUnitType(index, 'maxPax', value)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <CellInput
                        id={`parks-${unitType.slug}`}
                        label={`Car parks for ${unitType.name}`}
                        value={unitType.carParks}
                        width="w-[90px]"
                        error={problemFor(`unitTypes.${index}.carParks`)}
                        onChange={(value) => setUnitType(index, 'carParks', value)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Notice className="mt-lg">
              A rate change applies to bookings taken from now on. A booking already made keeps the
              price it was quoted — unless somebody amends it, which reprices the whole stay at
              today’s rates.
            </Notice>
          </FormSection>

          <FormSection title="Guests and extras">
            <div className="grid gap-lg sm:grid-cols-2">
              <div className="grid gap-sm">
                <Label htmlFor="paxPolicy">When a party is over the maximum</Label>
                <Select
                  value={draft.policy.paxPolicy}
                  onValueChange={(value) =>
                    setPolicy('paxPolicy', value as PricingDraft['policy']['paxPolicy'])
                  }
                >
                  <SelectTrigger id="paxPolicy" className="w-full max-w-[360px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="surcharge_threshold">Charge for each extra guest</SelectItem>
                    <SelectItem value="hard_cap">Refuse the booking</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-caption text-muted-foreground">
                  The price list says “max 8 pax” and “7 per extra person”, which read differently.
                  Charging is what the system does today.
                </p>
              </div>

              <MoneyField
                id="extraPersonPerNight"
                label="Extra guest, per night"
                value={draft.policy.extraPersonPerNight}
                error={problemFor('policy.extraPersonPerNight')}
                onChange={(value) => setPolicy('extraPersonPerNight', value)}
              />

              <PlainField
                id="paxExemptAgeMax"
                label="Children up to this age are not counted"
                value={draft.policy.paxExemptAgeMax}
                width="w-[110px]"
                hint="Applies to the extra-guest charge and the stated maximum."
                error={problemFor('policy.paxExemptAgeMax')}
                onChange={(value) => setPolicy('paxExemptAgeMax', value)}
              />

              <MoneyField
                id="sofaBedFee"
                label="Sofa bed, per stay"
                value={draft.policy.sofaBedFee}
                hint="Includes one pillow and one blanket."
                error={problemFor('policy.sofaBedFee')}
                onChange={(value) => setPolicy('sofaBedFee', value)}
              />

              <PlainField
                id="sofaBedStock"
                label="Sofa beds available"
                value={draft.policy.sofaBedStock}
                width="w-[110px]"
                hint="Leave blank if nobody has counted them — the system will not limit bookings."
                error={problemFor('policy.sofaBedStock')}
                onChange={(value) => setPolicy('sofaBedStock', value)}
              />
            </div>
          </FormSection>

          <FormSection title="Arrival and departure">
            <div className="grid gap-lg sm:grid-cols-2">
              <PlainField
                id="checkInTime"
                label="Check-in time"
                value={draft.policy.checkInTime}
                width="w-[110px]"
                placeholder="14:00"
                hint="24-hour. Anything earlier is an early check-in."
                error={problemFor('policy.checkInTime')}
                onChange={(value) => setPolicy('checkInTime', value)}
              />

              <PlainField
                id="checkOutTime"
                label="Check-out time"
                value={draft.policy.checkOutTime}
                width="w-[110px]"
                placeholder="12:00"
                hint="24-hour. Anything later is a late check-out."
                error={problemFor('policy.checkOutTime')}
                onChange={(value) => setPolicy('checkOutTime', value)}
              />

              <MoneyField
                id="earlyCheckInPerHour"
                label="Early check-in, per hour"
                value={draft.policy.earlyCheckInPerHour}
                hint="Priced when the desk grants it. The booking form does not offer it."
                error={problemFor('policy.earlyCheckInPerHour')}
                onChange={(value) => setPolicy('earlyCheckInPerHour', value)}
              />

              <MoneyField
                id="lateCheckOutPerHour"
                label="Late check-out, per hour"
                value={draft.policy.lateCheckOutPerHour}
                hint="Charged for every hour past check-out, not once."
                error={problemFor('policy.lateCheckOutPerHour')}
                onChange={(value) => setPolicy('lateCheckOutPerHour', value)}
              />
            </div>
          </FormSection>

          <FormSection title="Deposit and booking window">
            <div className="grid gap-lg sm:grid-cols-2">
              <MoneyField
                id="securityDeposit"
                label="Security deposit"
                value={draft.policy.securityDeposit}
                hint="Refundable, and never discounted. It is not a cap on what damage can cost."
                error={problemFor('policy.securityDeposit')}
                onChange={(value) => setPolicy('securityDeposit', value)}
              />

              <PlainField
                id="maxAdvanceBookingDays"
                label="How far ahead a booking can be made (days)"
                value={draft.policy.maxAdvanceBookingDays}
                width="w-[110px]"
                error={problemFor('policy.maxAdvanceBookingDays')}
                onChange={(value) => setPolicy('maxAdvanceBookingDays', value)}
              />
            </div>
          </FormSection>
        </Card>
      )}
    </SettingsForm>
  )
}

/** A labelled field that is not money — a count, or a clock time. */
function PlainField({
  id,
  label,
  value,
  onChange,
  width = 'w-[150px]',
  placeholder,
  hint,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  width?: string
  placeholder?: string
  hint?: string
  error?: string
}) {
  return (
    <div className="grid gap-sm">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={`${width} tabular-nums`}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <FieldError message={error} />
      ) : hint ? (
        <p className="text-caption text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * The same field inside a table cell: no visible label, because the column
 * header is the label — but a real one for a screen reader, since a row of
 * bare inputs is unreadable without it.
 */
function CellInput({
  id,
  label,
  value,
  onChange,
  width = 'w-[130px]',
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  width?: string
  error?: string
}) {
  return (
    <div className="inline-grid gap-xs text-left">
      <Input
        id={id}
        aria-label={label}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        className={`${width} text-right tabular-nums`}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError message={error} />
    </div>
  )
}
