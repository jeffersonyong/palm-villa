import {
  matchesSearch,
  overlapRangeOf,
  readChoices,
  staysOverlap,
  type StayWindow,
} from '@/components/portal/list-params'
import { DEPOSIT_STAGES, type DepositStage } from '@/lib/domain/deposit'
import type { Cents } from '@/lib/domain/money'

/**
 * What the deposits ledger is showing (capability E1).
 *
 * The screen answers one question — "what do we owe back right now" — and the
 * controls on it narrow that answer. Two different kinds of control, because
 * two different reads sit behind them:
 *
 * - A **view** (`?show=`) says *which set* is on screen: what is held, or the
 *   archive of what has been released. They are read by different queries —
 *   held deposits whole, released ones a page at a time — so this is one param
 *   with one value, and a chip that quietly changed which query ran would be
 *   one control doing two jobs.
 * - The **filters** (`?stage=`, `?from=`/`?to=`) narrow *within* a set. Stage
 *   narrows what is held, and is written by the stage tiles and the Stage chip
 *   alike, the way the units board's status tiles and chip share a param. The
 *   stay window narrows either set.
 *
 * Pure, and tested, for the reason `history-page.ts` is: it decides what a
 * screen shows from a string somebody may have typed.
 */

/**
 * `held` is the default and the ledger's real subject. `released` and `owed`
 * are the archive — the same rows, one of them narrowed to the guests who
 * still owe something.
 */
export const LEDGER_VIEWS = ['held', 'released', 'owed'] as const

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

/**
 * The stages a held deposit can be in — every stage but `released`, which is
 * not a stage of something held but the archive's whole subject. That is why
 * the Stage chip offers three and not four: "released" is a view (`?show=`),
 * not a stage of something held, and a chip that mixed "in house" with
 * "released" would need the two reads above stitched into one list.
 */
export const HELD_STAGES = DEPOSIT_STAGES.filter(
  (stage): stage is HeldStage => stage !== 'released',
)

export type HeldStage = Exclude<DepositStage, 'released'>

export function isHeldStage(value: string): value is HeldStage {
  return (HELD_STAGES as readonly string[]).includes(value)
}

/** The chosen stages, in pipeline order. Empty means every held stage. */
export function readHeldStages(value: string | string[] | undefined): readonly HeldStage[] {
  return readChoices(value, HELD_STAGES, isHeldStage)
}

/** How the held set is narrowed. All three empty is every held deposit. */
export interface HeldFilter {
  stages: readonly HeldStage[]
  window: StayWindow | null
  /** A term the booking reference, guest name or unit contains. */
  search: string | null
}

/** One deposit, as this module needs to see it. */
interface LedgerRow {
  stage: DepositStage
  collectedAt: string
  bookingReference: string
  guestName: string
  stay: { unitRef: string; range: { start: string; end: string } } | null
}

/**
 * Narrows the held set: any of the chosen stages, a stay touching the window,
 * and a search the reference, guest or unit answers. A deposit with no stay
 * behind it cannot answer a question about dates, so a window leaves it out —
 * the register's rule for a row with no dates. The search matches what the
 * archive's `ilike` matches, so a held deposit and a released one answer it
 * the same way.
 */
export function filterHeld<T extends LedgerRow>(deposits: readonly T[], filter: HeldFilter): T[] {
  const range = filter.window ? overlapRangeOf(filter.window) : null

  return deposits.filter(
    (deposit) =>
      (filter.stages.length === 0 ||
        (filter.stages as readonly string[]).includes(deposit.stage)) &&
      (range === null || (deposit.stay !== null && staysOverlap(deposit.stay.range, range))) &&
      (filter.search === null ||
        matchesSearch(filter.search, [
          deposit.bookingReference,
          deposit.guestName,
          deposit.stay?.unitRef,
        ])),
  )
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
