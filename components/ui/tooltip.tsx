'use client'

import { Tooltip as TooltipPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * Radix Tooltip, themed to design.md §Elevation level 4.
 *
 * It is an overlay like every other overlay — an edge and `shadow-overlay`
 * doing the work of saying it floats — at the menu radius, because it opens out
 * of the thing it explains exactly as a menu opens out of its control, and the
 * surface 16px would read as a pill at caption height.
 *
 * Its fill is the overlay shell muted (`tooltip-surface`): a hint is the
 * quietest thing on the page that floats, so it sits off the card white rather
 * than at it. That fill is far enough down the ladder that the standard
 * hairline disappears into it, so the edge is `tooltip-border` — the seam that
 * comes with the surface.
 *
 * It used to be the polarity flip, ink-on-white. Two things were wrong with
 * that. A black chip is the loudest object on a quiet gray screen, and what it
 * carries is a hint — the least urgent text on the page. And the tooltip in
 * this app is rarely a one-word label: a section hint is two sentences and a
 * status legend is a definition list of the *real* badges, which are built for
 * the card ground and read as a string of lights on ink. Putting the tooltip
 * on the surface its content was designed for fixes both.
 *
 * `TooltipProvider` is mounted once per surface rather than folded into each
 * `Tooltip`: the skip-delay state that lets a pointer move between neighbouring
 * tooltips without re-paying the open delay lives in the provider's context, so
 * a provider per tooltip would isolate it and make every one of a toolbar's
 * icons wait the full delay again. Radix errors clearly if a `Tooltip` is used
 * without one in scope.
 */
function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-fit max-w-[240px] rounded-lg border border-tooltip-border bg-tooltip-surface px-sm py-xs text-caption text-balance text-foreground shadow-overlay',
          'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
          'motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
