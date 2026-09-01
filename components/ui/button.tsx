import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * shadcn/ui Button, re-skinned to design.md v1.0:
 * - lagoon is the action colour: `primary` is a deep teal fill in light and
 *   the vivid brand aqua in dark — the one striking solid on the screen,
 *   one per screen region
 * - `inverted` is the counterpart for dark surfaces (`invert-surface` cards
 *   and bands): vivid-on-dark, deep-on-light
 * - canonical radius `rounded-md` (6px); `h-control` height — 36px standard,
 *   32px on the operations portal via the `--spacing-control` override
 *   (globals.css); the `touch` size carries the field surface's 48px
 * - focus is a 2px ring in the action colour
 */
const buttonVariants = cva(
  'inline-flex h-control shrink-0 items-center justify-center gap-sm rounded-md text-button-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
        tertiary: 'border border-border bg-card text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-negative-deep',
        /**
         * A destructive action that is not the screen's primary one: the
         * `tertiary` chrome carrying destructive *text*, which is exactly the
         * weight `DropdownMenuItem variant="destructive"` has.
         *
         * It exists because moving an action out of a menu and onto the page
         * must not change how loud it is. A menu item said "this one is
         * different" in red text; a filled red button in a page header says
         * something else entirely — it becomes the loudest thing on the
         * screen, and it spends the destructive fill that design.md reserves
         * for the confirmation footer, where the irreversible click actually
         * happens. Two red fills, one of which does nothing but open a dialog,
         * is how a warning stops being read.
         */
        'destructive-tertiary':
          'border border-border bg-card text-destructive hover:bg-badge-negative',
        /** For dark surfaces (`invert-surface` cards and bands) only. */
        inverted: 'bg-primary-invert text-primary-invert-foreground hover:bg-primary-invert-hover',
      },
      size: {
        default: 'px-lg py-sm',
        touch: 'h-auto min-h-touch px-xl py-md',
        icon: 'size-control p-sm text-foreground hover:bg-muted',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
