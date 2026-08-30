'use client'

import { Avatar as AvatarPrimitive } from 'radix-ui'

import { avatarTone } from '@/components/ui/avatar-identity'
import { cn } from '@/lib/utils'

/**
 * Radix Avatar, themed to design.md §Components.
 *
 * Circular — the sanctioned exception to "pills are badges only", which is
 * about rectangles becoming pills, not identity marks.
 *
 * The fallback takes a `seed` — the person's account id — and wears the tone
 * derived from it, so a familiar face is findable in a list before the initials
 * are read. Seedless it stays neutral `muted`, which is right for a placeholder
 * standing in for nobody in particular. It never spends the *brand* hue: an
 * avatar identifies a person, and the identity set is deliberately disjoint
 * from both the brand and the semantic status hues (see avatar-identity.ts).
 *
 * 32px by default; callers pass `size-6` / `size-10` where the density differs.
 */
function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full object-cover', className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  seed,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> & {
  /** The person's account id. Omit for a placeholder standing in for nobody. */
  seed?: string
}) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-full text-caption font-medium uppercase select-none',
        seed === undefined ? 'bg-muted text-foreground' : avatarTone(seed),
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarFallback, AvatarImage }
