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
      // Nested radii: the pips sit inside 1px of border plus 2px of padding,
      // so the shell takes the card radius (10px) and the pips derive theirs
      // from it below to stay concentric.
      className={cn('flex items-center gap-xxs rounded-lg border border-divider p-xxs', className)}
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
              // Concentric with the shell: its radius less the inset the pip
              // sits behind (1px border + 2px padding). Derived rather than
              // hardcoded so it tracks the shell.
              'inline-flex size-7 items-center justify-center transition-colors',
              'rounded-[calc(var(--radius-lg)_-_var(--spacing-xxs)_-_1px)]',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              // The selected chip keeps its fill on hover — the muted hover
              // belongs to the unselected pips only, otherwise hovering the
              // current mode makes its colour vanish into the ground.
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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
