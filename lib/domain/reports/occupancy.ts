/**
 * Occupancy over a period (prd.md §14, capability E5).
 *
 * "Occupancy by unit and by type, over a date range" is the first line of the
 * reporting section, and it is the figure the owner will read first — how full
 * was the building. This module is its arithmetic, and it exists as a module
 * rather than as a query because the definition is a judgement rather than a
 * fact, and a judgement belongs where it can be read and tested.
 *
 * ── What counts as occupied [A] ───────────────────────────────────────────
 *
 * A unit-night is occupied when an occupancy row covers it in one of four
 * statuses: `confirmed`, `checked_in`, `completed` or `leased`. That is
 * everything somebody is paying for or living in.
 *
 * Two exclusions are the interesting half. A `held` unit is blocked but not
 * sold — a hold is somebody's intention and expires on its own (prd.md §9.3) —
 * and counting it would report a building fuller than the money says it was. A
 * `cancelled` or `expired` row is not occupancy at all; the exclusion
 * constraint itself ignores both (architecture.md §5.2). `no_show` is left out
 * for the same reason as `held`: nobody slept there. lib/db/bookings.ts flagged
 * that this definition had to be agreed rather than inherited from the
 * dashboard's own "occupied tonight" figure, and this is that agreement,
 * recorded as an [A] in prd.md §14.
 *
 * ── What the denominator is [A] ───────────────────────────────────────────
 *
 * Units of the type × nights in the period. A unit out of service stays IN the
 * denominator: taking it out would make a building that broke down look fuller
 * than one that did not, which is the opposite of what the figure is for. The
 * screen says so rather than leaving it to be inferred.
 *
 * Nights, not days, and half-open: a stay from the 12th to the 14th occupies
 * the 12th and the 13th. Every range in this system is `[start, end)`
 * (architecture.md §5.2) and a reporting range that was not would double-count
 * every changeover day in the building.
 *
 * Pure and I/O-free.
 */

import type { DateRange } from '../availability'
import { nightsBetween, type StayDate } from '../dates'

/**
 * The occupancy statuses that count as a unit-night sold or lived in.
 *
 * Mirrored in SQL by lib/db/reports.ts, which filters on the same list so the
 * database returns only rows this module would count anyway. Kept here because
 * the rule is the product's, not the query's.
 */
export const OCCUPIED_STATUSES = ['confirmed', 'checked_in', 'completed', 'leased'] as const

export type OccupiedStatus = (typeof OCCUPIED_STATUSES)[number]

/** One occupancy row, reduced to what the arithmetic needs. */
export interface OccupancyRow {
  unitId: string
  status: string
  start: StayDate
  /** Null for an open-ended lease (architecture.md §5.2). */
  end: StayDate | null
}

/** One unit, as the report reads it. */
export interface ReportUnit {
  id: string
  ref: string
  unitTypeId: string
  unitTypeName: string
  outOfServiceSince: StayDate | null
}

export interface UnitOccupancy {
  unit: ReportUnit
  occupiedNights: number
  availableNights: number
  /** Null when the unit could not be occupied at all — an empty period. */
  rate: number | null
}

export interface TypeOccupancy {
  typeId: string
  name: string
  unitCount: number
  occupiedNights: number
  availableNights: number
  /** Null when the type has no units — the 2-bedroom, pending N1. */
  rate: number | null
}

export interface OccupancyTotals {
  occupiedNights: number
  availableNights: number
  rate: number | null
}

/**
 * The nights a row contributes inside the range, clipped to it.
 *
 * An open-ended lease runs to the end of the range: it has no last day, so the
 * only honest answer for a bounded question is "all of them". A row that only
 * touches the range at a boundary contributes nothing, which is the half-open
 * convention doing its job.
 */
export function clippedNights(row: OccupancyRow, range: DateRange): number {
  if (!(OCCUPIED_STATUSES as readonly string[]).includes(row.status)) {
    return 0
  }

  const start = row.start > range.start ? row.start : range.start
  const rowEnd = row.end ?? range.end
  const end = rowEnd < range.end ? rowEnd : range.end

  if (start >= end) {
    return 0
  }

  return nightsBetween(start, end)
}

/** Every unit with what it was occupied for, in the order the units arrive. */
export function occupancyByUnit(
  units: readonly ReportUnit[],
  rows: readonly OccupancyRow[],
  range: DateRange,
): readonly UnitOccupancy[] {
  const availableNights = Math.max(0, nightsBetween(range.start, range.end))

  return units.map((unit) => {
    const occupiedNights = rows
      .filter((row) => row.unitId === unit.id)
      .reduce((total, row) => total + clippedNights(row, range), 0)

    return { unit, occupiedNights, availableNights, rate: rateOf(occupiedNights, availableNights) }
  })
}

/** The same figures rolled up per unit type, in the order the types arrive. */
export function occupancyByType(
  types: readonly { id: string; name: string }[],
  byUnit: readonly UnitOccupancy[],
  range: DateRange,
): readonly TypeOccupancy[] {
  const nights = Math.max(0, nightsBetween(range.start, range.end))

  return types.map((type) => {
    const units = byUnit.filter((row) => row.unit.unitTypeId === type.id)
    const occupiedNights = units.reduce((total, row) => total + row.occupiedNights, 0)
    const availableNights = units.length * nights

    return {
      typeId: type.id,
      name: type.name,
      unitCount: units.length,
      occupiedNights,
      availableNights,
      rate: rateOf(occupiedNights, availableNights),
    }
  })
}

/** The building as one line. */
export function occupancyTotals(byType: readonly TypeOccupancy[]): OccupancyTotals {
  const occupiedNights = byType.reduce((total, row) => total + row.occupiedNights, 0)
  const availableNights = byType.reduce((total, row) => total + row.availableNights, 0)

  return { occupiedNights, availableNights, rate: rateOf(occupiedNights, availableNights) }
}

/**
 * A rate as a fraction, or null where there was nothing to occupy.
 *
 * Null rather than zero, deliberately: a type with no units (the 2-bedroom,
 * which seed.sql seeds with none pending N1) was not empty, it was absent, and
 * a screen showing it as 0% would report a failure that never had the chance
 * to happen.
 */
function rateOf(occupiedNights: number, availableNights: number): number | null {
  return availableNights > 0 ? occupiedNights / availableNights : null
}

/** A rate as a whole percentage for display, e.g. `72%`. */
export function formatOccupancyRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}
