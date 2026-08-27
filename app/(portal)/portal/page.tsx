import type { Metadata } from 'next'

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
          <h1 className="text-display-sm text-foreground">Overview</h1>
          <p className="mt-xs text-body-md text-copy">
            Placeholder screen. No data layer is wired — this route exists to prove the
            <span className="font-mono"> (portal) </span> group renders.
          </p>
        </div>
        <Button>New booking</Button>
      </header>

      <section
        aria-labelledby="queue-heading"
        className="mt-xl rounded-lg border border-divider bg-card p-xl"
      >
        <h2 id="queue-heading" className="text-display-xs text-foreground">
          Booking states
        </h2>
        <p className="mt-xs text-body-sm text-muted-foreground">
          The portal&rsquo;s status language: semantic badges, hairline dividers, caption headers.
        </p>

        <table className="mt-lg w-full border-collapse text-left">
          <thead>
            <tr className="bg-muted">
              <th scope="col" className="px-md py-sm text-caption text-muted-foreground uppercase">
                Reference
              </th>
              <th scope="col" className="px-md py-sm text-caption text-muted-foreground uppercase">
                Guest
              </th>
              <th scope="col" className="px-md py-sm text-caption text-muted-foreground uppercase">
                State
              </th>
            </tr>
          </thead>
          <tbody>
            {queue.map((row) => (
              <tr key={row.reference} className="border-b border-divider">
                <td className="px-md py-md text-body-sm-strong text-foreground">{row.reference}</td>
                <td className="px-md py-md text-body-sm text-copy">{row.guest}</td>
                <td className="px-md py-md">
                  <Badge tone={row.tone}>{row.state}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
