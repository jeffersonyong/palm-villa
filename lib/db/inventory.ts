import { palmVillaConfig, type PropertyConfig, type UnitTypeConfig } from '@/lib/domain/config'

import { units, type UnitFixture } from './fixtures'

/**
 * Inventory reads.
 *
 * architecture.md §2: "Query layer; all database access lives here." Nothing
 * outside `lib/db` talks to a data source, so when the fixtures are replaced by
 * Supabase queries the callers do not change.
 *
 * These are async despite reading from memory, deliberately: the real
 * implementations will be, and making callers `await` now means the swap is a
 * change to this file alone.
 */

export interface Unit extends UnitFixture {
  unitTypeName: string
}

function decorate(unit: UnitFixture, config: PropertyConfig): Unit {
  const unitType = config.unitTypes.find((candidate) => candidate.id === unit.unitTypeId)

  return { ...unit, unitTypeName: unitType?.name ?? unit.unitTypeId }
}

/** The bookable unit types with their rates (prd.md §7.1). */
export async function getUnitTypes(
  config: PropertyConfig = palmVillaConfig,
): Promise<readonly UnitTypeConfig[]> {
  return config.unitTypes
}

/** The unit registry, optionally narrowed to one type. */
export async function getUnits(
  unitTypeId?: string,
  config: PropertyConfig = palmVillaConfig,
): Promise<readonly Unit[]> {
  const matching = unitTypeId ? units.filter((unit) => unit.unitTypeId === unitTypeId) : units

  return matching.map((unit) => decorate(unit, config))
}

/** How many units exist of each type. Drives the "N of M free" summary. */
export async function getUnitCounts(): Promise<Readonly<Record<string, number>>> {
  return units.reduce<Record<string, number>>((counts, unit) => {
    counts[unit.unitTypeId] = (counts[unit.unitTypeId] ?? 0) + 1

    return counts
  }, {})
}
