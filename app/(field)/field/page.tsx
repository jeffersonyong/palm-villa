import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Field',
}

/**
 * Placeholder. The real screen is today's arrivals, loaded first, searchable by
 * vehicle registration and name (architecture.md §7).
 */
const arrivals = [
  { reference: 'PV-4821', unit: 'Unit A-03', window: '14:00 onwards', state: 'Confirmed' },
  { reference: 'PV-4822', unit: 'Unit B-11', window: '15:30 onwards', state: 'Confirmed' },
] as const

export default function FieldTodayPage() {
  return (
    <>
      <h1 className="text-display-xs text-foreground">Today&rsquo;s arrivals</h1>
      <p className="mt-xs text-body-sm text-muted-foreground">
        Placeholder screen. No data layer is wired — this route exists to prove the (field) group
        renders at touch scale.
      </p>

      <ul className="mt-xl space-y-lg">
        {arrivals.map((arrival) => (
          <li key={arrival.reference} className="rounded-lg border border-divider bg-card p-xl">
            <div className="flex items-start justify-between gap-md">
              <div>
                <p className="text-body-md-strong text-foreground">{arrival.reference}</p>
                <p className="mt-xxs text-body-sm text-copy">{arrival.unit}</p>
                <p className="mt-xxs text-caption text-muted-foreground">{arrival.window}</p>
              </div>
              <Badge tone="positive">{arrival.state}</Badge>
            </div>
            <Button className="mt-lg w-full" size="touch">
              Check in
            </Button>
          </li>
        ))}
      </ul>
    </>
  )
}
