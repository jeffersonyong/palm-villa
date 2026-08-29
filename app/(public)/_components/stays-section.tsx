import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { pricingCopy, unitTypes } from '../_content/landing'
import { MediaPlaceholder } from './media-placeholder'

/**
 * "From" rates only — the grid is a scannable teaser, so each card carries
 * just the photo, name, one line and the rate. The open [O] items that used to
 * render per card are policy questions rather than per-unit facts, and now sit
 * once on /stay (see `pendingStayDetails`).
 *
 * Cards link to /stay, which is also where the section CTA goes; in Phase 2
 * they become per-unit routes on the existing `slug`.
 */
export function StaysSection() {
  return (
    <section
      aria-labelledby="stays-heading"
      id="stays"
      className="scroll-mt-xl border-t border-divider bg-card px-xl py-3xl"
    >
      <div className="mx-auto w-full max-w-[1120px]">
        <p className="micro-label text-muted-foreground">Short stays</p>
        <h2
          id="stays-heading"
          className="mt-md max-w-[26ch] font-display text-display-md text-balance text-foreground sm:text-display-lg"
        >
          Four ways to stay, from BND 180 a night
        </h2>
        <p className="mt-md max-w-[52ch] text-body-lg text-copy">
          Whole units, from a two-bedroom apartment to a semi-detached house.
        </p>

        <ul className="mt-2xl grid gap-lg md:grid-cols-2 lg:grid-cols-4">
          {unitTypes.map((unit) => (
            <li key={unit.slug}>
              <Link
                href="/stay"
                aria-label={`${unit.name} — from BND ${unit.fromRateBnd} a night`}
                className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Card className="flex h-full card-interactive flex-col hover:border-foreground/20">
                  <MediaPlaceholder label={unit.imageLabel} />
                  <h3 className="mt-lg text-display-xs text-foreground">{unit.name}</h3>
                  <p className="mt-xs text-body-sm text-copy">{unit.description}</p>
                  {/* Pushed to the card foot so rates line up across the row
                      regardless of description length. */}
                  <p className="mt-auto pt-lg micro-label text-muted-foreground">from</p>
                  <p className="mt-xxs text-display-xs text-foreground tabular-nums">
                    BND {unit.fromRateBnd}
                    <span className="ml-xs text-caption font-normal text-muted-foreground">
                      / night
                    </span>
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-xl flex flex-wrap items-center gap-lg">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/stay">Book a short stay</Link>
          </Button>
        </div>

        <p className="mt-lg text-caption text-muted-foreground">{pricingCopy.stayFinePrint}</p>
      </div>
    </section>
  )
}
