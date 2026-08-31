import { cn } from '@/lib/utils'

/**
 * The portal screen header: title, optional description, optional actions.
 *
 * The title is **Geist**, like everything else on this surface. It wore
 * Fraunces until 2026-08-31, on the reasoning that the brand voice should
 * carry through the booking journey rather than stop at the portal door; the
 * screens said otherwise. At `display-sm` the face is too small to show the
 * character it is chosen for, a booking reference set in a serif here and in
 * mono in the table below reads as two different tokens, and a display face is
 * the same order of brand gesture as the lagoon hue the operations surfaces
 * already refuse. Fraunces is now the customer surface's alone (design.md
 * §Typography).
 *
 * Two slots sit under the title and they are not interchangeable. `meta` runs
 * **on the title's own line** and carries what identifies *this record* — a
 * booking's status chip and who it belongs to — because that is the line a
 * reader is already looking at, and a record's identity is one thought with
 * its reference, not a sentence underneath it. `description` stays on the line
 * below and explains *the screen*: what a list holds, what a form is for. A
 * screen has at most one of each, and a list screen's description is never
 * record metadata.
 *
 * `actions` is where a screen's one filled-primary button belongs — design.md
 * allows at most one per screen region.
 */

interface PageHeaderProps {
  title: string
  /** Identity of the record on the title's line: status chip, who, contact. */
  meta?: React.ReactNode
  /** A sentence about the screen, on the line below. */
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, meta, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-lg', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-sm">
          <h1 className="text-display-sm text-foreground">{title}</h1>
          {meta}
        </div>
        {/* The description is *about* the screen rather than content on it, so
            it takes the secondary step — the same side of the two-step ladder
            as a field label or a table header (design.md §Typography). */}
        {description ? (
          <p className="mt-xs text-body-md text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-sm">{actions}</div> : null}
    </header>
  )
}
