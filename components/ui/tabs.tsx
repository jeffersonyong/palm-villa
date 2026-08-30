'use client'

import { Tabs as TabsPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * Radix Tabs as a segmented control, per design.md §Components.
 *
 * Not underline tabs: "where am I" is never carried by colour in this system —
 * it is a quiet surface shift, the same principle as the sidebar's muted active
 * chip. Here the muted track supplies the ground, so the active segment lifts
 * out of it as a white card chip. The 4px trigger radius is concentric inside
 * the 6px track with its 2px padding — which is also why triggers stretch to
 * the track's full height: a chip that floats with track showing above and
 * below it breaks the concentric geometry and reads as misaligned.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col', className)} {...props} />
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex h-control w-fit items-stretch gap-xxs rounded-md bg-muted p-xxs',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-sm rounded-sm border border-transparent px-md text-body-sm whitespace-nowrap text-copy transition-colors outline-none',
        'hover:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-muted',
        'data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:font-medium data-[state=active]:text-foreground',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('mt-lg outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
