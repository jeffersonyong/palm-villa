'use client'

import { Info } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * A key to the pills in a column (design.md §Components — status legend).
 *
 * A status column is the one place in the portal where the screen uses a
 * vocabulary the reader has to already know. A badge says *Over-banked* and
 * gives no way to find out what that means, how many other states exist, or
 * whether the one on screen is the good one — the label is the whole
 * explanation, and it is two words long. Every list screen has this problem
 * and none of them solved it.
 *
 * So the column header carries the key: every state the column can show, in
 * the order they are defined, each with one line saying what it means. Not a
 * `SectionHint` — that explains how a section is *counted*, in prose, and a
 * legend is a lookup rather than an argument. Shown as the real badges, at the
 * size and tone they have in the rows, so the thing being looked up is the
 * thing on screen.
 *
 * It lists **every** state, not the ones present in the current filter: half
 * the question a reader has is what the other outcomes are, and a key that
 * changes with the rows cannot answer it.
 *
 * Definitions are one line and say what the state *is*, never why the rule is
 * that way — the same discipline the section hints follow.
 */

export interface StatusLegendItem {
  /** The badge exactly as the rows draw it. */
  badge: React.ReactNode
  /** One line. What the state means, not why. */
  description: string
}

interface StatusLegendProps {
  /** The trigger's accessible name, e.g. "What the states mean". */
  label: string
  items: readonly StatusLegendItem[]
}

export function StatusLegend({ label, items }: StatusLegendProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          aria-label={label}
          className="inline-flex rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <Info className="size-3.5" aria-hidden />
        </TooltipTrigger>
        <TooltipContent className="max-w-[320px]">
          {/* A definition list, because that is what this is. The badge is the
              term and the sentence is the definition, so a screen reader
              announces the pair rather than a run of loose text. */}
          <dl className="grid gap-sm">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-[auto_1fr] items-start gap-sm">
                <dt>{item.badge}</dt>
                {/* The badge's own vertical padding, paid again on the text, so
                    the chip's label and the first line of its definition sit on
                    one line. Without it the badge is a taller box top-aligned
                    against a line of text, and every pair in the list reads as
                    slightly fallen. `text-pretty` because the tooltip balances
                    its text — right for a one-line hint, wrong here, where it
                    ragged four-line definitions into a narrow column with the
                    panel's width going unused beside them. */}
                <dd className="py-xxs text-caption text-pretty">{item.description}</dd>
              </div>
            ))}
          </dl>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
