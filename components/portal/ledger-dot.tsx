import { cn } from '@/lib/utils'

/**
 * Which book the money lands in, at icon scale: a 6px dot.
 *
 * The payment verification queue holds two kinds of row — money for the stay,
 * and a promised security deposit — and which one a row is decides what
 * confirming it does to the booking (prd.md §9.1). That was a gray caption
 * under the guest's name, then a neutral badge, and neither was scannable: a
 * reader had to read the word.
 *
 * **A dot rather than a coloured chip, and that is the whole design.** The row
 * already spends colour on status — `Repriced` in warning, a tick in
 * positive — and those are the two marks that mean "look at this". Every row
 * has a ledger, so tinting it would put a filled rectangle on 100% of rows and
 * leave the exceptions nowhere to stand out; design.md records exactly that
 * cost where it explains why an `available` unit is neutral rather than green.
 * So this is the fourth colour register, built like `StreamDot`'s: **mid hues
 * and no tints**, which means there is no token to build a ledger badge from
 * even if a later screen wanted one. The rule is expressed as a missing token
 * rather than as a convention somebody has to remember.
 *
 * Like `StatusDot` and `StreamDot`, it never appears without its label — a
 * bare dot is a mystery, not metadata — and it is identical on every surface,
 * because what the money is for is a fact about the row rather than a brand
 * flourish the monochrome operations rule would forbid.
 */
export type Ledger = 'stay' | 'deposit'

const DOT_CLASSES: Record<Ledger, string> = {
  stay: 'bg-ledger-stay',
  deposit: 'bg-ledger-deposit',
}

export function LedgerDot({ ledger, className }: { ledger: Ledger; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASSES[ledger], className)}
    />
  )
}
