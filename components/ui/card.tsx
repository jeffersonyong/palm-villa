import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Card surfaces per design.md — one card idiom: card white, 12px, hairline.
 * Cards carry no shadow; the page's whole shadow budget is the 4% lift under
 * the one chip saying "where am I" (§Elevation). What separates a card from
 * the ground is the tone step between them, and the hairline drawn on it.
 *
 * - `content`: hairline card, the default everywhere.
 * - `inset`: the faint gray panel (fine print, deposit notes, grouped stats).
 * - `dark`: the public site's promotional polarity flip, at most twice a page.
 *
 * There are no tinted feature cards — colour is not a card treatment.
 *
 * Interiors pad `card` (14px) rather than `lg` (16px): the card gap is 12px,
 * and at 16px the space inside a card and the space between two of them were
 * near enough to equal that a row of cards read as one field of evenly-spaced
 * content. 14 inside against 12 between is tight enough to bind a card's
 * contents together and still separate it from its neighbour.
 *
 * **A gray panel takes its radius and padding from where it sits**, exactly as
 * a `Notice` does, because the radius scale measures *scale* rather than
 * component: 6px is control-sized, 12px card-sized. Nested inside a card it is
 * an inset at 6px — 12px inside a 12px card reads as a mis-drawn edge — and
 * standing on the page ground it is card-scale, because it sits in the slot a
 * card would fill, beside real cards, where 6px reads as a control that grew.
 * `nested` is the default because most gray panels are.
 */
const cardVariants = cva('text-body-md', {
  variants: {
    surface: {
      content: 'rounded-lg border border-border bg-card p-card text-card-foreground',
      inset: 'rounded-md bg-muted p-md text-foreground',
      dark: 'rounded-lg bg-invert-surface p-xl text-invert-foreground',
    },
    placement: {
      nested: '',
      page: '',
    },
  },
  // Only the gray panel changes with placement: a hairline card is already
  // card-scale wherever it sits, and the dark card is a public-page moment.
  compoundVariants: [{ surface: 'inset', placement: 'page', class: 'rounded-lg p-card' }],
  defaultVariants: {
    surface: 'content',
    placement: 'nested',
  },
})

function Card({
  className,
  surface,
  placement,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ surface, placement, className }))}
      {...props}
    />
  )
}

export { Card, cardVariants }
