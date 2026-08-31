import { cn } from '@/lib/utils'

/**
 * The "nothing here" surface: a recessed `muted` panel with centred copy.
 *
 * Recessed, not raised — absence drawn as a card put an outline around
 * nothing and made the emptiest screens the most built-up. This is the
 * segmented control's track without its chip: a faint slot, no hairline,
 * holding the table's place so the screen does not collapse when a filter
 * matches nothing. Content that exists is drawn (white card, hairline);
 * a slot waiting for content is recessed. Card scale, because it stands in a
 * card's slot on the page ground (design.md §Empty states).
 *
 * Any `action` is a tertiary or ghost button — an empty state is not where a
 * screen spends its one filled-primary button.
 *
 * A filtered-empty state's escape is worded the same on every screen — a
 * tertiary "Clear filters" linking to the bare route, never a per-screen
 * variant naming the field it clears. See design.md, Components.
 */

interface EmptyStateProps {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('rounded-lg bg-muted px-lg py-2xl text-center', className)}>
      <p className="text-display-xs text-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-sm max-w-[52ch] text-body-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-lg flex justify-center">{action}</div> : null}
    </div>
  )
}
