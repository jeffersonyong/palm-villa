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
 * The state describes the **balance carried forward**, not a day's own two
 * figures, so the three tones answer "where is the money" rather than "did
 * this day agree".
 *
 * `clear` takes **positive** — nothing is outstanding and nobody need look
 * again.
 *
 * `holding` takes **neutral**, and that is the deliberate choice here. Cash in
 * the safe is the ordinary state of a business that banks twice a week, not a
 * fault; giving it `warning` would put an amber chip on most rows of most
 * weeks, which is how a warning stops being read. It is the units board's
 * `available` argument — colour is spent on the rows that need attention.
 *
 * `over_banked` takes **negative**. It is the one state arithmetic can call
 * wrong: more has reached the bank than was ever recorded as taken, so either
 * a payment went unrecorded or a banking was entered twice. Unlike the others
 * it cannot be resolved by waiting.
 */

const STATE_TONES = {
  clear: 'positive',
  holding: 'neutral',
  over_banked: 'negative',
} as const satisfies Record<CashUpState, StatusTone>

export type CashUpStateTone = (typeof STATE_TONES)[CashUpState]

/** The tone a state carries, for anything showing it at other than badge scale. */
export function cashUpStateTone(state: CashUpState): CashUpStateTone {
  return STATE_TONES[state]
}

export function CashUpStateBadge({ state }: { state: CashUpState }) {
  return <Badge tone={STATE_TONES[state]}>{CASH_UP_STATE_LABELS[state]}</Badge>
}
