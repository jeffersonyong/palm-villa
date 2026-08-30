'use client'

import { CalendarDays, X } from 'lucide-react'
import { useState } from 'react'

import { isOutOfBounds, type DayBounds } from '@/components/ui/calendar-grid'
import { DayCalendar } from '@/components/ui/day-calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatStayRange, todayInBrunei, type StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

/**
 * One day, in the form dress (design.md §Components — Single date).
 *
 * This replaces `<input type="date">` on every portal form, and the reason is
 * the panel rather than the field. The closed control was already ours — input
 * treatment, hairline, 6px, `body-md` — but clicking it handed the screen to
 * the browser: Chrome's calendar, Safari's stepper, Firefox's third thing, none
 * of them carrying a token from this system and none of them agreeing with the
 * two-month range picker sitting one screen away on the bookings filter. A
 * staff member who learns to pick a stay on the filter should recognise the
 * grid on the booking form, and until now they did not.
 *
 * So the trigger keeps the Input treatment exactly — a date field and a text
 * field in one form row stay indistinguishable until you open one, which is the
 * same rule the select's form dress follows — and the panel is the overlay
 * shell with our own grid inside it.
 *
 * **The glyph is a calendar, not the select's chevron.** A chevron promises a
 * list of options; this opens a month. The two controls sit in the same forms,
 * and the ornament is the one honest place to say which is which.
 *
 * **The value reads as a date, not as digits.** `2026-09-12` is the wire
 * format; the field shows `12 Sept 2026`, the same phrasing the range chip and
 * the booking summary use. Typing is not offered — the whole reason this
 * control exists is that a calendar cannot express 31 February, a transposed
 * month, or a date outside the booking window, and a text field can express all
 * three and would need every one of them validated and explained.
 *
 * **`bounds` is `min`/`max`, kept.** The constraints the native input carried
 * are still enforced, now visibly: a day outside the window is drawn and not
 * offered, rather than silently rejected after the fact.
 *
 * The field submits through a hidden input, so a `<form method="get">` or a
 * server action reads `name` exactly as it did before. Native `required` is not
 * relied on — a hidden input cannot raise it — but a required field is simply
 * never `clearable`, so it always carries a value, and the server action
 * validates it regardless.
 */

interface DateFieldProps {
  /** Matches the `Label`'s `htmlFor`; lands on the trigger. */
  id?: string
  /** The form field name. Submitted through a hidden input. */
  name?: string
  /** Controlled value. Leave unset to run uncontrolled from `defaultValue`. */
  value?: StayDate | null
  defaultValue?: StayDate | null
  onChange?: (day: StayDate | null) => void
  /** The earliest selectable day, inclusive. */
  min?: StayDate
  /** The latest selectable day, inclusive. */
  max?: StayDate
  /** Offers a Clear in the panel footer. Off by default — most fields are required. */
  clearable?: boolean
  disabled?: boolean
  /**
   * Marks the field as rejected. Not `aria-invalid`: the trigger is a button
   * opening a dialog, not a widget that takes input, and `aria-invalid` is not
   * supported on that role — so the state is drawn from `data-invalid` and
   * *announced* by pointing `describedBy` at the message beneath the field.
   */
  invalid?: boolean
  /** The id of the error or hint text under the field. */
  describedBy?: string
  placeholder?: string
  className?: string
}

export function DateField({
  id,
  name,
  value: controlledValue,
  defaultValue = null,
  onChange,
  min,
  max,
  clearable = false,
  disabled,
  invalid,
  describedBy,
  placeholder = 'Pick a date',
  className,
}: DateFieldProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [uncontrolledValue, setUncontrolledValue] = useState<StayDate | null>(defaultValue)
  const [today] = useState(() => todayInBrunei())

  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : uncontrolledValue
  const bounds: DayBounds = { min, max }

  function commit(day: StayDate | null) {
    if (!isControlled) {
      setUncontrolledValue(day)
    }

    onChange?.(day)
  }

  function select(day: StayDate) {
    commit(day)
    setIsOpen(false)
  }

  // "Today" is only worth offering when today is inside the window and is not
  // already the answer — a shortcut to where you already are is noise.
  const canJumpToToday = !isOutOfBounds(today, bounds) && value !== today
  const canClear = clearable && value !== null
  const hasFooter = canJumpToToday || canClear

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-describedby={describedBy}
          data-invalid={invalid || undefined}
          data-slot="date-field"
          className={cn(
            // The Input treatment, to the pixel — see `input.tsx`.
            'flex h-control w-full min-w-0 items-center justify-between gap-sm rounded-md border border-border bg-card px-md py-xs text-left text-body-md text-foreground transition-[border-color,box-shadow] outline-none',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/10',
            // Open is the same treatment as focus: the panel belongs to this
            // control, so the control stays lit while it is showing.
            'data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/10',
            'data-[invalid]:border-destructive data-[invalid]:ring-[3px] data-[invalid]:ring-destructive/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate', value === null && 'text-muted-foreground')}>
            {value === null ? placeholder : formatStayRange(value, value)}
          </span>
          <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      {/* The grid sizes itself, so the panel does too — a fixed width would
          either crop the month or leave a margin of nothing beside it. */}
      <PopoverContent align="start" className="w-auto p-0">
        <div className="p-lg">
          <DayCalendar value={value} onSelect={select} bounds={bounds} />
        </div>

        {hasFooter ? (
          // The footer bookends the grid the way the range picker's does: the
          // same hairline, flush to the panel's edges, the shortcut on the left
          // and the way out of the value on the right.
          <footer className="flex items-center justify-between gap-md border-t border-divider px-lg py-md">
            {canJumpToToday ? (
              <FooterButton onClick={() => select(today)}>Today</FooterButton>
            ) : (
              <span />
            )}
            {canClear ? (
              <FooterButton
                onClick={() => {
                  commit(null)
                  setIsOpen(false)
                }}
              >
                <X aria-hidden className="size-4 text-muted-foreground" />
                Clear
              </FooterButton>
            ) : null}
          </footer>
        ) : null}
      </PopoverContent>

      {/* What the form actually submits. The visible control is a button, so
          without this a `method="get"` form would send nothing. */}
      {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}
    </Popover>
  )
}

function FooterButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-xs rounded-md px-sm py-xs text-body-sm text-copy transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover"
    >
      {children}
    </button>
  )
}
