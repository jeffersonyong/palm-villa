import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { facilities, pricingCopy } from '../_content/landing'
import { MediaPlaceholder } from './media-placeholder'

/**
 * Only the three facilities confirmed as day-pass inclusions appear here.
 * Gym, snooker and sauna are open [O] items and must not be advertised; the
 * BBQ area is confirmed excluded, which the fine print states plainly.
 *
 * The grid is three identical hairline cards — colour is not a card treatment
 * (design.md §Cards). The aqua moment here is the price line's text.
 */
export function DayPassSection() {
  return (
    <section
      aria-labelledby="day-pass-heading"
      id="day-pass"
      className="scroll-mt-xl border-t border-divider bg-card px-xl py-3xl"
    >
      <div className="mx-auto w-full max-w-[1120px]">
        <p className="micro-label text-muted-foreground">Day pass</p>
        <h2
          id="day-pass-heading"
          className="mt-md max-w-[24ch] font-display text-display-md text-balance text-foreground sm:text-display-lg"
        >
          A full pool day, from BND 5
        </h2>
        <p className="mt-md max-w-[52ch] text-body-lg text-copy">
          One pass covers everything below — pay per person, or take a family bundle.
        </p>

        <ul className="mt-2xl grid gap-lg md:grid-cols-2 lg:grid-cols-3">
          {facilities.map((facility) => (
            <li key={facility.name}>
              <Card className="h-full card-interactive hover:shadow-card">
                <MediaPlaceholder label={facility.imageLabel} icon={facility.icon} />
                <h3 className="mt-lg text-display-xs text-foreground">{facility.name}</h3>
                <p className="mt-xs text-body-md text-copy">{facility.description}</p>
              </Card>
            </li>
          ))}
        </ul>

        <Card
          surface="raised"
          className="mt-lg flex flex-col gap-lg sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-display-xs text-foreground">Day pass</p>
            <p className="mt-xs text-body-sm-strong text-accent-foreground">
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
