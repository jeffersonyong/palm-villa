import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Status badge — the portal's core status language (design.md §Components).
 * Tones are semantic only: confirmed = positive, awaiting payment = warning,
 * expired / cancelled / no-show = negative, checked-in = the brand pair. Aqua
 * is never a success indicator.
 *
 * Small and quiet — a badge is metadata, not a button: caption scale (12px at
 * 500, from the token), tight padding, and the hue mixed into the surface at
 * 10% under its own deep text.
 *
 * **6px, not a capsule** (recut 2026-08-31). The badge was the last rectangle
 * in the product wearing a pill radius, on the reasoning that a fully round
 * end is unmistakably "not a button". It reads the other way round at this
 * size: a capsule is the shape of a small button, so the one component that
 * most needed to look inert looked most like a control. At 6px it is the same
 * geometry as everything else on the row and the tint is what carries the
 * meaning. Round things are now only the things that are round — avatars and
 * status dots.
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-xs rounded-md px-sm py-xxs text-caption',
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
