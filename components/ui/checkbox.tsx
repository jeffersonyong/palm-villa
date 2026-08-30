'use client'

import { CheckIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * Radix Checkbox, themed to design.md.
 *
 * Checked is the action colour — a checkbox is the one control small enough
 * that a lagoon fill costs nothing against the one-primary-per-region rule. On
 * the operations surfaces that action colour resolves to ink, so the portal's
 * checkboxes stay monochrome like everything else there.
 * `{rounded.sm}` 4px: at 16px the 6px control radius reads as a circle.
 *
 * The box is drawn by `CheckboxGlyph` rather than by the root, so that controls
 * which show a checkbox they do not own the state of — a multi-select menu
 * item, where the *item* is the thing being toggled — can render the same box
 * instead of a hand-copied lookalike. The glyph reads its parent's
 * `data-state`, which is what both cases have in common.
 */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'group peer inline-flex size-4 shrink-0 rounded-sm outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxGlyph />
    </CheckboxPrimitive.Root>
  )
}

/**
 * The box itself: hairline and card fill when clear, the action colour when
 * checked, with the tick held at full size and faded rather than mounted, so
 * nothing about the box moves as it toggles.
 *
 * Driven by the `data-state` of whatever it sits inside — a Radix checkbox
 * root, or a menu item that toggles — which is why it takes no props.
 */
function CheckboxGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="checkbox-glyph"
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
        'border-border bg-card',
        'group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground',
        'group-data-[state=indeterminate]:border-primary group-data-[state=indeterminate]:bg-primary group-data-[state=indeterminate]:text-primary-foreground',
        'group-aria-invalid:border-destructive',
        className,
      )}
    >
      <CheckIcon
        className="size-3 opacity-0 transition-opacity group-data-[state=checked]:opacity-100 motion-reduce:transition-none"
        strokeWidth={3}
      />
    </span>
  )
}

export { Checkbox, CheckboxGlyph }
