import { cva, type VariantProps } from 'class-variance-authority'
import { Info } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A notice: something the reader needs to know before acting.
 *
 * The gray inset panel was carrying two different jobs — grouped figures, and
 * sentences that change what someone does next. Only the second is a notice,
 * and it now has the `info` blue so it is findable on a screen of hairlines
 * and gray. Colour here is semantic, not decoration: a notice is a status the
 * screen is reporting about itself (design.md §Color — status pairs).
 *
 * It is not a `Card`. Cards take no tint — "colour is not a card treatment" —
 * and a notice is a different object, with a mark so it reads as a notice
 * rather than a coloured paragraph. The mark takes `currentColor` rather than
 * a shade of its own: it is the sentence's punctuation, not a second element
 * competing with it.
 *
 * **Radius follows the nesting, because the radius scale is about scale, not
 * about the component** (design.md §Geometry — 6px controls, 10px cards). A
 * notice inside a card or a dialog is an inset panel: 10px inside a 10px card
 * reads as a mis-drawn edge, and inside a 14px overlay the geometry stops
 * being concentric. A notice standing on the page ground is card-scale — it
 * sits in the slot a table or a form would fill, beside real cards, and at
 * 6px it reads as a control that grew. Padding moves with it for the same
 * reason. Nested is the default because most notices are.
 *
 * The mark is `aria-hidden`: it repeats what the sentence already says. A
 * notice that must interrupt a screen reader is an `alert`, which this is not
 * — those are the `role="alert"` error lines beside the field that failed.
 */
const noticeVariants = cva(
  'flex items-start gap-sm bg-notice-info text-body-sm text-notice-info-foreground',
  {
    variants: {
      placement: {
        nested: 'rounded-md p-md',
        page: 'rounded-lg p-lg',
      },
    },
    defaultVariants: {
      placement: 'nested',
    },
  },
)

export function Notice({
  className,
  placement,
  children,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof noticeVariants>) {
  return (
    <div className={cn(noticeVariants({ placement, className }))} {...props}>
      <Info aria-hidden className="mt-px size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
