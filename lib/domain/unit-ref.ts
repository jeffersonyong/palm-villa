/**
 * What the units are called, and how many there are (capability F6).
 *
 * ── Why this is editable at all ───────────────────────────────────────────
 *
 * prd.md §7.1 records two things nobody has answered: how many 2-bedroom units
 * exist (open question N1), and how the units are labelled on the actual doors
 * (N10). The seed's `3B-01` scheme is provisional and says so in a
 * `TODO(client)`. Both were blocking a screen; neither needs to any more.
 * Answering them is now typing rather than a migration, which is what F3
 * already promises for every other piece of property configuration.
 *
 * ── What this module is ───────────────────────────────────────────────────
 *
 * Two halves. A **scheme** generates references for a unit type in bulk —
 * prefix, separator, zero padding, starting number — because renaming
 * thirty-six doors one field at a time is not a thing anyone will do
 * correctly. A **plan** diffs what exists against what was asked for and says
 * what has to happen: renames, additions, removals, and the removals that are
 * refused.
 *
 * The rules live here rather than in `apply_unit_registry()` for the reason
 * architecture.md §5.3 gives about the booking state machine: the function is
 * the transaction, this is the decision, and the decision is what gets tested.
 *
 * Coverage here is mandatory (architecture.md §2).
 */

/**
 * A reference has to fit a table cell, a badge and a `?unit=` parameter.
 * Sixteen characters is longer than any door number anyone writes on a door.
 */
export const MAX_UNIT_REF_LENGTH = 16

/**
 * A ceiling on what one call may create, so a slipped keystroke in the count
 * field is a refusal rather than nine thousand rows and a timeout.
 */
export const MAX_UNITS_PER_TYPE = 200

/**
 * References that would collide with a route segment under `/portal/units`.
 *
 * There is no static sibling of `[ref]` today, and the registry editor lives
 * at `/portal/settings/units` partly so there need not be. This list is the
 * cheap insurance against the next person adding one and discovering that a
 * unit called "new" has become unreachable.
 */
export const RESERVED_UNIT_REFS = ['new', 'manage', 'edit', 'settings'] as const

