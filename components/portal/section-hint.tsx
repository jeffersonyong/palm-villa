'use client'

import { Info } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The small "what is this" beside a section's title, for a section whose
 * behaviour is not obvious from its contents — how an accounting pack comes to
 * exist, say. A tooltip rather than a paragraph under the content, because the
 * explanation is read once and the section is read every day, and a standing
 * paragraph of fine print made the shorter sections mostly fine print.
 *
 * Focusable, so the text is reachable from the keyboard, but not a control:
 * there is nothing to toggle. Its own `TooltipProvider`, because a section
 * title has one of these at most and no neighbour to share a skip-delay with.
 */
export function SectionHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          aria-label={label}
          className="inline-flex rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <Info className="size-3.5" aria-hidden />
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px]">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
