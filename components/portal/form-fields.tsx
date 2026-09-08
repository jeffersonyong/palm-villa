'use client'

import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * The two labelled fields the booking forms are built from: a label, the
 * input, and the error line under it, in one `grid gap-sm` (design.md
 * §Components — Portal forms). They were declared twice, once per form, and
 * had begun to drift.
 *
 * Fields size to their content: a count gets ~150px, not a row. `TextField`
 * runs uncontrolled unless given `value`/`onChange`, so the walk-in form's
 * plain `<form action>` fields and the amendment form's controlled ones are
 * the same component.
 *
 * `placeholder` carries an example of the value — `John Doe`, `BAA 1234` —
 * never a restatement of the label above it. An empty field says nothing about
 * the shape of what belongs in it, and a desk filling this in with a guest
 * waiting should not have to guess whether a phone wants the +673.
 */

interface NumberFieldProps {
  id: string
  label: string
  value: number
  min: number
  onChange: (value: number) => void
  error?: string
}

export function NumberField({ id, label, value, min, onChange, error }: NumberFieldProps) {
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
  /** An example of the value, never a restatement of the label. */
  placeholder?: string
  /** Supplied together with `onChange` for a controlled field; omit both for uncontrolled. */
  value?: string
  onChange?: (value: string) => void
  autoComplete?: string
  className?: string
  error?: string
}

export function TextField({
  id,
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  autoComplete,
  className,
  error,
}: TextFieldProps) {
  return (
    <div className={cn('grid gap-sm', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
      <FieldError message={error} />
    </div>
  )
}

interface MoneyFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  /** Sits under the field when there is no error to show instead. */
  hint?: string
  error?: string
  className?: string
}

/**
 * An amount in BND: the currency stated beside the field, never inside it.
 *
 * Text rather than `type="number"`, which is the same decision
 * discount-fields.tsx records — `centsFromInput()` refuses what it cannot read
 * rather than repairing it, where a number input silently swallows a stray
 * comma and hands back something plausible. A price nobody agreed is worse
 * than a field that says no.
 *
 * The label is `BND` on the left rather than a suffix or a placeholder,
 * because the figure is `tabular-nums` and right-aligned wherever these sit in
 * a table: a prefix keeps the digits in one column.
 */
export function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  className,
}: MoneyFieldProps) {
  return (
    <div className={cn('grid gap-sm', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-sm">
        <span className="text-body-sm text-muted-foreground">BND</span>
        <Input
          id={id}
          name={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          aria-invalid={error ? true : undefined}
          className="w-[140px] tabular-nums"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {error ? (
        <FieldError message={error} />
      ) : hint ? (
        <p className="text-caption text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
