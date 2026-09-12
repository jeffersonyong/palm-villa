'use client'

import { FOCUS_LABELS, SITE_IMAGE_FOCUS, type SiteImageFocus } from '@/lib/domain/site-image'
import { cn } from '@/lib/utils'

/**
 * Which part of the photograph stays in view (capability F7).
 *
 * Nine radio buttons in a three-by-three grid, one per position. Native radios
 * rather than a custom widget, so the arrow keys move through them and a screen
 * reader announces "Top left, radio, 1 of 9" without any of it being built
 * here. The preview beside it re-crops as the choice changes, which is the
 * explanation the grid itself cannot give.
 */
export function FocusPicker({
  name,
  value,
  onChange,
  disabled,
}: {
  /** The radio group's name. Unique on the screen. */
  name: string
  value: SiteImageFocus
  onChange: (focus: SiteImageFocus) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="grid gap-sm" disabled={disabled}>
      <legend className="text-body-sm-strong text-foreground">Keep in view</legend>
      <p className="max-w-[24ch] text-caption text-muted-foreground">
        The part that must stay visible when the site crops the photo.
      </p>
      <div className="grid w-fit grid-cols-3 gap-xxs">
        {SITE_IMAGE_FOCUS.map((focus) => (
          <label
            key={focus}
            className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-border bg-card transition-colors hover:bg-muted has-[:checked]:border-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              name={name}
              value={focus}
              checked={value === focus}
              onChange={() => onChange(focus)}
              aria-label={FOCUS_LABELS[focus]}
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full',
                value === focus ? 'bg-foreground' : 'bg-muted-foreground/40',
              )}
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}
