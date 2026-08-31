import { cva, type VariantProps } from 'class-variance-authority'
import { CheckCircle2, CircleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A callout: an outcome the reader needs to see — a write that was refused, a
 * password that was set (design.md §Components — Callouts).
 *
 * It is the `Notice` construction with a status hue: the badge chip's
 * tint-under-deep-text at panel scale, a mark so it reads as a message rather
 * than a coloured paragraph, and the same placement rule for its radius. Where
 * a notice says *what to know before acting*, a callout says *what happened*
 * — which is why it takes an outcome hue and a notice never does.
 *
 * Built because six screens had hand-rolled it, on two different paddings.
 * Tones are the outcome pair only: `negative` for a refusal, `positive` for a
 * confirmation the reader must act on (a one-time password). A transient
 * confirmation is a toast, not a callout.
 *
 * The mark is `aria-hidden` and the component sets no ARIA role of its own:
 * a callout that stands in for a form's rejection passes `role="alert"`, a
 * callout that states the screen's condition ("choose a unit to see the
 * price") does not. Interrupting a screen reader is the caller's call.
 */
const calloutVariants = cva('flex items-start gap-sm text-body-sm', {
  variants: {
    tone: {
      negative: 'bg-badge-negative text-badge-negative-foreground',
      positive: 'bg-badge-positive text-badge-positive-foreground',
    },
    placement: {
      nested: 'rounded-md p-md',
      page: 'rounded-lg p-card',
    },
  },
  defaultVariants: {
    tone: 'negative',
    placement: 'nested',
  },
})

const MARK = {
  negative: CircleAlert,
  positive: CheckCircle2,
} as const

export function Callout({
  className,
  tone,
  placement,
  children,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof calloutVariants>) {
  const Mark = MARK[tone ?? 'negative']

  return (
    <div
      data-slot="callout"
      className={cn(calloutVariants({ tone, placement, className }))}
      {...props}
    >
      <Mark aria-hidden className="mt-px size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
