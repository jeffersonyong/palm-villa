'use client'

import { CalendarDays } from 'lucide-react'
import { useState } from 'react'

import { RangeCalendar } from '@/components/ui/calendar'
import type { DayBounds, StayDateRange } from '@/components/ui/calendar-grid'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatStayRange, nightsBetween, type StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

/**
 * A stay, in the form dress (design.md §Components — Stay range).
 *
 * The third member of a family, not a fourth calendar: `DateField` is one day
 * in the form dress, `DateRangePicker` is a span in the filter dress, and this
 * is a span in the form dress. Everything visual is inherited — the Input
 * treatment on the trigger, the calendar glyph rather than the select's
 * chevron, the menu-scale panel, the two-month grid, the bookended footer.
 *
 * It exists because a stay was being asked for as **two fields**, and the
 * reasons design.md gives for a span being one control are all sharper here.
 * Two fields let a clerk set a check-out before a check-in, leave one half
 * empty, or fill both and learn only on submit that the second is not after the
 * first; two clicks on a grid cannot express any of it. And the question a
 * clerk is actually holding — *how many nights is this* — is arithmetic they
 * were doing in their head between two fields, so the control says it.
 *
 * **The second click is the check-out morning**, the same convention the public
 * availability calendar and the booking calendar use, and the one thing that
 * makes this different from the filter chip it looks like. `[12, 15)` is three
 * nights: the 15th is drawn as an end, is never a night, and is sellable to
 * somebody else. Because the two ends are different kinds of thing they do not
 * sort — clicking before the arrival re-anchors — which is `selection="stay"`
 * on the calendar underneath.
 *
 * **The nights are on the trigger, not only in the panel.** A closed control
 * that reads `12 – 15 Sept 2026` is the same string the filter chip shows for a
 * range meaning something else, and the difference is exactly what a desk gets
 * wrong. `· 3 nights` is the disambiguation, and it happens to be the number
 * being checked against the guest on the phone.
 *
 * It submits through two hidden inputs, so a `<form method="get">` reads `from`
 * and `to` exactly as it did when they were two date fields.
 */

interface StayRangeFieldProps {
  /** Matches the `Label`'s `htmlFor`; lands on the trigger. */
  id?: string
  /** The field name for the arrival. Submitted through a hidden input. */
  nameFrom?: string
  /** The field name for the departure morning. */
  nameTo?: string
  /** Controlled value. Leave unset to run uncontrolled from `defaultValue`. */
  value?: StayDateRange | null
  defaultValue?: StayDateRange | null
  onChange?: (range: StayDateRange | null) => void
  /** The earliest arrival, inclusive. */
  min?: StayDate
  /** The latest departure, inclusive. */
  max?: StayDate
  disabled?: boolean
  /**
   * Marks the field as rejected. Not `aria-invalid`, for the reason
   * `DateField` gives: the trigger is a button that opens a dialog, not a
   * widget that takes input.
   */
  invalid?: boolean
  /** The id of the error or hint text under the field. */
  describedBy?: string
  placeholder?: string
  className?: string
}

export function StayRangeField({
  id,
  nameFrom,
  nameTo,
  value: controlledValue,
  defaultValue = null,
  onChange,
  min,
  max,
  disabled,
  invalid,
  describedBy,
  placeholder = 'Pick the dates',
  className,
}: StayRangeFieldProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [uncontrolledValue, setUncontrolledValue] = useState<StayDateRange | null>(defaultValue)
  /** The arrival of a selection still in progress, for the footer's prompt. */
  const [draftStart, setDraftStart] = useState<StayDate | null>(null)

  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : uncontrolledValue
  const bounds: DayBounds = { min, max }

  function commit(range: StayDateRange) {
    if (!isControlled) {
      setUncontrolledValue(range)
    }

    onChange?.(range)
    setIsOpen(false)
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(next) => {
        setIsOpen(next)
        // A half-made selection does not survive the panel closing, exactly as
        // on the filter: reopening to find an arrival already set, with no
        // memory of setting it, is worse than starting again.
        setDraftStart(null)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-describedby={describedBy}
          data-invalid={invalid || undefined}
          data-slot="stay-range-field"
          className={cn(
            // The Input treatment, to the pixel — see `date-field.tsx`, which
            // this has to be indistinguishable from in a form row.
            'flex h-control w-full min-w-0 items-center justify-between gap-sm rounded-md border border-border bg-card px-md py-xs text-left text-body-md text-foreground transition-[border-color,box-shadow] outline-none',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/10',
            'data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/10',
            'data-[invalid]:border-destructive data-[invalid]:ring-[3px] data-[invalid]:ring-destructive/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate', value === null && 'text-muted-foreground')}>
            {value === null ? (
              placeholder
            ) : (
              <>
                {formatStayRange(value.start, value.end)}{' '}
                <span className="text-muted-foreground">· {nightsLabel(value)}</span>
              </>
            )}
          </span>
          <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" scale="menu">
        <div className="p-lg">
          <RangeCalendar
            value={value}
            selection="stay"
            bounds={bounds}
            onDraftChange={setDraftStart}
            onSelect={commit}
          />
        </div>

        {/* The filter's footer, saying a stay's version of the same two
            things. Mid-selection it names the arrival and asks for the
            departure — the one thing a two-click control cannot show on the
            grid — and it says *morning*, because "check-out" alone is the word
            a clerk would otherwise read as the last night. There is no Clear:
            a booking cannot be made without dates, so emptying the field is a
            state this form has no use for. */}
        <footer className="flex items-center gap-md border-t border-divider px-lg py-md">
          <p
            className={cn(
              'text-body-sm',
              draftStart || value ? 'text-copy' : 'text-muted-foreground',
            )}
          >
            {draftStart ? (
              <>
                <span className="font-medium text-foreground">
                  {formatStayRange(draftStart, draftStart)}
                </span>{' '}
                — now pick the check-out morning
              </>
            ) : value ? (
              <>
                {formatStayRange(value.start, value.end)}{' '}
                <span className="text-muted-foreground">
                  · {nightsLabel(value)}, out on {formatStayRange(value.end, value.end)}
                </span>
              </>
            ) : (
              'Pick the arrival, then the check-out morning'
            )}
          </p>
        </footer>
      </PopoverContent>

      {/* What the form actually submits. The visible control is a button, so
          without these a `method="get"` form would send nothing. */}
      {nameFrom ? <input type="hidden" name={nameFrom} value={value?.start ?? ''} /> : null}
      {nameTo ? <input type="hidden" name={nameTo} value={value?.end ?? ''} /> : null}
    </Popover>
  )
}

function nightsLabel(range: StayDateRange): string {
  const nights = nightsBetween(range.start, range.end)

  return `${nights} ${nights === 1 ? 'night' : 'nights'}`
}
