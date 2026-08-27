import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * shadcn/ui Button, re-skinned to design.md:
 * - canonical radius is `rounded-md` (8px) — soft, not a pill
 * - one primary per screen region; primary is the only aqua on the screen
 * - 40px standard height; the `touch` size carries the field surface's 48px
 */
const buttonVariants = cva(
  'inline-flex h-control shrink-0 items-center justify-center gap-sm rounded-md text-button-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-active',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground',
        tertiary: 'border border-border bg-card text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-negative-deep',
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
