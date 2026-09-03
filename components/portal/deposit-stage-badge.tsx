import type { StatusTone } from '@/components/portal/status-tone'
import { Badge } from '@/components/ui/badge'
import { DEPOSIT_STAGE_LABELS, type DepositStage } from '@/lib/domain/deposit'

/**
 * Where a deposit has got to, in the portal's status language (capability E1).
 *
 * The third badge module, after bookings and units, and the mapping lives here
 * for the reason theirs do: a second copy of this table is how a screen quietly
 * invents its own colour meaning.
 *
 * ── The mapping ───────────────────────────────────────────────────────────
 *
 * `in_house` takes **active** — the same brand pair `checked_in` and `occupied`
 * carry, because it is the same fact seen from a third side: the guest is in
 * the building and their money is with us.
 *
 * `awaiting_inspection` takes **warning**. It is the one stage that is somebody
 * else's move and can sit for days: the guest has gone, the unit is unlet, and
 * nothing happens until Housekeeping looks at it.
 *
 * `ready_for_release` takes **positive**, because it is the stage that can be
 * cleared right now by the person reading the screen.
 *
 * `released` takes **neutral**. It is the resting state of a finished deposit
 * and the archive fills with it — the `available` argument from the units
 * board, which is that colour is spent on the rows that need attention, not on
 * the ones that are done.
 *
 * **An amount owed is deliberately not a fifth stage.** A guest owing money is
 * a fact about a released deposit, not a further step in its life, and putting
 * it here would make the badge answer two questions at once. The ledger states
 * it in its own column and its own tile.
 */

const STAGE_TONES = {
  in_house: 'active',
  awaiting_inspection: 'warning',
  ready_for_release: 'positive',
  released: 'neutral',
} as const satisfies Record<DepositStage, StatusTone>

export type DepositStageTone = (typeof STAGE_TONES)[DepositStage]

/**
 * The tone a stage carries, for the places that show its colour at something
 * other than badge scale — the ledger's tile marks and filter dots.
 */
export function depositStageTone(stage: DepositStage): DepositStageTone {
  return STAGE_TONES[stage]
}

export function DepositStageBadge({ stage }: { stage: DepositStage }) {
  return <Badge tone={STAGE_TONES[stage]}>{DEPOSIT_STAGE_LABELS[stage]}</Badge>
}
