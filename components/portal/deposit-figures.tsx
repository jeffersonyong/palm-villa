import { Landmark } from 'lucide-react'

import { Card } from '@/components/ui/card'
import type { Deposit } from '@/lib/db/deposits'
import { formatCents, type Cents } from '@/lib/domain/money'
import { cn } from '@/lib/utils'

/**
 * The security deposit's mark, and the one figure table it is read from.
 *
 * ── Why a mark and not a colour ───────────────────────────────────────────
 *
 * A booking screen holds four gray insets — the identity document, the
 * transfer slip, the accounting pack and this — and they look alike because
 * they are alike: each is a card's sub-panel. Asked how staff would tell the
 * deposit from the rest, the first answer was a purple ground, and design.md
 * §Color — roles records why that was refused: a tint that is always there is
 * decoration, purple is already worn by an identity hue and two streams, and
 * the stage chip on the inset would have sat as one tint inside another.
 *
 * So the deposit is known by its **form**, the way every other register is —
 * a status is a chip, a stream is a dot, a person is a circle. A deposit is
 * the ledger's `Landmark` glyph beside the micro-label *Security deposit*,
 * standing over the same three-line table wherever it appears: on the Money
 * card, where `DepositMark` heads the inset, and on the deposit screen, where
 * the section title carries the mark and the table sits under it. The chip
 * keeps the colour, because the chip answers the one question colour is for.
 *
 * ── Why one table ─────────────────────────────────────────────────────────
 *
 * The two screens used to word the same figure differently — "Security
 * deposit" on the booking, "Held" on the deposit — and only one of them showed
 * what would go back before anything had been released. A table recognised
 * before it is read has to be the same table.
 */

/** The glyph and label, at the size of the labelling voice. */
export function DepositMark({
  badge,
  className,
}: {
  /** Sits opposite the label — the stage chip, where the screen does not already carry it. */
  badge?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-lg', className)}>
      <span className="flex items-center gap-xs micro-label text-muted-foreground">
        <Landmark aria-hidden className="size-3.5 shrink-0" />
        Security deposit
      </span>
      {badge}
    </div>
  )
}

interface DepositFigureTableProps {
  figures: Deposit['figures']
  release: Deposit['release']
  /** Heads the inset — the mark, where the section title does not already carry it. */
  header?: React.ReactNode
  /** Follows the figures: captions, the link through to the record. */
  children?: React.ReactNode
  className?: string
}

/**
 * What is held, what stands against it, and what the difference is called.
 *
 * The last line's label is the one place the two screens agree to say four
 * different things: before release it is a forecast (*To return*, *Would be
 * owed*), after it a fact (*Returned*, *Owed by guest*). "Less charges" is
 * drawn only when there are any — a zero on a money screen invites a second
 * look, and there is nothing there to find.
 */
export function DepositFigureTable({
  figures,
  release,
  header,
  children,
  className,
}: DepositFigureTableProps) {
  const owes = figures.owed > 0

  return (
    <Card surface="inset" className={className}>
      {header ? <div className="mb-sm">{header}</div> : null}
      <div className="grid gap-xs">
        <FigureRow label="Held" value={figures.amount} />
        {figures.chargesTotal > 0 ? (
          <FigureRow label="Less charges" value={figures.chargesTotal} />
        ) : null}
        <div className="mt-xs border-t border-divider pt-xs">
          <FigureRow
            label={
              release ? (owes ? 'Owed by guest' : 'Returned') : owes ? 'Would be owed' : 'To return'
            }
            value={owes ? figures.owed : figures.releasable}
            strong
          />
        </div>
      </div>
      {children}
    </Card>
  )
}

/** One line of the table: a label in mute, a figure in ink, both on the baseline. */
export function FigureRow({
  label,
  value,
  strong,
}: {
  label: string
  value: Cents
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-lg">
      <span
        className={
          strong ? 'text-body-sm-strong text-foreground' : 'text-body-sm text-muted-foreground'
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? 'text-body-sm-strong text-foreground tabular-nums'
            : 'text-body-sm text-foreground tabular-nums'
        }
      >
        BND {formatCents(value)}
      </span>
    </div>
  )
}
