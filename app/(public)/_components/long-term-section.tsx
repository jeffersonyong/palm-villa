import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { contact } from '../_content/landing'

/**
 * Long tenancies are negotiated per tenancy with no rate card (prd.md §8.3),
 * and full tenancy management is Phase 3 — so this is an enquiry, not a flow.
 * The single dark card is design.md's sanctioned promotional polarity flip.
 */
export function LongTermSection() {
  return (
    <section
      aria-labelledby="long-term-heading"
      id="long-term"
      className="scroll-mt-xl bg-card px-xl py-3xl"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <Card
          surface="dark"
          className="flex flex-col gap-xl lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <h2 id="long-term-heading" className="font-display text-display-md">
              Make Palm Villa home
            </h2>
            <p className="mt-lg max-w-[52ch] text-body-md opacity-80">
              Longer tenancies are arranged directly with us and priced per tenancy. Tell us what
              you need and we’ll come back with a proposal.
            </p>
          </div>
          <Button asChild className="w-full lg:w-auto">
            <a href={contact.whatsappUrl}>Start an enquiry</a>
          </Button>
        </Card>
      </div>
    </section>
  )
}
