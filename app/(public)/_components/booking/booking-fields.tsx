'use client'

import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field-error'
import { cn } from '@/lib/utils'

/**
 * The fields every public booking form asks for, and one it hopes nobody
 * answers.
 *
 * Deliberately plain: these are the same Input and FieldError the portal uses,
 * at the customer surface's 36px control height, because a booking form is a
 * form. What differs from the portal's equivalents is only who is filling them
 * in — which is why the labels are sentences a guest would use rather than the
 * desk's shorthand.
 */

export function PublicField({
  id,
  name,
  label,
  hint,
  type = 'text',
  required,
  defaultValue,
  error,
  autoComplete,
  inputMode,
  className,
}: {
  id: string
  name: string
  label: string
  hint?: string
  type?: string
  required?: boolean
  defaultValue?: string
  error?: string
  autoComplete?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric'
  className?: string
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className={cn('flex flex-col gap-xs', className)}>
      <label htmlFor={id} className="text-body-sm-strong text-foreground">
        {label}
        {required ? null : <span className="ml-xs text-muted-foreground">(optional)</span>}
      </label>
      <Input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
      />
      {hint ? (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  )
}

/**
 * A counter — guests, children, sofa beds, a band on a day pass.
 *
 * A number input rather than a stepper, because a family of nine typing 9 is
 * faster than nine taps, and because a stepper is a control this system has
 * never drawn. `inputMode="numeric"` puts the digits keyboard on a phone,
 * which is most of the benefit a stepper would have bought.
 *
 * **The column has a fixed width and the input does not fill it.** Left to
 * itself a flex item is as wide as its widest child, which here is the hint —
 * so "BND 28.00 each, with a pillow and blanket" made its field three times
 * the width of "Age 3 and under" and the gaps between fields read as arbitrary
 * rather than as a rhythm. The column is fixed so the row is even; the input
 * stays narrow because design.md sizes a field to its content and a two-digit
 * count does not get a row. The hint wraps inside the column instead.
 */
export function CountField({
  id,
  name,
  label,
  hint,
  value,
  min = 0,
  max = 50,
  onChange,
  error,
}: {
  id: string
  name: string
  label: string
  hint?: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
  error?: string
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className="flex w-[190px] flex-col gap-xs">
      <label htmlFor={id} className="text-body-sm-strong text-foreground">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={String(value)}
        onChange={(event) => {
          const next = Number(event.target.value)

          onChange(Number.isFinite(next) ? next : 0)
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className="w-[110px]"
      />
      {hint ? (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  )
}

/**
 * The honeypot.
 *
 * A field a person never sees and a form-filling script fills in anyway. It is
 * the cheapest third of the abuse answer (the counter and the open-holds cap
 * are the other two, and the cap is the one that protects inventory), it costs
 * a customer nothing, and unlike a CAPTCHA it asks nobody to prove they are a
 * person — which web/security.md prefers and which matters more than usual on
 * a page where the alternative is losing the booking.
 *
 * Hidden the way a hidden field has to be hidden from *everyone*: taken out of
 * the accessible tree as well as off the screen, with `tabIndex={-1}` so it
 * cannot be reached by keyboard and `autoComplete="off"` so a browser does not
 * helpfully fill it in on a real customer's behalf.
 */
export function HoneypotField() {
  return (
    <div aria-hidden className="hidden">
      <label htmlFor="website">Website</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  )
}
