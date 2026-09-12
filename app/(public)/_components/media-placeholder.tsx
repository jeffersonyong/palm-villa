import { Image as ImageIcon, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A labelled image slot standing in for a photograph nobody has uploaded yet.
 *
 * The aspect-ratio wrapper is the layout contract. A place with a photograph
 * renders through `SiteMedia` inside the same wrapper, so nothing shifts when
 * staff add one or take one down (capability F7) — the box is reserved before
 * any image loads.
 */

export type MediaAspect = 'video' | 'photo' | 'square' | 'portrait'

export const mediaAspectClasses: Record<MediaAspect, string> = {
  video: 'aspect-video',
  photo: 'aspect-[4/3]',
  square: 'aspect-square',
  portrait: 'aspect-[3/4]',
}

interface MediaPlaceholderProps {
  /** Names the asset that belongs here, e.g. "Pool photo". */
  label: string
  aspect?: MediaAspect
  icon?: LucideIcon
  className?: string
}

export function MediaPlaceholder({
  label,
  aspect = 'photo',
  icon: Icon = ImageIcon,
  className,
}: MediaPlaceholderProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-md border border-divider bg-muted',
        mediaAspectClasses[aspect],
        className,
      )}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-sm">
        <Icon className="size-6 text-muted-foreground" />
        <span className="text-caption text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}
