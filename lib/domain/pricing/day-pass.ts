import type { DayPassAgeBand, PropertyConfig } from '../config'
import { line, totalOf, type BookingLine } from '../lines'
import type { Cents } from '../money'

/**
 * Day-pass pricing (prd.md §8.1).
 *
 * Confirmed rates: age 1–12 = 5, age 12+ = 10. Family bundles: 2 adults + 1
 * child = 20, 2 adults + 2 children = 25.
 *
 * prd.md §8.1 [A] states the implementation approach: "Price per person by age
 * band, then apply the best matching bundle override automatically. The
 * customer is never charged more than the cheapest applicable combination."
 * scope-of-capabilities.md A3 promises the same thing to the client, so it is a
 * commitment, not a preference.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TODO(client): prd.md §18 N3 and N4 are both open, and they govern this file.
 *
 *   N3 — the bands "1 to 12" and "12 and above" overlap at 12, and under-1 is
 *        undefined. `config.dayPassAgeBands` holds a provisional non-overlapping
 *        reading; an overlap has no computable meaning, so a choice had to be
 *        made to run at all. It is not the answer.
 *
 *   N4 — bundles exist only for 2+1 and 2+2. Any other family shape has no
 *        stated rule. This module resolves that by allowing bundles to be
 *        applied REPEATEDLY and combined with per-person pricing for whoever is
 *        left over, then taking the cheapest arrangement. So 4 adults + 4
 *        children is priced as two 2+2 bundles (50) rather than per-person (60).
 *
 *        That is a faithful execution of the §8.1 [A] principle, but it IS an
 *        interpretation: the client may have meant a bundle to apply once per
 *        booking. Confirm with Jason before the day-pass flow ships — it is the
 *        difference between 50 and 60 on a common family shape.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * This module is shaped now so the config and line format are settled, but the
 * day-pass flow is Phase 2 and nothing on the walk-in stay path calls it.
 */

/** Headcount per age-band id, e.g. `{ adult: 2, child: 3 }`. */
export type DayPassParty = Readonly<Record<string, number>>

export type DayPassPricingErrorCode = 'unknown_age_band' | 'no_guests' | 'negative_quantity'

export interface DayPassPricingError {
  code: DayPassPricingErrorCode
  message: string
}

export type DayPassPricingResult =
  | { ok: true; lines: readonly BookingLine[]; total: Cents }
  | { ok: false; error: DayPassPricingError }

/** Assigns an age to its band. Returns `null` when no band covers the age. */
export function bandForAge(age: number, config: PropertyConfig): DayPassAgeBand | null {
  return (
    config.dayPassAgeBands.find(
      (band) => age >= band.minAge && (band.maxAgeExclusive === null || age < band.maxAgeExclusive),
    ) ?? null
  )
}

/** Counts a list of ages into a party by band. Throws on an uncovered age. */
export function partyFromAges(ages: readonly number[], config: PropertyConfig): DayPassParty {
  const party: Record<string, number> = {}

  for (const age of ages) {
    const band = bandForAge(age, config)

    if (!band) {
      throw new Error(`No day-pass age band covers age ${age}.`)
    }

    party[band.id] = (party[band.id] ?? 0) + 1
  }

  return party
}

interface Arrangement {
  /** Bundle id → how many times it is applied. */
  bundles: Readonly<Record<string, number>>
  /** Guests left over, priced per person. */
  remainder: DayPassParty
  cost: Cents
}

function perPersonCost(party: DayPassParty, config: PropertyConfig): Cents {
  let cost = 0

  for (const [bandId, count] of Object.entries(party)) {
    const band = config.dayPassAgeBands.find((candidate) => candidate.id === bandId)

    if (!band) {
      throw new Error(`Unknown age band: ${bandId}`)
    }

    cost += band.pricePerPerson * count
  }

  return cost
}

function keyOf(party: DayPassParty, config: PropertyConfig): string {
  return config.dayPassAgeBands.map((band) => party[band.id] ?? 0).join(',')
}

function subtract(
  party: DayPassParty,
  composition: Readonly<Record<string, number>>,
): DayPassParty {
  const next: Record<string, number> = { ...party }

  for (const [bandId, count] of Object.entries(composition)) {
    next[bandId] = (next[bandId] ?? 0) - count
  }

  return next
}

function fits(party: DayPassParty, composition: Readonly<Record<string, number>>): boolean {
  return Object.entries(composition).every(([bandId, count]) => (party[bandId] ?? 0) >= count)
}

