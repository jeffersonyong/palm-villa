'use client'

import { TextField } from '@/components/portal/form-fields'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MAX_DISCOUNT_REASON_LENGTH, type DiscountKind } from '@/lib/domain/discount'

/**
 * The discount control, shared by the walk-in and amendment forms.
 *
 * Progressive on purpose: it opens as one select reading "No discount", and
 * the value and reason appear only once a kind is chosen. A discount is the
 * exception, not the shape of a booking, and two permanently empty fields on
 * every booking taken at the desk would be two more things to skip past.
 *
 * Controlled by the parent rather than owning its own state, because the price
 * card beside it has to move as the figure is typed — a clerk reading a total
 * back to a guest should not have to submit to find out what it is.
 *
 * Rendered only for a staff member holding `booking.discount`. That is decided
 * by the screen, and enforced again in the server action: this component is
 * the affordance, never the gate.
 */

export interface DiscountValue {
  kind: DiscountKind | 'none'
  /** As typed — `40.00` for an amount, `15` for a percentage. */
  value: string
  reason: string
}

export const NO_DISCOUNT: DiscountValue = { kind: 'none', value: '', reason: '' }

interface DiscountFieldsProps {
  value: DiscountValue
  onChange: (next: DiscountValue) => void
  errors?: {
    discountKind?: string
    discountValue?: string
    discountReason?: string
  }
}

export function DiscountFields({ value, onChange, errors }: DiscountFieldsProps) {
  const isPercent = value.kind === 'percent'

  return (
    <div className="grid gap-lg">
      <div className="grid gap-sm">
        <Label htmlFor="discountKind">Type</Label>
        <Select
          name="discountKind"
          value={value.kind}
          // Switching type clears the figure rather than reinterpreting it:
          // "40" meant forty dollars a moment ago and would silently become
          // forty percent, which is a different conversation with the guest.
          onValueChange={(next) =>
            onChange({ ...value, kind: next as DiscountValue['kind'], value: '' })
          }
        >
          <SelectTrigger id="discountKind" className="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No discount</SelectItem>
            <SelectItem value="amount">Amount off, in BND</SelectItem>
            <SelectItem value="percent">Percentage off</SelectItem>
          </SelectContent>
        </Select>
        <FieldError message={errors?.discountKind} />
      </div>

      {value.kind === 'none' ? (
        <p className="text-body-sm text-muted-foreground">
          The booking is priced from the rate card. Choose a type above to take something off it.
        </p>
      ) : (
        <>
          <div className="grid w-[150px] gap-sm">
            <Label htmlFor="discountValue">{isPercent ? 'Percentage' : 'Amount, BND'}</Label>
            <Input
              id="discountValue"
              name="discountValue"
              inputMode="decimal"
              // Text rather than number: `centsFromInput` rejects rather than
              // repairs what it cannot read, and a number input would have
              // already silently swallowed a stray comma before it got there.
              value={value.value}
              placeholder={isPercent ? '10' : '40.00'}
              aria-invalid={errors?.discountValue ? true : undefined}
              className="tabular-nums"
              onChange={(event) => onChange({ ...value, value: event.target.value })}
            />
            <FieldError message={errors?.discountValue} />
          </div>

          <TextField
            id="discountReason"
            label="Reason"
            placeholder="Repeat guest, agreed with the owner"
            value={value.reason}
            onChange={(next) => onChange({ ...value, reason: next })}
            className="max-w-[420px]"
            error={errors?.discountReason}
          />

          <p className="text-caption text-muted-foreground">
            Required, and kept on the booking&rsquo;s record — the guest never sees it. Up to{' '}
            {MAX_DISCOUNT_REASON_LENGTH} characters.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * The three form values as the domain parser wants them.
 *
 * A one-line mapping, but it exists so neither form spells the field names out
 * by hand — they are the same three strings the server action reads off
 * `FormData`, and a typo in one of them would be a discount silently dropped.
 */
export function toDiscountFormValues(value: DiscountValue): {
  kind: string
  value: string
  reason: string
} {
  return { kind: value.kind, value: value.value, reason: value.reason }
}
