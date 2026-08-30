'use client'

import { X } from 'lucide-react'
import { useState } from 'react'

import { RangeCalendar, type StayDateRange } from '@/components/ui/calendar'
import { DATE_RANGE_PRESETS, matchingPreset } from '@/components/ui/date-range-presets'
import { FilterChip } from '@/components/ui/filter-chip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatStayRange, todayInBrunei, type StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

/**
 * One control for a span of dates (design.md §Components — Date range).
 *
 * It replaces a pair of date fields, and the reason is not only that it is
 * smaller. Two fields let a staff member type a "from" after the "to", leave
 * one half empty, or fill both and still not know whether anything matched
 * until they press Apply. Two clicks on a calendar cannot express any of those
 * states, so none of them need handling, warning about, or explaining.
 *
 * Two months side by side because most of what this filter is asked is
 * "arriving over the next few weeks", which straddles a month boundary more
 * often than not — one month would mean paging to answer the common question.
 *
 * A rail of named spans sits beside the grid, because almost every range asked
 * for is one of a handful and paging a calendar to rebuild "this month" by hand
 * is exactly the work a filter exists to remove. A preset is a shortcut to the
 * same value the grid produces, never a separate mode: pick one and it shows as
 * a selected chip, hand-pick the same days and it shows as selected too.
 *
 * There is no Apply button. The second click completes the range, so that is
 * where the filter commits and the panel closes; a button afterwards would only
 * ask the user to confirm something they already said.
 */

interface DateRangePickerProps {
  /** The field name, shown on the chip. */
  label: string
  /** The committed range — both ends inclusive — or `null` when unset. */
  value: StayDateRange | null
  /** Called with the new range, or `null` when cleared. */
  onChange: (range: StayDateRange | null) => void
  /** How many months to show. Defaults to two. */
  months?: number
  className?: string
}

export function DateRangePicker({
  label,
  value,
  onChange,
  months = 2,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  /** The first day of a selection still in progress, for the footer's prompt. */
  const [draftStart, setDraftStart] = useState<StayDate | null>(null)
  const [today] = useState(() => todayInBrunei())

  const selectedPreset = matchingPreset(value, today)

  function commit(range: StayDateRange) {
    onChange(range)
    setIsOpen(false)
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(next) => {
        setIsOpen(next)
        // A half-made selection does not survive the panel closing: reopening
        // to find one end already committed, with no memory of having set it,
        // is worse than starting again.
        setDraftStart(null)
      }}
    >
      <PopoverTrigger asChild>
        <FilterChip
          className={className}
          label={label}
          value={value ? formatStayRange(value.start, value.end) : null}
        />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex items-stretch">
          {/* The rail is bounded by a hairline like every other seam in the
              system, and it scrolls rather than stretching the panel if the
              set ever grows. */}
          <div className="w-[128px] shrink-0 border-r border-divider p-sm">
            {DATE_RANGE_PRESETS.map((preset) => {
              const isSelected = preset.id === selectedPreset?.id

              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => commit(preset.resolve(today))}
                  className={cn(
                    'flex w-full items-center rounded-md px-md py-sm text-left text-body-sm transition-colors outline-none',
                    'text-copy hover:bg-muted hover:text-foreground',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover',
                    // Selected is the surface shift every other "where am I" in
                    // the system uses — the sidebar chip, the active segment.
                    isSelected && 'bg-muted font-medium text-foreground',
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          <div className="p-lg">
            <RangeCalendar
              value={value}
              months={months}
              onDraftChange={setDraftStart}
              onSelect={commit}
            />
          </div>
        </div>

        {/* The footer bookends the grid the way a table's does its rows: the
            same hairline, flush to the panel's edges, one quiet line of state
            on the left and the one way out of it on the right. */}
        <footer className="flex items-center justify-between gap-md border-t border-divider px-lg py-md">
          {/* Mid-selection the footer names the half already chosen and asks
              for the other, which is the one thing a two-click control cannot
              show on the grid itself. */}
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
                — now pick the last day
              </>
            ) : value ? (
              formatStayRange(value.start, value.end)
            ) : (
              'Pick a first and last day'
            )}
          </p>
          {value && !draftStart ? (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setIsOpen(false)
              }}
              className="inline-flex items-center gap-xs rounded-md px-sm py-xs text-body-sm text-copy transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover"
            >
              <X aria-hidden className="size-4 text-muted-foreground" />
              Clear
            </button>
          ) : null}
        </footer>
      </PopoverContent>
    </Popover>
  )
}
