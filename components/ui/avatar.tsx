'use client'

import { Avatar as AvatarPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * Radix Avatar, themed to design.md §Components.
 *
 * Circular — the sanctioned exception to "pills are badges only", which is
 * about rectangles becoming pills, not identity marks. The fallback is neutral
 * `muted` with initials at caption scale: an avatar identifies a person, so it
 * never spends the brand hue.
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
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-muted text-caption font-medium text-foreground uppercase select-none',
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarFallback, AvatarImage }
