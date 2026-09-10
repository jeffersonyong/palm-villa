import Link from 'next/link'
import type { Metadata } from 'next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getUnits } from '@/lib/db/inventory'
import { readPropertySettings } from '@/lib/db/settings'
import { contact } from '@/lib/domain/contact'

import { ClosingBand, closingBandSecondaryClassName } from '../_components/closing-band'
import { PendingDetail } from '../_components/pending-detail'
import { faqFactsFrom, faqTopics } from '../_content/faq'

export const metadata: Metadata = {
  title: 'Questions — Palm Villa',
  description:
    'Day passes, stays, paying, cancelling and arriving at Palm Villa — the questions guests ask most, answered.',
}

/**
 * The questions guests ask, answered without anybody picking up the phone
 * (capability A10).
 *
 * **Every figure is read here, not written into the copy.** Rates, times,
 * facilities and bank accounts have been settings rows since capability F3,
 * and a FAQ quoting last week's day-pass price beside a booking form quoting
 * this week's is the exact failure F3 exists to prevent — so `force-dynamic`,
 * for the same reason `/stay` has it.
 *
 * **No accordion.** Every answer stays in the page, which is most of the
 * point: a guest uses Ctrl-F, a search engine indexes the answer, and staff
 * send somebody a link to one of them over WhatsApp — which is what the
 * stable `id` on every entry is for. There is no disclosure component in this
 * system to reach for either, and a page of collapsed headings would hide the
 * one thing the page exists to show.
 *
 * The construction is design.md's own grammar: a topic heading stands on the
 * page ground at `display-xs`, the card beneath it holds the answers ruled
 * apart by hairlines, and the question inside is ink over the answer's copy —
 * the two-step ladder, not `micro`, because a question is content rather than
 * a label on content.
 */
export const dynamic = 'force-dynamic'

export default async function FaqPage() {
  const [settings, units] = await Promise.all([readPropertySettings(), getUnits()])

  // A type the building has no serviceable units of cannot be booked, so the
  // FAQ does not quote a rate for it — the same filter `/stay` applies to the
  // list it offers.
  const sellable = new Set(
    units.filter((unit) => unit.outOfServiceSince === null).map((unit) => unit.unitTypeId),
  )
  const facts = faqFactsFrom(settings, sellable)

  return (
    <>
      <section aria-labelledby="faq-heading" className="bg-card px-xl py-3xl">
        <div className="mx-auto w-full max-w-[720px]">
          <p className="micro-label text-accent-foreground">Before you book</p>
          <h1
            id="faq-heading"
            className="mt-md font-display text-display-md text-foreground sm:text-display-lg"
          >
            Questions
          </h1>
          <p className="mt-md max-w-[56ch] text-body-lg text-copy">
            What guests ask most often. If yours is not here, call or message us — the numbers are
            at the foot of every page.
          </p>

          {faqTopics.map((topic) => (
            <section
              key={topic.id}
              aria-labelledby={`topic-${topic.id}`}
              className="mt-2xl border-t border-divider pt-xl"
            >
              <h2 id={`topic-${topic.id}`} className="text-display-xs text-foreground">
                {topic.title}
              </h2>

              <Card className="mt-lg">
                <dl className="divide-y divide-divider">
                  {topic.entries.map((entry, index) => (
                    <div key={entry.id} className={index === 0 ? 'pb-lg' : 'py-lg last:pb-0'}>
                      <dt
                        id={entry.id}
                        className="scroll-mt-3xl text-body-md-strong text-foreground"
                      >
                        {entry.question}
                      </dt>
                      <dd className="mt-xs">
                        {entry.answer(facts).map((paragraph) => (
                          <p key={paragraph} className="mt-xs text-body-md text-copy first:mt-0">
                            {paragraph}
                          </p>
                        ))}

                        {entry.pending ? (
                          <p className="mt-sm flex flex-wrap gap-xs">
                            {entry.pending.map((label) => (
                              <PendingDetail key={label} label={label} />
                            ))}
                          </p>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </section>
          ))}
        </div>
      </section>

      {/* The page's one dark moment, and it earns it by being the end of a
          long read: somebody who got this far either wants to book or wants a
          person. */}
      <ClosingBand
        id="faq-cta-heading"
        title="Still not sure?"
        width="reading"
        actions={
          <>
            <Button asChild variant="inverted" className="w-full sm:w-auto">
              <a href={contact.whatsappUrl} target="_blank" rel="noreferrer">
                Message us on WhatsApp
              </a>
            </Button>
            <Button asChild variant="ghost" className={closingBandSecondaryClassName}>
              <Link href="/find-booking">Find your booking</Link>
            </Button>
          </>
        }
      >
        Message us and a person will answer. Or if you already have a booking, open it again.
      </ClosingBand>
    </>
  )
}
