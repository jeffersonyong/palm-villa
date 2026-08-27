import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { facilities, pricingCopy } from '../_content/landing'
import { MediaPlaceholder } from './media-placeholder'

/**
 * Only the three facilities confirmed as day-pass inclusions appear here.
 * Gym, snooker and sauna are open [O] items and must not be advertised; the
 * BBQ area is confirmed excluded, which the fine print states plainly.
 */
export function DayPassSection() {
  return (
    <section
      aria-labelledby="day-pass-heading"
      id="day-pass"
      className="scroll-mt-xl bg-card px-xl py-3xl"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <h2
          id="day-pass-heading"
          className="max-w-[24ch] font-display text-display-md text-balance text-foreground sm:text-display-lg"
        >
          A full pool day, from BND 5
        </h2>
        <p className="mt-lg max-w-[52ch] text-body-lg text-copy">
          One pass covers everything below — pay per person, or take a family bundle.
        </p>

        <ul className="mt-2xl grid gap-lg md:grid-cols-2 lg:grid-cols-3">
          {facilities.map((facility) => (
            <li key={facility.name}>
              <Card
                surface={facility.featured ? 'aqua' : 'muted'}
                className="h-full card-interactive"
              >
                <MediaPlaceholder label={facility.imageLabel} icon={facility.icon} />
                <h3 className="mt-lg text-display-xs text-foreground">{facility.name}</h3>
                <p className="mt-sm text-body-md text-copy">{facility.description}</p>
              </Card>
            </li>
          ))}
        </ul>

        <Card
          surface="summary"
          className="mt-xl flex flex-col gap-lg sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-display-xs text-foreground">Day pass</p>
            <p className="mt-xs text-body-md-strong text-accent-foreground">
              {pricingCopy.dayPassLine}
            </p>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/day-pass">Plan a pool day</Link>
          </Button>
        </Card>

        <p className="mt-lg text-caption text-muted-foreground">{pricingCopy.dayPassFinePrint}</p>
      </div>
    </section>
  )
}
