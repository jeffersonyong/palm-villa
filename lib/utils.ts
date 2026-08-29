import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * design.md's scales, as tailwind-merge knows them.
 *
 * tailwind-merge only recognises Tailwind's stock scales, so every custom token
 * in globals.css was invisible to it — with two silent consequences:
 *
 *   `cn('text-body-sm', 'text-copy')` returned `text-copy` alone, because two
 *   `text-*` utilities look like a conflict when it cannot tell a size token
 *   from a colour one. Text fell back to the inherited size.
 *
 *   `cn('px-md', 'px-lg')` returned both, because neither looked like spacing.
 *   A caller's `className` override then won or lost by stylesheet order rather
 *   than by being passed last.
 *
 * Naming the scales here restores both behaviours. Keep in step with the
 * `--text-*` and `--spacing-*` tokens in app/globals.css.
 */
const TYPE_SCALE = [
  'display-xl',
  'display-lg',
  'display-md',
  'display-sm',
  'display-xs',
  'body-lg',
  'body-md',
  'body-md-strong',
  'body-sm',
  'body-sm-strong',
  'caption',
  'button-md',
] as const

/** The named steps plus the two control heights, which share the namespace. */
const SPACING_SCALE = [
  'xxs',
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  '3xl',
  'control',
  'touch',
] as const

const twMerge = extendTailwindMerge({
  extend: {
    theme: { spacing: [...SPACING_SCALE] },
    classGroups: { 'font-size': [{ text: [...TYPE_SCALE] }] },
  },
})

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
