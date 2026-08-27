import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { PendingDetail } from '../_components/pending-detail'
import { contact, pendingStayDetails, pricingCopy, unitTypes } from '../_content/landing'

export const metadata: Metadata = {
  title: 'Short stays — Palm Villa',
  description:
    'Whole apartments and a semi-detached house at Palm Villa, Bandar Seri Begawan, from BND 180 a night.',
}

/**
 * Stub route. The real availability and booking flow replaces this page at the
 * same URL. No occupancy or bed-configuration claims — both are open items.
 */
export default function StayPage() {
  return (
    <>
      <section aria-labelledby="stay-heading" className="bg-background px-xl py-3xl">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="text-body-sm-strong text-muted-foreground">Short stays</p>
          <h1
            id="stay-heading"
            className="mt-lg font-display text-display-md text-foreground sm:text-display-lg"
          >
            Stay at Palm Villa
          </h1>
          <p className="mt-lg max-w-[52ch] text-body-lg text-copy">
            Whole units from BND 180 a night.
          </p>
        </div>
      </section>

      <section aria-labelledby="stay-pricing-heading" className="bg-card px-xl py-3xl">
        <div className="mx-auto w-full max-w-[1200px]">
          <h2 id="stay-pricing-heading" className="text-display-xs text-foreground">
            Nightly rates
          </h2>

          <Card surface="summary" className="mt-lg max-w-[560px]">
            <dl>
              {unitTypes.map((unit, index) => (
                <div
                  key={unit.slug}
                  className={
                    index === 0
                      ? 'flex items-baseline justify-between gap-lg'
                      : 'mt-md flex items-baseline justify-between gap-lg border-t border-divider pt-md'
                  }
                >
                  <dt className="text-body-md text-copy">{unit.name}</dt>
                  <dd className="text-body-md-strong text-foreground">
                    from BND {unit.fromRateBnd} / night
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-lg text-caption text-muted-foreground">
              {pricingCopy.stayFinePrint} {pricingCopy.paymentMethods}
            </p>

            <ul className="mt-lg flex flex-wrap gap-xs border-t border-divider pt-lg">
              {pendingStayDetails.map((detail) => (
                <li key={detail}>
                  <PendingDetail label={detail} />
                </li>
              ))}
            </ul>
          </Card>

          <p className="mt-xl max-w-[52ch] text-body-md text-copy">
            Online booking opens soon — message us on WhatsApp and we’ll check what’s free for your
            dates.
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
