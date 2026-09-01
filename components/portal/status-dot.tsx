import type { StatusTone } from '@/components/portal/status-tone'
import { cn } from '@/lib/utils'

/**
 * The status hue at icon scale: a 6px dot.
 *
 * design.md reserves the mid semantic hues for icons, and this is that use —
 * the badge's meaning compressed to a point, for the places a pill would
 * shout: the leading ornament on a filter option, the mark beside a stat
 * label whose figure counts bookings in that state. Status colour is meaning
 * rather than brand, so the dot is identical on the monochrome operations
 * surface, `active`'s aqua included.
 *
 * The tone comes from whichever badge module owns that status → tone mapping
 * — bookings have one, units have another; this file only knows how to draw a
 * tone small.
 */
const DOT_CLASSES: Record<StatusTone, string> = {
  positive: 'bg-positive',
  warning: 'bg-warning',
  negative: 'bg-negative',
  active: 'bg-brand',
  neutral: 'bg-mute',
}

interface StatusDotProps {
  tone: StatusTone
  className?: string
}

export function StatusDot({ tone, className }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASSES[tone], className)}
    />
  )
}
