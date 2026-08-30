'use client'

import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The trigger idiom for a filter row (design.md §Components — Filter rows).
 *
 * A filter is not a form field, and dressing it as one is what makes list
 * screens look like data-entry screens. A form field asks you to supply a
 * value; a filter chip *reports* one, and has to be readable at a glance from
 * across the row — which is why the field's name lives inside the control
 * rather than on a `Label` above it, and why an unset filter shows only its
 * name.
 *
 * The whole state of the filter is carried by two shifts, both of them already
 * in the system:
 *
 * - **Set vs unset is a surface shift**, not a colour: an active chip fills
 *   with `canvas-soft`, the same "selected chip" language as the sidebar's
 *   active item and the segmented control (design.md §Color roles). The portal
 *   is monochrome, so nothing here may go teal.
 * - **Name vs value is a contrast shift**: once a value is set, the field name
 *   steps back to mute and the value takes ink at 500. The reader's eye lands
 *   on the answer, and the question stays available underneath it.
 *
 * Rendered as a plain `<button>` so it can be handed to any Radix trigger with
 * `asChild` — `Select` and `Popover` both wear it, which is what keeps two
 * different kinds of control looking like siblings in one row.
 */

// `value` is deliberately shadowed: a filter chip never submits, so the DOM
// attribute has no job here and the prop name that reads best at the call site
// wins.
interface FilterChipProps extends Omit<React.ComponentProps<'button'>, 'value'> {
  /** The field this filter acts on, e.g. `Status`. Always visible. */
  label: string
  /**
   * The current value, rendered in ink beside the label. `null` means the
   * filter is off, and the chip shows only its label.
   */
  value?: React.ReactNode
}

function FilterChip({ label, value, className, children, ...props }: FilterChipProps) {
  const isActive = value !== null && value !== undefined

  return (
    <button
      type="button"
      data-slot="filter-chip"
      data-active={isActive || undefined}
      className={cn(
        'group inline-flex h-control items-center gap-sm rounded-md border border-border px-md text-body-sm whitespace-nowrap transition-colors outline-none',
        'bg-card text-copy hover:bg-muted hover:text-foreground',
        'data-[active]:bg-muted data-[active]:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'data-[state=open]:bg-muted data-[state=open]:text-foreground',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span className={cn(isActive && 'text-muted-foreground')}>{label}</span>
      {isActive ? <span className="font-medium text-foreground">{value}</span> : null}
      {children}
      <ChevronDown
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
      />
    </button>
  )
}

export { FilterChip }
