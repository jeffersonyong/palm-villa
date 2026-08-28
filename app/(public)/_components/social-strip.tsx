import { Camera } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { contact } from '../_content/landing'
import { MediaPlaceholder } from './media-placeholder'
import { InstagramIcon, TikTokIcon } from './social-icons'

/** Four slots for the feed most visitors will have arrived from. */
const feedSlots = [
  'Instagram photo 1',
  'Instagram photo 2',
  'Instagram photo 3',
  'Instagram photo 4',
]

/**
 * Social proof without invented testimonials — there is nothing confirmed to
 * quote, so the strip points at the real accounts instead of fabricating one.
 */
export function SocialStrip() {
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
          {feedSlots.map((label) => (
            <MediaPlaceholder key={label} label={label} aspect="square" icon={Camera} />
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
