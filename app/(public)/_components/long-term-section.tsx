import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { contact } from '../_content/landing'

/**
 * Long tenancies are negotiated per tenancy with no rate card (prd.md §8.3),
 * and full tenancy management is Phase 3 — so this is an enquiry, not a flow.
 * The single ink card is one of the page's two sanctioned dark moments
 * (design.md §Cards); the button takes the `inverted` variant — vivid aqua
 * on the ink ground.
 */
export function LongTermSection() {
  return (
    <section
      aria-labelledby="long-term-heading"
      id="long-term"
      className="scroll-mt-xl border-t border-divider bg-card px-xl py-3xl"
    >
      <div className="mx-auto w-full max-w-[1120px]">
        <Card
          surface="dark"
          className="flex flex-col gap-xl p-2xl lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <p className="micro-label text-invert-foreground/60">Long term</p>
            <h2 id="long-term-heading" className="mt-md font-display text-display-md">
              Make Palm Villa home
            </h2>
            <p className="mt-md max-w-[52ch] text-body-md opacity-75">
              Longer tenancies are arranged directly with us and priced per tenancy. Tell us what
              you need and we’ll come back with a proposal.
            </p>
          </div>
          <Button asChild variant="inverted" className="w-full lg:w-auto">
            <a href={contact.whatsappUrl}>Start an enquiry</a>
          </Button>
        </Card>
      </div>
    </section>
  )
}
