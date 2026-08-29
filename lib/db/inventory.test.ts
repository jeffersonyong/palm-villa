import { describe, expect, test } from 'vitest'

import { countAvailableByType, findAvailableUnits } from './bookings'
import { palmVillaConfig } from '@/lib/domain/config'

import { getUnitCounts, getUnitTypes, getUnits } from './inventory'
import { givenBooking } from './test/factory'

/**
 * Inventory reads against the seeded property.
 *
 * The counts here are the ones prd.md §7.1 confirms. If a number below changes,
 * either the seed invented something or the client answered a question — and
 * both should be a deliberate edit rather than a test quietly going green.
 */

describe('the seeded inventory', () => {
  test('holds the 48 units prd.md §7.1 confirms', async () => {
    expect(await getUnits()).toHaveLength(48)
  })

  test('seeds no 2-bedroom units, because the count is an open question', async () => {
    const counts = await getUnitCounts()

    // prd.md §18 N1: how many 2-bedroom units are there, and does the 48-unit
    // total still hold? The type exists and prices correctly; the count does
    // not, and the fixture layer's invented 4 does not reach a real database.
    // Answering N1 changes this line and one INSERT in the seed.
    expect(counts['two-bedroom']).toBe(0)
    expect(counts['three-bedroom']).toBe(36)
    expect(counts['four-bedroom']).toBe(6)
    expect(counts['semi-detached']).toBe(6)
  })

  test('narrows the unit list to one type', async () => {
    const units = await getUnits('four-bedroom')

    expect(units).toHaveLength(6)
    expect(units.every((unit) => unit.unitTypeId === 'four-bedroom')).toBe(true)
  })

  test('exposes the unit type slug as the identifier, not the uuid', async () => {
    const [first] = await getUnits('semi-detached')

    // The slug is what appears in the `?type=` URL parameter and what the
    // pricing engine takes, so a uuid leaking out here would break both.
    expect(first?.unitTypeId).toBe('semi-detached')
    expect(first?.unitTypeName).toBe('Semi-detached')
  })
})

describe('unit type rates', () => {
  test('match lib/domain/config.ts exactly', async () => {
    const seeded = await getUnitTypes()

    // These figures live in two places while PropertyConfig still holds values
    // with no database home — the prd.md §18 TODO(client) fields. Both copies
    // come from the same [C] rows in prd.md §7.1, and this is what stops them
    // drifting apart until the config slice removes the duplication.
    const asConfigured = palmVillaConfig.unitTypes.map((type) => ({
      id: type.id,
      name: type.name,
      baseRatePerNight: type.baseRatePerNight,
      maxPax: type.maxPax,
      carParks: type.carParks,
    }))

    const asSeeded = seeded.map((type) => ({
      id: type.id,
      name: type.name,
      baseRatePerNight: type.baseRatePerNight,
      maxPax: type.maxPax,
      carParks: type.carParks,
    }))

    expect(asSeeded).toEqual(expect.arrayContaining(asConfigured))
    expect(asSeeded).toHaveLength(asConfigured.length)
  })
})

describe('availability', () => {
  const RANGE = { start: '2026-10-05', end: '2026-10-08' }

  test('offers every unit when nothing is booked', async () => {
    expect(await findAvailableUnits({ range: RANGE })).toHaveLength(48)
  })

  test('drops a unit that is booked for the range', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: RANGE.start, checkOut: RANGE.end })

    const available = await findAvailableUnits({ range: RANGE })

    expect(available).toHaveLength(47)
    expect(available.map((unit) => unit.ref)).not.toContain('3B-01')
  })

  test('still offers a unit whose previous stay ends on the check-in date', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: '2026-10-01', checkOut: RANGE.start })

    // Half-open, matching the exclusion constraint: the availability list and
    // the write have to agree at the boundary, or the screen offers a unit the
    // database then refuses.
    expect((await findAvailableUnits({ range: RANGE })).map((unit) => unit.ref)).toContain('3B-01')
  })

  test('narrows availability to one unit type', async () => {
    const available = await findAvailableUnits({ range: RANGE, unitTypeId: 'four-bedroom' })

    expect(available).toHaveLength(6)
    expect(available.every((unit) => unit.unitTypeId === 'four-bedroom')).toBe(true)
  })

  test('counts availability per type, including types with none', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: RANGE.start, checkOut: RANGE.end })

    const counts = await countAvailableByType(RANGE)

    expect(counts['three-bedroom']).toBe(35)
    expect(counts['four-bedroom']).toBe(6)
    // Present as a zero rather than absent: a missing key reads on screen as a
    // unit type that does not exist, not as an unanswered question.
    expect(counts['two-bedroom']).toBe(0)
  })
})
