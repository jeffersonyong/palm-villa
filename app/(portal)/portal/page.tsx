import type { Metadata } from 'next'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Operations',
}

/**
 * Placeholder. The real overview is the payment verification queue plus today's
 * arrivals — the two screens that replace the spreadsheet (prd.md §5.2).
 */
const queue = [
  { reference: 'PV-4821', guest: 'Placeholder guest', state: 'Awaiting payment', tone: 'warning' },
  { reference: 'PV-4822', guest: 'Placeholder guest', state: 'Confirmed', tone: 'positive' },
  { reference: 'PV-4823', guest: 'Placeholder guest', state: 'Checked in', tone: 'active' },
  { reference: 'PV-4824', guest: 'Placeholder guest', state: 'Expired', tone: 'negative' },
] as const

export default function PortalOverviewPage() {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-lg">
        <div>
          <h1 className="font-display text-display-sm text-foreground">Overview</h1>
          <p className="mt-xs text-body-md text-copy">
            Placeholder screen. No data layer is wired — this route exists to prove the
            <span className="font-mono"> (portal) </span> group renders.
          </p>
        </div>
        <Button asChild>
          <Link href="/portal/bookings/new">New booking</Link>
        </Button>
      </header>

      {/* The portal's signature surface (design.md §Tables): hairline-bounded
          container, micro header strip on the gray fill, tight body-sm rows. */}
      <section aria-labelledby="queue-heading" className="mt-xl">
        <h2 id="queue-heading" className="text-display-xs text-foreground">
          Booking states
        </h2>
        <p className="mt-xs text-body-sm text-muted-foreground">
          The portal&rsquo;s status language: semantic badges, hairline rules, micro headers.
        </p>

        <div className="mt-lg overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th scope="col" className="px-lg py-sm micro-label text-muted-foreground">
                  Reference
                </th>
                <th scope="col" className="px-lg py-sm micro-label text-muted-foreground">
                  Guest
                </th>
                <th scope="col" className="px-lg py-sm micro-label text-muted-foreground">
                  State
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {queue.map((row) => (
                <tr key={row.reference} className="transition-colors hover:bg-muted/60">
                  <td className="px-lg py-md font-mono text-body-sm text-foreground tabular-nums">
                    {row.reference}
                  </td>
                  <td className="px-lg py-md text-body-sm text-copy">{row.guest}</td>
                  <td className="px-lg py-md">
                    <Badge tone={row.tone}>{row.state}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
