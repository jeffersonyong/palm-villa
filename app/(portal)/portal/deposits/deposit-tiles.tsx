import Link from 'next/link'

import { depositStageTone } from '@/components/portal/deposit-stage-badge'
import { Stat } from '@/components/portal/stat'
import { StatusDot } from '@/components/portal/status-dot'
import { Card } from '@/components/ui/card'
import { DEPOSIT_STAGE_LABELS } from '@/lib/domain/deposit'
import { formatCents, type Cents } from '@/lib/domain/money'
import { cn } from '@/lib/utils'

import type { LedgerView } from './ledger-view'

/**
 * What is held, and what is waiting on whom (capability E1).
 *
 * The strip answers prd.md §20's fifth success criterion in one line —
 * "what deposits do we currently hold" — and then breaks it into the three
 * things somebody might do about it. A stat strip per design.md: one tile per
 * figure, cards standing directly on the ground, no container around them.
 *
 * Each tile is the way *into* what it counts, the construction the units board
 * and the bookings register both use. Plain links, so this stays a server
 * component: the view is URL state, so choosing one is a navigation and nothing
 * more, and clicking the current tile clears it rather than reapplying it.
 *
 * **The first tile leads with a sum, and the others with counts.** "BND 1,400
 * held" is the liability, which is what E1 asks for and what an accountant
 * reads; "6 awaiting inspection" is a queue length, which is what an operator
 * reads. The figure each tile leads with is the one its reader came for.
 *
 * The owed tile is deliberately last and deliberately outside the stage
 * sequence — money a guest owes is a fact about a released deposit rather than
 * a further stage of one (see deposit-stage-badge.tsx), and it is the only tile
 * that can be empty and stay useful.
 */

interface DepositTilesProps {
  held: { count: number; amount: Cents }
  byStage: { in_house: number; awaiting_inspection: number; ready_for_release: number }
  owed: { count: number; amount: Cents }
  current: LedgerView
}

export function DepositTiles({ held, byStage, owed, current }: DepositTilesProps) {
  return (
    <div className="mt-md grid grid-cols-2 gap-md lg:grid-cols-5">
      <Tile
        view="held"
        current={current}
        label="Total held"
        value={`BND ${formatCents(held.amount)}`}
        hint={`${held.count} ${held.count === 1 ? 'deposit' : 'deposits'}`}
      />
      <Tile
        view="in_house"
        current={current}
        label={DEPOSIT_STAGE_LABELS.in_house}
        value={byStage.in_house}
        dot={<StatusDot tone={depositStageTone('in_house')} />}
      />
      <Tile
        view="awaiting_inspection"
        current={current}
        label={DEPOSIT_STAGE_LABELS.awaiting_inspection}
        value={byStage.awaiting_inspection}
        dot={<StatusDot tone={depositStageTone('awaiting_inspection')} />}
      />
      <Tile
        view="ready_for_release"
        current={current}
        label={DEPOSIT_STAGE_LABELS.ready_for_release}
        value={byStage.ready_for_release}
        dot={<StatusDot tone={depositStageTone('ready_for_release')} />}
      />
      <Tile
        view="owed"
        current={current}
        label="Owed by guests"
        value={`BND ${formatCents(owed.amount)}`}
        hint={`${owed.count} ${owed.count === 1 ? 'guest' : 'guests'}`}
      />
    </div>
  )
}

function Tile({
  view,
  current,
  label,
  value,
  hint,
  dot,
}: {
  view: LedgerView
  current: LedgerView
  label: string
  value: string | number
  hint?: string
  dot?: React.ReactNode
}) {
  const isCurrent = current === view
  // `held` is the default view, so choosing it is the absence of a param —
  // an unfiltered ledger and the "Total held" tile are one URL. Written
  // inline rather than through a const, which typed routes widens to `string`.
  const isDefault = isCurrent || view === 'held'

  return (
    <Link
      href={isDefault ? '/portal/deposits' : `/portal/deposits?show=${view}`}
      aria-current={isCurrent ? 'true' : undefined}
      aria-label={isCurrent ? `Showing ${label} — clear this view` : `Show ${label}`}
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
