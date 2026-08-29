import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The "nothing here" surface: a raised card with centred copy.
 *
 * Sits where a table would, so it keeps the table's container treatment and the
 * screen does not collapse when a filter matches nothing. Any `action` is a
 * tertiary or ghost button — an empty state is not where a screen spends its
 * one filled-primary button.
 */

interface EmptyStateProps {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <Card className={cn('px-lg py-2xl text-center', className)}>
      <p className="text-display-xs text-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-sm max-w-[52ch] text-body-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-lg flex justify-center">{action}</div> : null}
    </Card>
  )
}
