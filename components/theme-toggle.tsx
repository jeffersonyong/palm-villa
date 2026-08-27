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
      // Nested radii: the pips are 8px per design.md's `button-icon` spec, and
      // they sit inside 1px of border plus 2px of padding — so the shell needs
      // ~11px to stay concentric. `rounded-lg` (12px) is the token that fits.
      // The 8px control rule still governs the buttons themselves.
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
              // sits behind (1px border + 2px padding), which lands on 9px.
              // Derived rather than hardcoded so it tracks the shell — the
              // named steps either side read visibly sharp (8px) or soft (12px).
              'inline-flex size-8 items-center justify-center transition-colors',
              'rounded-[calc(var(--radius-lg)_-_var(--spacing-xxs)_-_1px)]',
              'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              isSelected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
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
