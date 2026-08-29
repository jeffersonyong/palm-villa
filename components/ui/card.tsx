import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Card surfaces per design.md v1.0 — one card idiom: white, 10px, hairline.
 * `shadow-card` is separation on the near-white ground, never emphasis.
 *
 * - `content`: hairline card, the default everywhere.
 * - `raised`: hairline + `shadow-card` — a whisper of lift for tables, key
 *   cards and the public booking summary.
 * - `inset`: the faint gray panel *inside* a card (fine print, deposit notes,
 *   grouped stats) at the control radius.
 * - `dark`: the public site's promotional polarity flip, at most twice a page.
 *
 * There are no tinted feature cards — colour is not a card treatment.
 */
const cardVariants = cva('text-body-md', {
  variants: {
    surface: {
      content: 'rounded-lg border border-border bg-card p-lg text-card-foreground',
      raised: 'rounded-lg border border-border bg-card p-lg text-card-foreground shadow-card',
      inset: 'rounded-md bg-muted p-md text-foreground',
      dark: 'rounded-lg bg-invert-surface p-xl text-invert-foreground',
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
