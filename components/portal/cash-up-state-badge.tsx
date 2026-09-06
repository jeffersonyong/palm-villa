import type { StatusTone } from '@/components/portal/status-tone'
import { Badge } from '@/components/ui/badge'
import { CASH_UP_STATE_LABELS, type CashUpState } from '@/lib/domain/reports/cash-up'

/**
 * Where a day's cash stands (capability E4).
 *
 * The fourth badge module, and the mapping lives here for the reason the other
 * three keep theirs: a second copy is how a screen quietly invents its own
 * colour meaning.
 *
 * ── The mapping ───────────────────────────────────────────────────────────
 *
 * A cash-up state is an **outcome** rather than a stage of a workflow, which
 * is what makes the semantic set right for it: a day is settled, or it is a
 * question for somebody.
 *
 * `balanced` takes **positive** — the day agrees and nobody need look again.
 *
 * `unbanked` takes **warning**. It is the day's ordinary end state until
 * somebody walks to the bank, so it is not wrong; it is outstanding, which is
 * exactly `awaiting_inspection`'s reading on a deposit.
 *
 * `short` and `over` both take **negative**, and deliberately the same tone.
 * Neither is worse than the other: a day where less reached the bank than the
 * desk took, and a day where more did, are the same class of problem — the
 * figures do not agree and somebody has to say why. Splitting them by colour
 * would imply one is recoverable and the other is not.
 *
 * `nothing` takes **neutral**. A day the desk took no cash is not an event,
 * and colour is spent on the rows that need attention (the units board's
 * `available` argument).
 */

const STATE_TONES = {
  nothing: 'neutral',
  unbanked: 'warning',
  balanced: 'positive',
  short: 'negative',
  over: 'negative',
} as const satisfies Record<CashUpState, StatusTone>

export type CashUpStateTone = (typeof STATE_TONES)[CashUpState]

/** The tone a state carries, for anything showing it at other than badge scale. */
export function cashUpStateTone(state: CashUpState): CashUpStateTone {
  return STATE_TONES[state]
}

export function CashUpStateBadge({ state }: { state: CashUpState }) {
  return <Badge tone={STATE_TONES[state]}>{CASH_UP_STATE_LABELS[state]}</Badge>
}
