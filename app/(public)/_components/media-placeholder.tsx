import { Image as ImageIcon, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A labelled image slot standing in for photography we do not have yet.
 *
 * The aspect-ratio wrapper is the layout contract: when real photos arrive,
 * add `src`/`alt` props and render `next/image` with `fill` inside this same
 * wrapper. Consumers do not change and nothing shifts, because the box is
 * reserved before any image loads.
 */

type MediaAspect = 'video' | 'photo' | 'square' | 'portrait'

const aspectClasses: Record<MediaAspect, string> = {
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
        aspectClasses[aspect],
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
