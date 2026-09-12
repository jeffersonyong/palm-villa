import { LockKeyhole } from 'lucide-react'

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
 * the ledger's `LockKeyhole` glyph beside the micro-label *Security deposit*,
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
        <LockKeyhole aria-hidden className="size-3.5 shrink-0" />
        Security deposit
      </span>
      {badge}
    </div>
  )
}

interface DepositFigureTableProps {
  figures: Deposit['figures']
  release: Deposit['release']
  /**
   * What the deposit is short of the booking's quote, where it is short.
   *
   * Drawn as two rows — the quote it is measured against, and the gap — which
   * is the one place this table shows a figure that is not on the deposit's
   * own row. Without the quote beside it "Short BND 50.00" is a number with
   * nothing to check it against.
   */
  shortfall?: Cents
  /** What the booking quotes. Only read when `shortfall` is non-zero. */
  quoted?: Cents
  /**
   * The deposit was kept when its booking closed without a stay (prd.md §9.5),
   * or null. When present the last line is what was kept, and nothing is
   * forecast as going back.
   */
  forfeiture?: Deposit['forfeiture']
  /** Heads the inset — the mark, where the section title does not already carry it. */
  header?: React.ReactNode
  /** Follows the figures: captions, the link through to the record. */
  children?: React.ReactNode
  className?: string
}

/**
 * What is held, what stands against it, and what the difference is called.
 *
 * The last line's label is the one place the two screens agree to say five
 * different things: before release it is a forecast (*To return*, *Would be
 * owed*), after it a fact (*Returned*, *Owed by guest*) — or, for a deposit
 * the guest forfeited, *Kept*, with no charges taken off it because there is
 * nothing to give back. "Less charges" is drawn only when there are any — a
 * zero on a money screen invites a second look, and there is nothing there to
 * find. *Quoted* and *Short* follow the same rule, and appear together or not
 * at all.
 *
 * The shortfall rows carry no tint. A gap in a deposit is a status, and the
 * portal says status in a badge at badge scale — this table stays the
 * monochrome arithmetic it has always been.
 */
export function DepositFigureTable({
  figures,
  release,
  shortfall = 0,
  quoted = 0,
  forfeiture = null,
  header,
  children,
  className,
}: DepositFigureTableProps) {
  const owes = figures.owed > 0
  const short = shortfall > 0

  return (
    <Card surface="inset" className={className}>
      {header ? <div className="mb-sm">{header}</div> : null}
      <div className="grid gap-xs">
        {short ? <FigureRow label="Quoted" value={quoted} /> : null}
        <FigureRow label="Held" value={figures.amount} />
        {short ? <FigureRow label="Short" value={shortfall} /> : null}
        {figures.chargesTotal > 0 && !forfeiture ? (
          <FigureRow label="Less charges" value={figures.chargesTotal} />
        ) : null}
        <div className="mt-xs border-t border-divider pt-xs">
          {forfeiture ? (
            <FigureRow label="Kept" value={forfeiture.amount} strong />
          ) : (
            <FigureRow
              label={
                release
                  ? owes
                    ? 'Owed by guest'
                    : 'Returned'
                  : owes
                    ? 'Would be owed'
                    : 'To return'
              }
              value={owes ? figures.owed : figures.releasable}
              strong
            />
          )}
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
