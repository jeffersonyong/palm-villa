import type { StayDate } from '@/lib/domain/dates'
import type { UnitTypeConfig } from '@/lib/domain/config'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'

/**
 * Inventory reads.
 *
 * architecture.md §2: "Query layer; all database access lives here." Nothing
 * outside `lib/db` talks to a data source, which is what let the fixture layer
 * be swapped for Postgres without the screens noticing.
 *
 * The app-level `unitTypeId` is the unit type's **slug**, not its uuid. Unit
 * type slugs are shared with lib/domain/config.ts and the public site's content
 * module, and they are what appears in the `?type=` URL parameter on the
 * booking screen. Keeping uuids inside this layer means a URL stays readable
 * and the pricing engine keeps taking the same identifier it always did.
 */

export interface Unit {
  id: string
  /** Human-facing unit reference, e.g. `3B-04`. Editable by an administrator. */
  ref: string
  /** The unit type's slug — see the module note above. */
  unitTypeId: string
  unitTypeName: string
  /**
   * Null unless the unit has been taken out of service (capability B9).
   *
   * Carried on the ordinary unit shape rather than only on the board's, so a
   * caller counting inventory cannot forget that some of it cannot be sold.
   */
  outOfServiceSince: StayDate | null
}

interface UnitTypeRow {
  slug: string
  name: string
  base_rate_cents: number
  max_pax: number
  car_parks: number
}

interface UnitRow {
  id: string
  ref: string
  out_of_service_since: string | null
  unit_type: { slug: string; name: string } | null
}

/**
 * The bookable unit types with their rates (prd.md §7.1).
 *
 * Read from the database, which is where per-property rates belong
 * (architecture.md §11: "rates, fees, policies ... are rows in per-property
 * config, never constants"). The pricing engine still takes its figures from
 * `palmVillaConfig`, because that module also carries the values with no
 * database home yet — the open questions in prd.md §18. `inventory.test.ts`
 * asserts the two agree so the duplication cannot drift while it lasts.
 */
export async function getUnitTypes(): Promise<readonly UnitTypeConfig[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('unit_type')
    .select('slug, name, base_rate_cents, max_pax, car_parks')
    .eq('property_id', propertyId)
    .order('base_rate_cents')

  if (error) {
    throw new Error(`Could not read unit types: ${error.message}`)
  }

  return (data as UnitTypeRow[]).map((row) => ({
    id: row.slug,
    slug: row.slug,
    name: row.name,
    baseRatePerNight: row.base_rate_cents,
    maxPax: row.max_pax,
    carParks: row.car_parks,
  }))
}

/** The unit registry, optionally narrowed to one type. Ordered by reference. */
export async function getUnits(unitTypeId?: string): Promise<readonly Unit[]> {
  const propertyId = await currentPropertyId()

  const query = dataClient()
    .from('unit')
    .select('id, ref, out_of_service_since, unit_type!inner(slug, name)')
    .eq('property_id', propertyId)
    .order('ref')

  if (unitTypeId) {
    query.eq('unit_type.slug', unitTypeId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Could not read units: ${error.message}`)
  }

  return (data as unknown as UnitRow[]).map(toUnit)
}

export interface UnitCountOptions {
  /**
   * Count only units that could actually take a guest — the denominator of
   * "3 of 36 free".
   *
   * This exists because that summary is a claim about the building, and a
   * denominator that includes a unit nobody can be put in states it wrongly:
   * "3 of 36" when four are out of service means three of thirty-two, and the
   * clerk reading it is deciding whether to turn a walk-in away. The plain
   * count still answers "how many units are there", which is a different
   * question and the one the registry editor asks.
   */
  serviceableOnly?: boolean
}

/**
 * How many units exist of each type. Drives the "N of M free" summary.
 *
 * Every type appears, including one with no units — the 2-bedroom, whose
 * count was prd.md §18 N1 and is now something an administrator sets on the
 * unit registry screen. A missing key would read on screen as an absent unit
 * type rather than an empty one.
 */
export async function getUnitCounts(
  options: UnitCountOptions = {},
): Promise<Readonly<Record<string, number>>> {
  const [types, units] = await Promise.all([getUnitTypes(), getUnits()])

  const counts: Record<string, number> = Object.fromEntries(types.map((type) => [type.id, 0]))

  for (const unit of units) {
    if (options.serviceableOnly && unit.outOfServiceSince !== null) {
      continue
    }

    counts[unit.unitTypeId] = (counts[unit.unitTypeId] ?? 0) + 1
  }

  return counts
}

function toUnit(row: UnitRow): Unit {
  if (!row.unit_type) {
    // Not reachable: `unit.unit_type_id` is not null and carries a composite
    // foreign key. Guarded because the alternative is a silent `undefined`
    // reaching the unit picker as a blank option.
    throw new Error(`Unit ${row.ref} has no unit type.`)
  }

  return {
    id: row.id,
    ref: row.ref,
    unitTypeId: row.unit_type.slug,
    unitTypeName: row.unit_type.name,
    outOfServiceSince: row.out_of_service_since,
  }
}
