import Link from 'next/link'

import { depositStageTone } from '@/components/portal/deposit-stage-badge'
import { Stat } from '@/components/portal/stat'
import { StatusDot } from '@/components/portal/status-dot'
import { Card } from '@/components/ui/card'
import { DEPOSIT_STAGE_LABELS } from '@/lib/domain/deposit'
import { formatCents, type Cents } from '@/lib/domain/money'
import { cn } from '@/lib/utils'

import { HELD_STAGES, type HeldStage, type LedgerView } from './ledger-view'

/**
 * What is held, and what is waiting on whom (capability E1).
 *
 * The strip answers prd.md §20's fifth success criterion in one line —
 * "what deposits do we currently hold" — and then breaks it into the three
 * things somebody might do about it. A stat strip per design.md: one tile per
 * figure, cards standing directly on the ground, no container around them.
 *
 * **The first tile is the answer, not a control.** "BND 1,400 held" is the
 * liability, which is what E1 asks for and what an accountant reads, and the
 * ledger below it *is* that figure broken into rows — so the tile has nothing
 * to narrow to and nothing to be "selected" as. It used to be a link that was
 * always current, which drew the strongest hairline on the screen around a
 * figure nobody had chosen. It is a plain card now, and the unfiltered ledger
 * is what you see when no tile is chosen.
 *
 * The four that follow are each the way *into* what they count, the
 * construction the units board and the bookings register both use. Plain
 * links, so this stays a server component. **The three stage tiles write the
 * same `stage` param the Stage chip in the filter row writes** — a tile is
 * "show me these", the chip is "these two, not that one" — and clicking the
 * current one clears it rather than reapplying it. **Owed writes `show`**,
 * because it reads a different set entirely (the archive, which pages in the
 * database — see `ledger-view.ts`). The archive's other view, everything
 * released, has no tile yet and is reached only by its address.
 *
 * The owed tile is deliberately last and deliberately outside the stage
 * sequence — money a guest owes is a fact about a released deposit rather than
 * a further stage of one (see deposit-stage-badge.tsx), and it is the only tile
 * that can be empty and stay useful.
 *
 * The counts are of everything held, not of the filtered list: five figures
 * that all moved when you clicked one of them would stop being the answer to
 * "what are we holding this morning".
 */

interface DepositTilesProps {
  held: { count: number; amount: Cents }
  byStage: Readonly<Record<HeldStage, number>>
  owed: { count: number; amount: Cents }
  /** The stages currently filtered on. Empty means every held stage. */
  selectedStages: readonly HeldStage[]
  /** Which set the screen is showing — held, or one of the archive views. */
  view: LedgerView
  /** The rest of the query — the stay window — carried through every tile. */
  otherParams: URLSearchParams
}

export function DepositTiles({
  held,
  byStage,
  owed,
  selectedStages,
  view,
  otherParams,
}: DepositTilesProps) {
  return (
    <div className="mt-xl grid grid-cols-2 gap-md lg:grid-cols-5">
      <Card className="h-full">
        <Stat
          size="sm"
          label="Total held"
          value={`BND ${formatCents(held.amount)}`}
          hint={`${held.count} ${held.count === 1 ? 'deposit' : 'deposits'}`}
        />
      </Card>

      {HELD_STAGES.map((stage) => {
        const isSelected = view === 'held' && selectedStages.includes(stage)
        const params = new URLSearchParams(otherParams)

        // Selecting one stage replaces the selection rather than adding to it.
        // The chip in the filter row is the plural control; a tile is "show me
        // these". Choosing a stage from an archive view returns to the held
        // set, because that is the only set a stage narrows.
        if (!isSelected) {
          params.set('stage', stage)
        }

        return (
          <Tile
            key={stage}
            query={params.toString()}
            isCurrent={isSelected}
            label={DEPOSIT_STAGE_LABELS[stage]}
            value={byStage[stage]}
            dot={<StatusDot tone={depositStageTone(stage)} />}
          />
        )
      })}

      <ArchiveTile
        target="owed"
        view={view}
        otherParams={otherParams}
        label="Owed by guests"
        value={`BND ${formatCents(owed.amount)}`}
        hint={`${owed.count} ${owed.count === 1 ? 'guest' : 'guests'}`}
      />
    </div>
  )
}

/**
 * A tile into the archive. Clicking the current one returns to the held set;
 * the stay window rides along either way, because "released, for stays in
 * August" and "held, for stays in August" are the same question asked of two
 * sets.
 */
function ArchiveTile({
  target,
  view,
  otherParams,
  ...stat
}: {
  target: Exclude<LedgerView, 'held'>
  view: LedgerView
  otherParams: URLSearchParams
  label: string
  value: string
  hint: string
}) {
  const isCurrent = view === target
  const params = new URLSearchParams(otherParams)

  if (!isCurrent) {
    params.set('show', target)
  }

  return <Tile query={params.toString()} isCurrent={isCurrent} {...stat} />
}

function Tile({
  query,
  isCurrent,
  label,
  value,
  hint,
  dot,
}: {
  query: string
  isCurrent: boolean
  label: string
  value: string | number
  hint?: string
  dot?: React.ReactNode
}) {
  return (
    <Link
      href={query ? `/portal/deposits?${query}` : '/portal/deposits'}
      aria-current={isCurrent ? 'true' : undefined}
      aria-label={isCurrent ? `Showing ${label} — clear this filter` : `Show ${label}`}
      className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card
        className={cn(
          'h-full card-interactive hover:border-foreground/20',
          isCurrent && 'border-foreground/30',
        )}
      >
        <Stat size="sm" label={label} value={value} hint={hint} dot={dot} />
      </Card>
    </Link>
  )
}
