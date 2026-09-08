import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The itemised price beside a booking form (design.md §Components — Portal
 * forms): a sticky card carrying `micro` eyebrow, the stay in one line, the
 * priced lines in `tabular-nums`, the total at `display-sm`, and the screen's
 * one primary button.
 *
 * Shared by the walk-in and amendment forms, which are deliberately siblings
 * rather than one form (see amend-form.tsx) — but their summary cards had
 * become byte-for-byte copies, and a copy is where a token change stops. The
 * shell and the lines live here; what each form says under the total (a
 * deposit notice, a "was BND …" diff) is its own, passed as children.
 *
 * Sticks inside the panel's scroll container, so it clears the panel header
 * rather than the viewport top — header height plus the gap a card would have
 * taken on its own (design.md §Components — Portal panel header).
 */
export function QuoteSummary({
  eyebrow,
  headline,
  detail,
  className,
  children,
}: {
  eyebrow: string
  headline: React.ReactNode
  detail: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'lg:sticky lg:top-[calc(var(--spacing-panel-header)+var(--spacing-lg))]',
        className,
      )}
    >
      <Card>
        <p className="micro-label text-muted-foreground">{eyebrow}</p>
        <p className="mt-sm text-body-md-strong text-foreground">{headline}</p>
        <p className="mt-xxs text-body-sm text-muted-foreground">{detail}</p>
        {children}
      </Card>
    </div>
  )
}
