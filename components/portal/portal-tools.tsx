'use client'

import { Bell } from 'lucide-react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The tools that belong to no single screen, on the right of the panel header
 * opposite the breadcrumb.
 *
 * One provider for the pair, so a tooltip added here later shares the
 * skip-delay rather than re-paying the open delay.
 */
export function PortalTools() {
  return (
    <TooltipProvider>
      <div className="flex shrink-0 items-center gap-xxs">
        {/* No notification backend exists. A disabled control says so honestly;
            the span carries the tooltip because a disabled button fires no
            pointer events, and keeps it keyboard-reachable. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel"
            >
              <button
                type="button"
                disabled
                aria-label="Notifications (not available yet)"
                className="pointer-events-none inline-flex size-control items-center justify-center rounded-md text-muted-foreground opacity-50"
              >
                <Bell aria-hidden className="size-4" />
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Notifications — not built yet</TooltipContent>
        </Tooltip>

        <ThemeToggle />
      </div>
    </TooltipProvider>
  )
}