/** Characters that would break a reference used as a URL path segment. */
const UNSAFE_IN_A_PATH = /[/?#%\\]/

export interface RefScheme {
  /** The part before the number, e.g. `3B` or `Villa`. May be empty. */
  prefix: string
  /** What sits between prefix and number, e.g. `-` or a space. May be empty. */
  separator: string
  /** Zero padding: 2 gives `01`, 3 gives `001`. */
  digits: number
  /** The first number in the run. Usually 1; 101 for a first floor. */
  startAt: number
}

export const DEFAULT_REF_SCHEME: RefScheme = {
  prefix: '',
  separator: '-',
  digits: 2,
  startAt: 1,
}

/** One reference from a scheme. Numbers longer than `digits` are not truncated. */
export function formatUnitRef(scheme: RefScheme, ordinal: number): string {
  const number = String(ordinal).padStart(Math.max(0, scheme.digits), '0')

  return `${scheme.prefix}${scheme.separator}${number}`
}

/** `count` consecutive references, starting at the scheme's first number. */
export function generateUnitRefs(scheme: RefScheme, count: number): readonly string[] {
  if (count <= 0) {
    return []
  }

  return Array.from({ length: Math.min(count, MAX_UNITS_PER_TYPE) }, (_, index) =>
    formatUnitRef(scheme, scheme.startAt + index),
  )
}

export type RefProblemReason = 'blank' | 'too_long' | 'reserved' | 'duplicate' | 'unsafe'

export interface RefProblem {
  ref: string
  reason: RefProblemReason
}

/**
 * Everything wrong with a set of references, checked across the whole
 * building rather than one type at a time.
 *
 * Property-wide because `unique (property_id, ref)` is: naming a 2-bedroom
 * `3B-01` collides with a 3-bedroom, and the database would refuse it after
 * the clerk had filled in the rest of the form.
 *
 * Duplicates are caught case-insensitively even though the constraint is not.
 * `3b-01` and `3B-01` are two rows Postgres is happy with and two doors nobody
 * can tell apart, which is the more expensive mistake.
 */
export function checkUnitRefs(refs: readonly string[]): readonly RefProblem[] {
  const problems: RefProblem[] = []
  const seen = new Set<string>()

  for (const ref of refs) {
    const trimmed = ref.trim()

    if (trimmed.length === 0) {
      problems.push({ ref, reason: 'blank' })
      continue
    }

    if (trimmed.length > MAX_UNIT_REF_LENGTH) {
      problems.push({ ref, reason: 'too_long' })
      continue
    }

    if (UNSAFE_IN_A_PATH.test(trimmed)) {
      problems.push({ ref, reason: 'unsafe' })
      continue
    }

    const folded = trimmed.toLowerCase()

    if ((RESERVED_UNIT_REFS as readonly string[]).includes(folded)) {
      problems.push({ ref, reason: 'reserved' })
      continue
    }

    if (seen.has(folded)) {
      problems.push({ ref, reason: 'duplicate' })
      continue
    }

    seen.add(folded)
  }

  return problems
}

export interface CurrentUnit {
  id: string
  ref: string
  /** The unit type's slug, as everywhere else in the app. */
  unitTypeId: string
  /** Whether anyone has ever occupied it. Decides if it may be removed. */
  hasHistory: boolean
}

export interface DesiredUnitType {
  unitTypeId: string
  /** The references this type should end up with, in order. */
  refs: readonly string[]
}

export interface UnitRename {
  unitId: string
  fromRef: string
  toRef: string
}

export interface UnitAddition {
  unitTypeId: string
  ref: string
}

export interface UnitRemoval {
  unitId: string
  ref: string
}

export interface BlockedRemoval extends UnitRemoval {
  reason: 'has_history'
}

export interface RegistryPlan {
  renames: readonly UnitRename[]
  additions: readonly UnitAddition[]
  removals: readonly UnitRemoval[]
  /**
   * Units the plan wanted gone that have hosted a stay. Surfaced rather than
   * silently kept, so the editor can say so before the save rather than the
   * database saying so after it.
   */
  blocked: readonly BlockedRemoval[]
}

/**
 * Natural order, so `3B-9` sorts before `3B-10`.
 *
 * Plain string comparison would pair the ninth door with the tenth reference
 * and rename half a floor for no reason.
 */
function byNaturalRef(a: CurrentUnit, b: CurrentUnit): number {
  return a.ref.localeCompare(b.ref, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * What has to happen to turn `current` into `desired`.
 *
 * Units are paired to references **positionally within their type**, in
 * natural reference order. That is what makes a scheme change a rename rather
 * than a demolition: the nth door keeps being the nth door and simply gets a
 * new name, so its bookings, its history and its identity survive. It also
 * means shrinking a count removes from the end, which is where an overcount
 * was added.
 *
 * A type absent from `desired` is left alone entirely. The editor always sends
 * every type, but "no instruction" must never read as "delete everything".
 */
export function planRegistry(
  current: readonly CurrentUnit[],
  desired: readonly DesiredUnitType[],
): RegistryPlan {
  const renames: UnitRename[] = []
  const additions: UnitAddition[] = []
  const removals: UnitRemoval[] = []
  const blocked: BlockedRemoval[] = []

  for (const type of desired) {
    const existing = current
      .filter((unit) => unit.unitTypeId === type.unitTypeId)
      .sort(byNaturalRef)

    const kept = Math.min(existing.length, type.refs.length)

    for (let index = 0; index < kept; index += 1) {
      const unit = existing[index]!
      const ref = type.refs[index]!.trim()

      if (unit.ref !== ref) {
        renames.push({ unitId: unit.id, fromRef: unit.ref, toRef: ref })
      }
    }

    for (let index = kept; index < type.refs.length; index += 1) {
      additions.push({ unitTypeId: type.unitTypeId, ref: type.refs[index]!.trim() })
    }

    for (let index = kept; index < existing.length; index += 1) {
      const unit = existing[index]!

      if (unit.hasHistory) {
        blocked.push({ unitId: unit.id, ref: unit.ref, reason: 'has_history' })
      } else {
        removals.push({ unitId: unit.id, ref: unit.ref })
      }
    }
  }

  return { renames, additions, removals, blocked }
}

/**
 * True when the plan would change nothing — the editor's dirty gate.
 *
 * `blocked` does not count as a change: a plan whose only content is refusals
 * has nothing to save, and an enabled Save that can only fail is a button that
 * lies.
 */
export function isNoOp(plan: RegistryPlan): boolean {
  return (
    plan.renames.length === 0 && plan.additions.length === 0 && plan.removals.length === 0
  )
}

/** Every reference the plan would leave in place, for a final uniqueness check. */
export function refsAfter(
  current: readonly CurrentUnit[],
  plan: RegistryPlan,
): readonly string[] {
  const removed = new Set(plan.removals.map((removal) => removal.unitId))
  const renamed = new Map(plan.renames.map((rename) => [rename.unitId, rename.toRef]))

  const kept = current
    .filter((unit) => !removed.has(unit.id))
    .map((unit) => renamed.get(unit.id) ?? unit.ref)

  return [...kept, ...plan.additions.map((addition) => addition.ref)]
}
