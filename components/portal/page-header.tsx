import { cn } from '@/lib/utils'

/**
 * The portal screen header: title, optional description, optional actions.
 *
 * This is the one place `font-display` appears in the portal. design.md allows
 * Fraunces on each portal screen's single `h1` and nowhere else on the surface,
 * so centralising it here makes the rule structural rather than remembered.
 *
 * `actions` is where a screen's one filled-primary button belongs — design.md
 * allows at most one per screen region.
 */

interface PageHeaderProps {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-lg', className)}>
      <div>
        <h1 className="font-display text-display-sm text-foreground">{title}</h1>
        {description ? <p className="mt-xs text-body-md text-copy">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-sm">{actions}</div> : null}
    </header>
  )
}
