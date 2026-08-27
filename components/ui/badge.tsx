import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Status badge — the portal's core status language (design.md §Components).
 * Tones are semantic only: confirmed = positive, awaiting payment = warning,
 * expired / cancelled / no-show = negative, checked-in = aqua-pale on deep aqua.
 * Aqua is never a success indicator.
 *
 * Badges are the one place pills survive: at chip scale a pill reads as soft
 * rather than bubbly, so it stays while buttons and cards do not.
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-xs rounded-pill px-sm py-xxs text-body-sm-strong',
  {
    variants: {
      tone: {
        positive: 'bg-badge-positive text-badge-positive-foreground',
        warning: 'bg-badge-warning text-badge-warning-foreground',
        negative: 'bg-badge-negative text-badge-negative-foreground',
        active: 'bg-badge-active text-badge-active-foreground',
        neutral: 'bg-badge-neutral text-badge-neutral-foreground',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
)

function Badge({
  className,
  tone,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'span'

  return <Comp data-slot="badge" className={cn(badgeVariants({ tone, className }))} {...props} />
}

export { Badge, badgeVariants }
