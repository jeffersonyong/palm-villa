'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { Popover as PopoverPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * Radix Popover, themed to design.md §Elevation level 4. A popover floats, so
 * it is the one place a shadow is structure rather than decoration.
 *
 * The shell comes at the overlay's **two scales** (design.md §Components —
 * Overlays), and `scale` is the whole difference:
 *
 * - `surface` — a panel that is its own object, standing over the page at a
 *   fixed width with `xl` padding and the 16px surface radius.
 * - `menu` — a panel that **opens out of a control**, at the 12px menu radius,
 *   sized to its content and padded by that content. The date pickers are
 *   this: a date field sits in the same form row as a select, and design.md
 *   asks that the two be indistinguishable until one is opened — a promise
 *   that breaks at the moment of opening if their panels round differently.
 *
 * It is a variant rather than two `className` overrides at the call sites,
 * because "which scale is this" is a question the shell should answer once.
 */
function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

/** For a "Done"/dismiss control inside the panel. */
function PopoverClose({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Close>) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

const popoverVariants = cva(
  [
    'z-50 border border-border bg-popover text-body-md text-popover-foreground shadow-overlay outline-none',
    'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
    'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
    'motion-reduce:animate-none',
  ],
  {
    variants: {
      scale: {
        surface: 'w-72 rounded-xl p-xl',
        // Sized and padded by what it holds — a calendar grid measures itself,
        // and a fixed width would either crop the month or leave a margin of
        // nothing beside it.
        menu: 'w-auto rounded-lg p-0',
      },
    },
    defaultVariants: {
      scale: 'surface',
    },
  },
)

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  scale,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & VariantProps<typeof popoverVariants>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(popoverVariants({ scale, className }))}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger }
