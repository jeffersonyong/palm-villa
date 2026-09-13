import { Button } from '@/components/ui/button'
import type { LandingImage } from '@/lib/domain/landing-images'

import { SiteMedia } from './site-media'

/** Half the 1120px container beside the headline from `lg`; the full width below it. */
const HERO_SIZES = '(min-width: 1024px) 544px, 100vw'

/**
 * The one place `display-xl` appears on any surface (design.md §Typography).
 * White ground, one lagoon CTA; the eyebrow is the section's brand text moment.
 */
export function Hero({ image }: { image: LandingImage | null }) {
  return (
    <section aria-labelledby="hero-heading" className="bg-card px-xl py-3xl">
      <div className="mx-auto grid w-full max-w-[1120px] gap-2xl lg:grid-cols-2 lg:items-center">
        <div>
          <p className="micro-label text-accent-foreground">Palm Villa · Bandar Seri Begawan</p>
          <h1
            id="hero-heading"
            className="mt-lg max-w-[16ch] font-display text-display-md text-balance text-foreground sm:text-display-lg lg:text-display-xl"
          >
            Swim today, stay tonight.
          </h1>
          <p className="mt-lg max-w-[52ch] text-body-lg text-copy">
            Day passes for the swimming pool, water park and indoor children’s playground — and
            apartment stays from BND 180 a night. One place, in Bandar Seri Begawan.
          </p>
          <div className="mt-xl flex flex-wrap gap-sm">
            <Button asChild>
              <a href="#day-pass">See day pass prices</a>
            </Button>
            <Button asChild variant="tertiary">
              <a href="#stays">Browse stays</a>
            </Button>
          </div>
        </div>

        <SiteMedia
          image={image}
          sizes={HERO_SIZES}
          label="Pool photo"
          aspect="photo"
          className="rounded-lg"
          priority
        />
      </div>
    </section>
  )
}
