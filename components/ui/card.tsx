import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Card surfaces per design.md. Surface contrast is the elevation system —
 * shadows belong to overlays only, so no card variant carries one.
 */
const cardVariants = cva('rounded-lg p-xl text-body-md', {
  variants: {
    surface: {
      content: 'bg-card text-card-foreground',
      muted: 'bg-muted text-foreground',
      aqua: 'bg-accent text-accent-foreground',
      dark: 'bg-invert-surface text-invert-foreground',
      /** The signature interactive card: white with a neutral hairline. */
      summary: 'border border-border bg-card text-card-foreground',
    },
  },
  defaultVariants: {
    surface: 'content',
  },
})

function Card({
  className,
  surface,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ surface, className }))} {...props} />
}

export { Card, cardVariants }
