import { BedDouble, LockKeyhole } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Which book the money lands in, as a mark beside its label.
 *
 * The payment verification queue holds two kinds of row — money for the stay,
 * and a promised security deposit — and which one a row is decides what
 * confirming it does to the booking (prd.md §9.1). It was a gray caption under
 * the guest's name, then a neutral badge, then two coloured dots, and the dots
 * were the right register carrying the wrong load: blue at 263° and violet at
 * 293° differ by 30° of hue and **no lightness**, which at 6px is two blue-ish
 * points rather than two things.
 *
 * **So shape carries it and colour reinforces**, which is design.md's own rule
 * for every register that is not status — a status is a chip containing a
 * word, a person is a circle with two letters, a stream is a dot beside one.
 * The deposit's glyph is not invented here either: `LockKeyhole` is already
 * *the* deposit mark, standing over the figure table on the booking's Money
 * card and on the deposit's own screen (`deposit-figures.tsx`), chosen there
 * for exactly this reason after a purple ground was refused. Using it in the
 * queue makes one product rather than two conventions.
 *
 * **Still no tint, and that is still the rule rather than an omission.** The
 * row already spends `warning` on *Repriced* and `positive` on a verified
 * tick, and those two are what mean "look at this"; every row has a ledger, so
 * a chip here would put a filled rectangle on 100% of rows and leave the
 * exceptions nothing to stand out against. The register is mid-hue-only, so
 * there is no token to build a ledger badge from even if a later screen wants
 * one.
 *
 * Like `StatusDot` and `StreamDot`, the mark never appears without its label —
 * a bare glyph is a rebus, not metadata — and it is identical on every
 * surface, because what the money is for is a fact about the row rather than a
 * brand flourish the monochrome operations rule would forbid.
 */
export type Ledger = 'stay' | 'deposit'

const MARKS: Record<Ledger, { Glyph: typeof LockKeyhole; className: string }> = {
  stay: { Glyph: BedDouble, className: 'text-ledger-stay' },
  deposit: { Glyph: LockKeyhole, className: 'text-ledger-deposit' },
}

export function LedgerMark({ ledger, className }: { ledger: Ledger; className?: string }) {
  const { Glyph, className: tone } = MARKS[ledger]

  return <Glyph aria-hidden className={cn('size-3.5 shrink-0', tone, className)} />
}