/** How many rows this arrangement puts on a receipt. */
function lineCount(arrangement: Arrangement, config: PropertyConfig): number {
  const bundleRows = Object.values(arrangement.bundles).filter((count) => count > 0).length
  const remainderRows = config.dayPassAgeBands.filter(
    (band) => (arrangement.remainder[band.id] ?? 0) > 0 && band.pricePerPerson > 0,
  ).length

  return bundleRows + remainderRows
}

/**
 * Orders two arrangements: cheaper wins, and on an exact tie the one with fewer
 * receipt rows wins.
 *
 * Ties are real and common — 4 adults + 4 children costs 50 both as two 2+2
 * bundles and as a 2+1 plus a 2+2 plus a loose child. The guest pays the same
 * either way, so the tie-break is chosen for legibility: "2 × family bundle"
 * reads as a price, three mixed rows read as a mistake. Without an explicit
 * rule the winner would depend on the order bundles happen to sit in config.
 */
function isBetter(candidate: Arrangement, incumbent: Arrangement, config: PropertyConfig): boolean {
  if (candidate.cost !== incumbent.cost) {
    return candidate.cost < incumbent.cost
  }

  return lineCount(candidate, config) < lineCount(incumbent, config)
}

/**
 * Finds the cheapest arrangement of bundles plus per-person remainder.
 *
 * Exhaustive over a memoised search space. The space is bounded by the party
 * size, and a day pass is a family outing rather than a coach party, so this
 * stays trivially small. Bundles are tried in a fixed order and a bundle may
 * only be reused at or after its own index, which prevents the same
 * multiset being explored under different orderings.
 */
function cheapestArrangement(
  party: DayPassParty,
  config: PropertyConfig,
  fromBundleIndex: number,
  memo: Map<string, Arrangement>,
): Arrangement {
  const memoKey = `${fromBundleIndex}:${keyOf(party, config)}`
  const cached = memo.get(memoKey)

  if (cached) {
    return cached
  }

  let best: Arrangement = {
    bundles: {},
    remainder: party,
    cost: perPersonCost(party, config),
  }

  for (let index = fromBundleIndex; index < config.dayPassBundles.length; index += 1) {
    const bundle = config.dayPassBundles[index]

    if (!bundle || !fits(party, bundle.composition)) {
      continue
    }

    const withBundle = cheapestArrangement(subtract(party, bundle.composition), config, index, memo)

    const candidate: Arrangement = {
      bundles: {
        ...withBundle.bundles,
        [bundle.id]: (withBundle.bundles[bundle.id] ?? 0) + 1,
      },
      remainder: withBundle.remainder,
      cost: bundle.price + withBundle.cost,
    }

    if (isBetter(candidate, best, config)) {
      best = candidate
    }
  }

  memo.set(memoKey, best)

  return best
}

/** Prices a day pass for a party, never charging above the per-person price. */
export function priceDayPass(party: DayPassParty, config: PropertyConfig): DayPassPricingResult {
  const bandIds = new Set(config.dayPassAgeBands.map((band) => band.id))

  for (const [bandId, count] of Object.entries(party)) {
    if (!bandIds.has(bandId)) {
      return { ok: false, error: { code: 'unknown_age_band', message: `Unknown band: ${bandId}.` } }
    }

    if (count < 0) {
      return {
        ok: false,
        error: { code: 'negative_quantity', message: 'Headcounts cannot be negative.' },
      }
    }
  }

  const headcount = Object.values(party).reduce((sum, count) => sum + count, 0)

  if (headcount < 1) {
    return {
      ok: false,
      error: { code: 'no_guests', message: 'A day pass needs at least one guest.' },
    }
  }

  const best = cheapestArrangement(party, config, 0, new Map())
  const lines: BookingLine[] = []

  for (const bundle of config.dayPassBundles) {
    const applied = best.bundles[bundle.id] ?? 0

    if (applied > 0) {
      lines.push(line('day_pass_bundle', bundle.label, applied, bundle.price))
    }
  }

  for (const band of config.dayPassAgeBands) {
    const remaining = best.remainder[band.id] ?? 0

    // Free bands still produce no line: a zero-amount row on a receipt reads as
    // a mistake. The headcount is recorded on the booking either way.
    if (remaining > 0 && band.pricePerPerson > 0) {
      lines.push(line('day_pass', band.label, remaining, band.pricePerPerson))
    }
  }

  return { ok: true, lines, total: totalOf(lines) }
}
