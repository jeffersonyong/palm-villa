import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { PendingDetail } from '../_components/pending-detail'
import { contact, pendingDayPassDetails, pricingCopy } from '../_content/landing'

export const metadata: Metadata = {
  title: 'Day pass — Palm Villa',
  description:
    'One day pass for the swimming pool, water park and indoor children’s playground at Palm Villa.',
}

const priceRows = [
  { label: 'Per person', value: 'from BND 5' },
  { label: 'Family bundles', value: 'from BND 20' },
]

/**
 * Stub route. The real day-pass booking flow replaces this page at the same
 * URL, so every CTA pointing here keeps working.
 */
export default function DayPassPage() {
  return (
    <>
      <section aria-labelledby="day-pass-heading" className="bg-card px-xl py-3xl">
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="micro-label text-accent-foreground">Facility day pass</p>
          <h1
            id="day-pass-heading"
            className="mt-md font-display text-display-md text-foreground sm:text-display-lg"
          >
            Day passes at Palm Villa
          </h1>
          <p className="mt-md max-w-[52ch] text-body-lg text-copy">
            One pass for the swimming pool, water park and indoor children’s playground.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="day-pass-pricing-heading"
        className="border-t border-divider bg-card px-xl py-3xl"
      >
        <div className="mx-auto w-full max-w-[1120px]">
          <h2 id="day-pass-pricing-heading" className="text-display-xs text-foreground">
            What it costs
          </h2>

          <Card className="mt-lg max-w-[560px]">
            <dl>
              {priceRows.map((row, index) => (
                <div
                  key={row.label}
                  className={
                    index === 0
                      ? 'flex items-baseline justify-between gap-lg'
                      : 'mt-md flex items-baseline justify-between gap-lg border-t border-divider pt-md'
                  }
                >
                  <dt className="text-body-md text-copy">{row.label}</dt>
                  <dd className="text-body-md-strong text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-lg text-caption text-muted-foreground">
              {pricingCopy.dayPassFinePrint} {pricingCopy.paymentMethods}
            </p>

            <ul className="mt-lg flex flex-wrap gap-xs border-t border-divider pt-lg">
              {pendingDayPassDetails.map((detail) => (
                <li key={detail}>
                  <PendingDetail label={detail} />
                </li>
              ))}
            </ul>
          </Card>

          <p className="mt-xl max-w-[52ch] text-body-md text-copy">
            Online booking opens soon — message us on WhatsApp and we’ll book you in today.
          </p>

          <div className="mt-lg flex flex-wrap gap-sm">
            <Button asChild>
              <a href={contact.whatsappUrl}>Message us on WhatsApp</a>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Back to overview</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
