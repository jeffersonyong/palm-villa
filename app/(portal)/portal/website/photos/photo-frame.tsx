import Image from 'next/image'

import {
  objectPositionFor,
  type SiteImageAspect,
  type SiteImageFocus,
} from '@/lib/domain/site-image'
import { cn } from '@/lib/utils'

/**
 * A photograph at the shape the website crops it to (capability F7).
 *
 * Every preview on the screen — the card, and both dialogs — is drawn through
 * this, at the slot's own aspect and framing, so what staff see here is what a
 * visitor sees there. A photograph is content, not chrome, so it is the one
 * full-colour thing on this otherwise monochrome surface.
 */

export const PHOTO_ASPECT_CLASSES: Readonly<Record<SiteImageAspect, string>> = {
  photo: 'aspect-[4/3]',
  square: 'aspect-square',
}

interface PhotoFrameProps {
  src: string
  alt: string
  aspect: SiteImageAspect
  focus: SiteImageFocus
  sizes: string
  /**
   * A photograph still in the browser — a blob URL the optimiser cannot fetch —
   * is drawn as it is.
   */
  unoptimized?: boolean
  className?: string
}

export function PhotoFrame({
  src,
  alt,
  aspect,
  focus,
  sizes,
  unoptimized,
  className,
}: PhotoFrameProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border border-divider bg-muted',
        PHOTO_ASPECT_CLASSES[aspect],
        className,
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        unoptimized={unoptimized}
        className="object-cover"
        style={{ objectPosition: objectPositionFor(focus) }}
      />
    </div>
  )
}
