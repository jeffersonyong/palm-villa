import Link from 'next/link'

import { Button } from '@/components/ui/button'

import { contact } from '../_content/landing'

/**
 * The page's one full-band polarity flip (design.md `hero-band-dark`, public
 * only and sparingly). Secondary text uses opacity on the inverted foreground
 * — `text-copy` would be wrong against ink.
 *
 * Copy describes the product as delivered, not the build: booking is live by
 * the time this page is public, so nothing here says "coming soon". The
 * interim message lives on the /day-pass and /stay stubs, which the real
 * flows replace wholesale.
 */
export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="bg-invert-surface px-xl py-3xl text-invert-foreground"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-lg">
        <h2 id="final-cta-heading" className="font-display text-display-md sm:text-display-lg">
          Ready when you are
        </h2>
        <p className="max-w-[52ch] text-body-lg opacity-80">
          Check what’s free, see the full price before you commit, and book in a few minutes. Or
          message us if you’d rather ask first.
        </p>
        <div className="flex w-full flex-col gap-sm sm:w-auto sm:flex-row">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/stay">Check availability</Link>
          </Button>
          <Button asChild variant="tertiary" className="w-full sm:w-auto">
            <a href={contact.whatsappUrl}>Message us on WhatsApp</a>
          </Button>
        </div>
      </div>
    </section>
  )
}
