'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  setThemePreference,
  subscribeToTheme,
  type ThemePreference,
} from '@/lib/theme'

const options: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

/**
 * Theme control. Two explicit states — light is the product default, so there
 * is no "follow the OS" option to choose.
 *
 * The preference lives in localStorage, which is external mutable state, so it
 * is read with `useSyncExternalStore` rather than copied into state. The server
 * renders `light`; the inline script in the root layout has already applied the
 * real theme by then, so the correction on hydration is invisible.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const preference = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  )

  return (
    <fieldset
      // The segmented control's construction, to the class (tabs.tsx): a
      // `muted` track at control height and the control radius, 2px of
      // padding, and a chip that answers "where am I" with a surface shift.
      // It used to be its own geometry — a 12px hairline shell around 9px
      // pips with an ink fill on the current one — which was a second
      // segmented control and, on the ink fill, the action colour saying
      // "current", both of which design.md rules out.
      className={cn(
        'inline-flex h-control items-stretch gap-xxs rounded-md bg-muted p-xxs',
        className,
      )}
    >
      <legend className="sr-only">Colour theme</legend>
      {options.map(({ value, label, Icon }) => {
        const isSelected = preference === value

        return (
          <button
            key={value}
            type="button"
            aria-pressed={isSelected}
            title={label}
            onClick={() => setThemePreference(value)}
            className={cn(
              // An explicit width, not `aspect-square`: a fieldset sizes its
              // box from the children's intrinsic width (two 16px icons), and
              // a width derived from the stretched height arrives after that
              // — so the pips grew to 32px inside a 38px track and the second
              // one hung outside it. 28px is the track's inner height on the
              // portal, so the chip is square there; it is stretched to the
              // track's full inner height so the 4px radius stays concentric
              // inside the 6px track.
              'inline-flex w-control-sm items-center justify-center rounded-sm transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-muted',
              // The current chip lifts out of the track on `shadow-lift`;
              // idle pips are mute and only their glyph answers hover.
              isSelected
                ? 'bg-tab-chip text-foreground shadow-lift'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon aria-hidden className="size-4" />
            <span className="sr-only">{label}</span>
          </button>
        )
      })}
    </fieldset>
  )
}
