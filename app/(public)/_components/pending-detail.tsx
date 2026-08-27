import { cn } from '@/lib/utils'

/**
 * A visible marker for a fact we cannot publish yet because it is an open [O]
 * item in prd.md — guest counts, bed setups, check-in times, age bands.
 *
 * Deliberately unmistakable as unfinished: a dashed neutral hairline and mute
 * caption text, using no semantic colour (those mean status, not "unknown").
 * Every instance must be removed before launch — `grep PendingDetail` finds
 * them, and each one maps to a question for the client.
 */

interface PendingDetailProps {
  /** The fact that is missing, e.g. "Bed setup". */
  label: string
  className?: string
}

export function PendingDetail({ label, className }: PendingDetailProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-xs rounded-sm border border-dashed border-border px-xs py-xxs text-caption whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      {label}
      <span aria-hidden>·</span>
      <span className="uppercase">to confirm</span>
    </span>
  )
}
