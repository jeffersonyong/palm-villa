import Link from 'next/link'

import { Button } from '@/components/ui/button'

import { contact } from '../_content/landing'
import { ClosingBand, closingBandSecondaryClassName } from './closing-band'

/**
 * The landing page's closing band — the second of its two sanctioned dark
 * moments (design.md §Layout). The construction itself lives in
 * `ClosingBand`, which the FAQ also ends with; this is the landing page's
 * words and actions.
 *
 * Copy describes the product as delivered, not the build: booking is live by
 * the time this page is public, so nothing here says "coming soon".
 */
export function FinalCta() {
  return (
    <ClosingBand id="final-cta-heading" title="Ready when you are" actions={<FinalCtaActions />}>
      Check what’s free, see the full price before you commit, and book in a few minutes. Or message
      us if you’d rather ask first.
    </ClosingBand>
  )
}

function FinalCtaActions() {
  return (
    <>
      <Button asChild variant="inverted" className="w-full sm:w-auto">
        <Link href="/stay">Check availability</Link>
      </Button>
      <Button asChild variant="ghost" className={closingBandSecondaryClassName}>
        <a href={contact.whatsappUrl}>Message us on WhatsApp</a>
      </Button>
    </>
  )
}
