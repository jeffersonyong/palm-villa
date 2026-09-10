import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The band that closes a public page — one of design.md's two sanctioned dark
 * moments, and the only construction that draws one.
 *
 * Extracted when the FAQ (capability A10) became the second page to end this
 * way. Copied it would have drifted: the ink ground, the display headline, the
 * 75% copy and the inverted-plus-outline pair of actions are four decisions
 * that have to agree across every page that closes, and design.md's own rule
 * about a radius token existing for a single component applies here — a
 * construction used twice is a component or it is two things slowly becoming
 * different.
 *
 * The content column is a prop because these sit under different pages: the
 * landing page runs at the full 1120px grid, and a page of prose ends at the
 * width its own text was set to, so the band's contents line up with the
 * column above rather than stepping out of it.
 */
export function ClosingBand({
  id,
  title,
  children,
  actions,
  width = 'wide',
}: {
  id: string
  title: string
  /** The paragraph under the headline. */
  children: ReactNode
  /** The buttons. A primary `variant="inverted"` and at most one beside it. */
  actions: ReactNode
  width?: 'wide' | 'reading'
}) {
  return (
    <section aria-labelledby={id} className="bg-invert-surface px-xl py-3xl text-invert-foreground">
      <div
        className={cn(
          'mx-auto flex w-full flex-col items-start gap-lg',
          width === 'wide' ? 'max-w-[1120px]' : 'max-w-[720px]',
        )}
      >
        <h2 id={id} className="font-display text-display-md sm:text-display-lg">
          {title}
        </h2>
        <p className="max-w-[52ch] text-body-lg opacity-75">{children}</p>
        <div className="flex w-full flex-col gap-sm sm:w-auto sm:flex-row">{actions}</div>
      </div>
    </section>
  )
}

/**
 * The outline action that stands beside the primary one on a dark ground.
 *
 * A `ghost` button cannot be seen on ink, so it borrows a hairline of the
 * inverted foreground. Here rather than in `components/ui/button.tsx` because
 * it is a use of the button on one surface, not a new kind of button.
 */
export const closingBandSecondaryClassName =
  'w-full border border-invert-foreground/25 text-invert-foreground hover:bg-invert-foreground/10 hover:text-invert-foreground sm:w-auto'
