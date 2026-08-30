import { cn } from '@/lib/utils'

/**
 * A stat readout: `micro` label over the figure (design.md §Portal forms).
 *
 * Figures always set `tabular-nums` — a column of numbers that shifts as digits
 * change reads as noise. `size` picks the figure scale: `xs` (17px) is the
 * default for a stat strip, `sm` (22px) for the one figure that leads a screen.
 * Nothing above `display-sm` exists in the portal.
 *
 * `dot` leads the label — a `StatusDot` where the figure counts records in one
 * state, so the strip reads in the same language as the badges and filter
 * options naming that state. A figure that is a capacity or a sum rather than
 * a state count takes no dot.
 */

interface StatProps {
  label: string
  value: React.ReactNode
  /** Denominator or qualifier, e.g. "of 52 units". */
  hint?: string
  /** A `StatusDot`, when the figure counts records in that state. */
  dot?: React.ReactNode
  size?: 'xs' | 'sm'
  className?: string
}

export function Stat({ label, value, hint, dot, size = 'xs', className }: StatProps) {
  return (
    <div className={cn(className)}>
      <p className="flex items-center gap-xs micro-label text-muted-foreground">
        {dot}
        {label}
      </p>
      <p
        className={cn(
          'mt-xs text-foreground tabular-nums',
          size === 'sm' ? 'text-display-sm' : 'text-display-xs',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-xxs text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
