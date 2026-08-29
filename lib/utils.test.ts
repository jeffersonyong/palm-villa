import { describe, expect, test } from 'vitest'

import { cn } from './utils'

/**
 * These guard a failure mode that is invisible in review: tailwind-merge
 * dropping a type token because it reads as a colour. Nothing throws, nothing
 * looks wrong in the source — the text just renders at the inherited size.
 */
describe('cn', () => {
  test('keeps a type token alongside a colour token', () => {
    expect(cn('text-body-sm', 'text-copy')).toBe('text-body-sm text-copy')
    expect(cn('text-display-xs', 'text-foreground')).toBe('text-display-xs text-foreground')
    expect(cn('text-caption', 'text-muted-foreground')).toBe('text-caption text-muted-foreground')
  })

  test('keeps the pairing regardless of order', () => {
    expect(cn('text-copy', 'text-body-sm')).toBe('text-copy text-body-sm')
  })

  test('still resolves a genuine size conflict last-wins', () => {
    expect(cn('text-body-sm', 'text-body-md')).toBe('text-body-md')
    expect(cn('text-display-sm', 'text-display-xs')).toBe('text-display-xs')
  })

  test('still resolves a genuine colour conflict last-wins', () => {
    expect(cn('text-copy', 'text-foreground')).toBe('text-foreground')
  })

  test('lets a project type token override a stock Tailwind size', () => {
    expect(cn('text-sm', 'text-body-sm')).toBe('text-body-sm')
  })

  test('resolves the named spacing scale, so a className override wins', () => {
    expect(cn('px-md', 'px-lg')).toBe('px-lg')
    expect(cn('p-md', 'p-lg')).toBe('p-lg')
    expect(cn('gap-sm', 'gap-lg')).toBe('gap-lg')
    expect(cn('mt-xs', 'mt-lg')).toBe('mt-lg')
  })

  test('treats the control heights as part of that scale', () => {
    expect(cn('h-control', 'h-touch')).toBe('h-touch')
    expect(cn('size-control', 'size-8')).toBe('size-8')
  })

  test('merges other utilities as usual', () => {
    expect(cn('rounded-md', undefined, 'rounded-lg')).toBe('rounded-lg')
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
})
