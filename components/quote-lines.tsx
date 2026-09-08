import type { BookingLine } from '@/lib/domain/lines'
import { formatCents, type Cents } from '@/lib/domain/money'

/**
 * The priced lines and their total (prd.md §8: the total is the sum of the
 * lines, never a stored price).
 *
 * Outside `components/portal/` because it is not the portal's. It was, until
 * the public booking flow needed to show a customer the same itemisation the
 * desk sees — which is capability A2, and the point of A2 is that the figure a
 * customer is quoted is the figure the desk would have quoted them. Two copies
 * of this markup would be two places for a rate to render differently.
 *
 * Surface-neutral by construction: every value here is a theme role, so it
 * takes the lagoon accent on the customer surface and stays monochrome on the
 * operations one without knowing which it is in. Figures are `tabular-nums`
 * throughout, and the total is `display-sm` — the one large number on either
 * screen.
 */
export function QuoteLines({ lines, total }: { lines: readonly BookingLine[]; total: Cents }) {
  return (
    <>
      <dl className="mt-lg divide-y divide-divider border-t border-divider">
        {lines.map((line) => (
          <div
            key={`${line.type}-${line.description}`}
            className="flex items-baseline justify-between gap-lg py-sm"
          >
            <dt className="text-body-sm text-muted-foreground">{line.description}</dt>
            <dd className="text-body-sm-strong text-foreground tabular-nums">
              {formatCents(line.amount)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex items-baseline justify-between gap-lg border-t border-divider pt-md">
        <span className="text-body-md-strong text-foreground">Total</span>
        <span className="text-display-sm text-foreground tabular-nums">
          BND {formatCents(total)}
        </span>
      </div>
    </>
  )
}
