import { Camera } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { LandingImage } from '@/lib/domain/landing-images'

import { contact } from '../_content/landing'
import { InstagramIcon, TikTokIcon } from './social-icons'
import { SiteMedia } from './site-media'

/** Four slots for the feed most visitors will have arrived from. */
const feedSlots = [
  'Instagram photo 1',
  'Instagram photo 2',
  'Instagram photo 3',
  'Instagram photo 4',
]

/** A quarter of the container from `lg`, a quarter of the viewport from `md`, half below. */
const FEED_SIZES = '(min-width: 1024px) 268px, (min-width: 768px) 25vw, 50vw'

/**
 * Social proof without invented testimonials — there is nothing confirmed to
 * quote, so the strip points at the real accounts instead of fabricating one.
 *
 * The four tiles are photographs staff choose from the portal (capability F7),
 * in order; a tile with none keeps its placeholder.
 */
export function SocialStrip({ images }: { images: readonly (LandingImage | null)[] }) {
  return (
    <section
      aria-labelledby="social-heading"
      className="border-t border-divider bg-card px-xl py-3xl"
    >
      <div className="mx-auto w-full max-w-[1120px]">
        <p className="micro-label text-muted-foreground">{contact.instagramHandle}</p>
        <h2 id="social-heading" className="mt-md font-display text-display-md text-foreground">
          Follow along
        </h2>
        <p className="mt-md max-w-[52ch] text-body-md text-copy">
          Pool days, unit tours and what’s on — {contact.instagramHandle} on Instagram and TikTok.
        </p>

        <div className="mt-xl grid grid-cols-2 gap-lg md:grid-cols-4">
          {feedSlots.map((label, index) => (
            <SiteMedia
              key={label}
              image={images[index] ?? null}
              sizes={FEED_SIZES}
              label={label}
              aspect="square"
              icon={Camera}
            />
          ))}
        </div>

        <div className="mt-xl flex flex-col gap-sm sm:flex-row">
          <Button asChild variant="tertiary" className="w-full sm:w-auto">
            <a href={contact.instagramUrl} target="_blank" rel="noreferrer">
              <InstagramIcon />
              Instagram
            </a>
          </Button>
          <Button asChild variant="tertiary" className="w-full sm:w-auto">
            <a href={contact.tiktokUrl} target="_blank" rel="noreferrer">
              <TikTokIcon />
              TikTok
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
