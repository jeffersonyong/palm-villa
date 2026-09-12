import type { LucideIcon } from 'lucide-react'
import Image from 'next/image'

import type { LandingImage } from '@/lib/domain/landing-images'
import { cn } from '@/lib/utils'

import { MediaPlaceholder, mediaAspectClasses, type MediaAspect } from './media-placeholder'

/**
 * A place on the landing page that shows a photograph staff chose, or its
 * placeholder until they choose one (capability F7).
 *
 * The same wrapper either way, so adding or removing a photograph never moves
 * the layout. Resized and re-encoded by Next's image optimiser from the public
 * bucket, which is why `sizes` is required: without it the browser assumes the
 * slot is the whole viewport and fetches a picture four times too wide.
 */
interface SiteMediaProps {
  image: LandingImage | null
  /** The widths this slot is laid out at, as a `sizes` attribute. */
  sizes: string
  /** What the placeholder says while there is no photograph. */
  label: string
  aspect?: MediaAspect
  icon?: LucideIcon
  className?: string
  /**
   * The hero only. Loaded eagerly at high priority, because on a wide screen it
   * is the largest thing a visitor sees first; everything below it loads lazily.
   */
  priority?: boolean
}

export function SiteMedia({
  image,
  sizes,
  label,
  aspect = 'photo',
  icon,
  className,
  priority = false,
}: SiteMediaProps) {
  if (!image) {
    return <MediaPlaceholder label={label} aspect={aspect} icon={icon} className={className} />
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border border-divider bg-muted',
        mediaAspectClasses[aspect],
        className,
      )}
    >
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={sizes}
        className="object-cover"
        // Inline, because a class name built at runtime is one Tailwind never sees.
        style={{ objectPosition: image.objectPosition }}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
      />
    </div>
  )
}
