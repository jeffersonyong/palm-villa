import { DEPOSIT_STAGES, isDepositStage, type DepositStage } from '@/lib/domain/deposit'
import type { Cents } from '@/lib/domain/money'

/**
 * What the deposits ledger is showing (capability E1).
 *
 * The screen answers one question — "what do we owe back right now" — and four
 * narrower ones inside it. Those are a **view** rather than a filter, in the
 * URL as `?show=`, because two of them read a different set of rows entirely:
 * held deposits are read whole, and released ones page. A chip that quietly
 * changed which query ran would be one control doing two jobs.
 *
 * Pure, and tested, for the reason `history-window.ts` is: it decides what a
 * screen shows from a string somebody may have typed.
 */

/**
 * `held` is the default and the ledger's real subject. The three stage views
 * narrow it. `released` and `owed` are the archive — the same rows, one of
 * them narrowed to the guests who still owe something.
 */
export const LEDGER_VIEWS = [
  'held',
  'in_house',
  'awaiting_inspection',
  'ready_for_release',
  'released',
  'owed',
] as const

export type LedgerView = (typeof LEDGER_VIEWS)[number]

export const DEFAULT_LEDGER_VIEW: LedgerView = 'held'

/**
 * The view a URL asks for, or the default.
 *
 * Anything unusable falls back rather than erroring — a hand-edited URL should
 * narrow the screen, not break it, which is what every other param in this
 * portal does.
 */
export function readLedgerView(value: string | string[] | undefined): LedgerView {
  const raw = Array.isArray(value) ? value[0] : value

  return raw !== undefined && (LEDGER_VIEWS as readonly string[]).includes(raw)
    ? (raw as LedgerView)
    : DEFAULT_LEDGER_VIEW
}

/**
 * Whether this view reads the archive, which is the set that pages in SQL.
 *
 * The distinction is not cosmetic. Held deposits are bounded by the building
 * and by how fast Finance works, so the screen reads them whole and narrows in
 * TypeScript — which keeps the stage derivation in one place, as the units
 * board does. Released deposits grow for the life of the building, so they page
 * in the database, filtered on stored columns where no stage rule is needed.
 */
export function isArchiveView(view: LedgerView): boolean {
  return view === 'released' || view === 'owed'
}

/** The stage a view narrows to, or null where it shows every held deposit. */
export function stageFor(view: LedgerView): DepositStage | null {
  return isDepositStage(view) ? view : null
}

/** One deposit, as this module needs to see it. */
interface LedgerRow {
  stage: DepositStage
  collectedAt: string
  stay: { range: { end: string } } | null
}

/** Narrows the held set to a view's stage. `held` keeps all of them. */
export function filterHeld<T extends LedgerRow>(deposits: readonly T[], view: LedgerView): T[] {
  const stage = stageFor(view)

  return stage === null ? [...deposits] : deposits.filter((deposit) => deposit.stage === stage)
}

/**
 * The order the ledger works in: what can be done now, then what is waiting,
 * then what is not ready — and oldest first inside each.
 *
 * Deliberately not newest-first, which is the register's order and would be
 * wrong here. This is a **work queue** rather than a record: the deposit that
 * needs attention most is the one that has been ready longest, and putting the
 * newest arrival at the top buries it. The stay's end date leads, because that
 * is when the clock started; a deposit whose booking occupies no unit falls
 * back to when it was taken.
 */
const STAGE_ORDER: Readonly<Record<DepositStage, number>> = {
  ready_for_release: 0,
  awaiting_inspection: 1,
  in_house: 2,
  released: 3,
}

export function sortForLedger<T extends LedgerRow>(deposits: readonly T[]): T[] {
  return [...deposits].sort((a, b) => {
    const byStage = STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]

    if (byStage !== 0) {
      return byStage
    }

    return waitingSince(a).localeCompare(waitingSince(b))
  })
}

function waitingSince(deposit: LedgerRow): string {
  return deposit.stay?.range.end ?? deposit.collectedAt
}

/** What a set of deposits comes to — the tile's count and its figure. */
export function totalsOf(deposits: readonly { amount: Cents }[]): {
  count: number
  amount: Cents
} {
  return {
    count: deposits.length,
    amount: deposits.reduce((total, deposit) => total + deposit.amount, 0),
  }
}

/** What is still owed across a set of released deposits. */
export function owedTotalOf(deposits: readonly { figures: { owed: Cents } }[]): Cents {
  return deposits.reduce((total, deposit) => total + deposit.figures.owed, 0)
}

/** Every stage's count, for the tiles. Stages at zero are present. */
export function countByStage(
  deposits: readonly { stage: DepositStage }[],
): Readonly<Record<DepositStage, number>> {
  const counts = Object.fromEntries(DEPOSIT_STAGES.map((stage) => [stage, 0])) as Record<
    DepositStage,
    number
  >

  for (const deposit of deposits) {
    counts[deposit.stage] += 1
  }

  return counts
}
