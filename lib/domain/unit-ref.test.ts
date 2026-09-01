import { describe, expect, test } from 'vitest'

import {
  checkUnitRefs,
  checkUnitRegistry,
  formatUnitRef,
  generateUnitRefs,
  isNoOp,
  MAX_UNITS_PER_TYPE,
  MAX_UNIT_REF_LENGTH,
  planRegistry,
  refsAfter,
  type CurrentUnit,
  type RefScheme,
} from './unit-ref'

/**
 * Naming the building, and resizing it.
 *
 * Mandatory coverage: this decides which door gets which name. A pairing bug
 * here does not misdraw a screen — it renames the unit a guest is currently
 * asleep in, and every past booking's unit reference moves with it.
 */

const scheme = (overrides: Partial<RefScheme> = {}): RefScheme => ({
  prefix: '3B',
  separator: '-',
  digits: 2,
  startAt: 1,
  ...overrides,
})

const unit = (ref: string, overrides: Partial<CurrentUnit> = {}): CurrentUnit => ({
  id: `id-${ref}`,
  ref,
  unitTypeId: 'three-bedroom',
  hasHistory: false,
  ...overrides,
})

describe('formatUnitRef', () => {
  test('pads to the scheme width', () => {
    expect(formatUnitRef(scheme(), 4)).toBe('3B-04')
    expect(formatUnitRef(scheme({ digits: 3 }), 4)).toBe('3B-004')
  })

  test('does not truncate a number wider than the padding', () => {
    // Better a ref that is one character long than a building with two
    // doors called 3B-00.
    expect(formatUnitRef(scheme({ digits: 2 }), 100)).toBe('3B-100')
  })

  test('honours an empty prefix and an empty separator', () => {
    expect(formatUnitRef(scheme({ prefix: '', separator: '' }), 7)).toBe('07')
  })

  test('a first-floor scheme starts where it is told', () => {
    expect(formatUnitRef(scheme({ prefix: 'A', digits: 3, startAt: 101 }), 101)).toBe('A-101')
  })
})

describe('generateUnitRefs', () => {
  test('produces a consecutive run', () => {
    expect(generateUnitRefs(scheme(), 3)).toEqual(['3B-01', '3B-02', '3B-03'])
  })

  test('a count of zero produces nothing — the unanswered 2-bedroom case', () => {
    expect(generateUnitRefs(scheme({ prefix: '2B' }), 0)).toEqual([])
  })

  test('a negative count produces nothing rather than throwing', () => {
    expect(generateUnitRefs(scheme(), -5)).toEqual([])
  })

  test('caps at the per-type ceiling, so a slipped keystroke is not nine thousand rows', () => {
    expect(generateUnitRefs(scheme(), 10_000)).toHaveLength(MAX_UNITS_PER_TYPE)
  })

  test('starts from the scheme, not from one', () => {
    expect(generateUnitRefs(scheme({ prefix: 'A', digits: 3, startAt: 101 }), 2)).toEqual([
      'A-101',
      'A-102',
    ])
  })
})

describe('checkUnitRefs', () => {
  test('a clean set has nothing wrong with it', () => {
    expect(checkUnitRefs(['3B-01', '3B-02', 'SD-01'])).toEqual([])
  })

  test('catches a blank', () => {
    expect(checkUnitRefs(['3B-01', '   '])).toEqual([{ ref: '   ', reason: 'blank' }])
  })

  test('catches one that will not fit a table cell', () => {
    const long = 'X'.repeat(MAX_UNIT_REF_LENGTH + 1)

    expect(checkUnitRefs([long])).toEqual([{ ref: long, reason: 'too_long' }])
  })

  test('catches a reference that would collide with a route segment', () => {
    expect(checkUnitRefs(['new'])).toEqual([{ ref: 'new', reason: 'reserved' }])
  })

  test('catches characters that would break the unit URL', () => {
    // `/portal/units/[ref]` is a path segment; a slash in a ref makes the
    // unit unreachable rather than merely ugly.
    expect(checkUnitRefs(['A/1'])).toEqual([{ ref: 'A/1', reason: 'unsafe' }])
  })

  test('catches duplicates across unit types, because the constraint is property-wide', () => {
    // A 2-bedroom named 3B-01 collides with a 3-bedroom. The database would
    // say so after the form was filled in; this says so while it is.
    expect(checkUnitRefs(['3B-01', 'SD-01', '3B-01'])).toEqual([
      { ref: '3B-01', reason: 'duplicate' },
    ])
  })

  test('catches a duplicate that differs only in case', () => {
    // Postgres would accept both. Nobody could tell the two doors apart.
    expect(checkUnitRefs(['3B-01', '3b-01'])).toEqual([{ ref: '3b-01', reason: 'duplicate' }])
  })

  test('reports every problem, not just the first', () => {
    expect(checkUnitRefs(['', 'new', '3B-01', '3B-01'])).toHaveLength(3)
  })
})

describe('planRegistry', () => {
  test('identical input is an empty plan, and reads as a no-op', () => {
    const current = [unit('3B-01'), unit('3B-02')]
    const plan = planRegistry(current, [
      { unitTypeId: 'three-bedroom', refs: ['3B-01', '3B-02'] },
    ])

    expect(plan).toEqual({ renames: [], additions: [], removals: [], blocked: [] })
    expect(isNoOp(plan)).toBe(true)
  })

  test('a scheme change is renames in place, never a demolition', () => {
    // The point of pairing positionally: the nth door stays the nth door and
    // keeps its bookings, its history and its identity.
    const current = [unit('3B-01'), unit('3B-02'), unit('3B-03')]
    const plan = planRegistry(current, [
      { unitTypeId: 'three-bedroom', refs: ['A-101', 'A-102', 'A-103'] },
    ])

    expect(plan.renames).toEqual([
      { unitId: 'id-3B-01', fromRef: '3B-01', toRef: 'A-101' },
      { unitId: 'id-3B-02', fromRef: '3B-02', toRef: 'A-102' },
      { unitId: 'id-3B-03', fromRef: '3B-03', toRef: 'A-103' },
    ])
    expect(plan.additions).toEqual([])
    expect(plan.removals).toEqual([])
  })

  test('a swap is two renames — the case the deferrable constraint exists for', () => {
    const current = [unit('3B-01'), unit('3B-02')]
    const plan = planRegistry(current, [
      { unitTypeId: 'three-bedroom', refs: ['3B-02', '3B-01'] },
    ])

    expect(plan.renames).toEqual([
      { unitId: 'id-3B-01', fromRef: '3B-01', toRef: '3B-02' },
      { unitId: 'id-3B-02', fromRef: '3B-02', toRef: '3B-01' },
    ])
  })

  test('pairs in natural order, so the ninth door is not renamed to the tenth name', () => {
    // Plain string sorting puts 3B-10 before 3B-9 and shifts half a floor.
    const current = [unit('3B-10'), unit('3B-9')]
    const plan = planRegistry(current, [
      { unitTypeId: 'three-bedroom', refs: ['A-09', 'A-10'] },
    ])

    expect(plan.renames).toEqual([
      { unitId: 'id-3B-9', fromRef: '3B-9', toRef: 'A-09' },
      { unitId: 'id-3B-10', fromRef: '3B-10', toRef: 'A-10' },
    ])
  })

  test('raising a count is pure additions — answering N1 by typing', () => {
    const plan = planRegistry([], [{ unitTypeId: 'two-bedroom', refs: ['2B-01', '2B-02'] }])

    expect(plan.additions).toEqual([
      { unitTypeId: 'two-bedroom', ref: '2B-01' },
      { unitTypeId: 'two-bedroom', ref: '2B-02' },
    ])
    expect(plan.renames).toEqual([])
    expect(isNoOp(plan)).toBe(false)
  })

  test('lowering a count removes from the end, where an overcount was added', () => {
    const current = [unit('3B-01'), unit('3B-02'), unit('3B-03')]
    const plan = planRegistry(current, [{ unitTypeId: 'three-bedroom', refs: ['3B-01'] }])

    expect(plan.removals).toEqual([
      { unitId: 'id-3B-02', ref: '3B-02' },
      { unitId: 'id-3B-03', ref: '3B-03' },
    ])
  })

  test('a unit that has hosted a stay is blocked, never removed', () => {
    const current = [unit('3B-01'), unit('3B-02', { hasHistory: true })]
    const plan = planRegistry(current, [{ unitTypeId: 'three-bedroom', refs: ['3B-01'] }])

    expect(plan.removals).toEqual([])
    expect(plan.blocked).toEqual([
      { unitId: 'id-3B-02', ref: '3B-02', reason: 'has_history' },
    ])
  })

  test('a plan whose only content is a refusal is still a no-op, so Save stays disabled', () => {
    // An enabled Save that can only fail is a button that lies.
    const current = [unit('3B-01'), unit('3B-02', { hasHistory: true })]
    const plan = planRegistry(current, [{ unitTypeId: 'three-bedroom', refs: ['3B-01'] }])

    expect(isNoOp(plan)).toBe(true)
  })

  test('a type absent from the desired set is left entirely alone', () => {
    // "No instruction" must never read as "delete everything".
    const current = [unit('3B-01'), unit('SD-01', { unitTypeId: 'semi-detached' })]
    const plan = planRegistry(current, [
      { unitTypeId: 'three-bedroom', refs: ['3B-01'] },
    ])

    expect(plan.removals).toEqual([])
    expect(plan.blocked).toEqual([])
  })

  test('renames one type without touching another', () => {
    const current = [unit('3B-01'), unit('SD-01', { unitTypeId: 'semi-detached' })]
    const plan = planRegistry(current, [
      { unitTypeId: 'three-bedroom', refs: ['A-101'] },
      { unitTypeId: 'semi-detached', refs: ['SD-01'] },
    ])

    expect(plan.renames).toEqual([
      { unitId: 'id-3B-01', fromRef: '3B-01', toRef: 'A-101' },
    ])
  })

  test('trims what the form gave it, so a stray space is not a rename', () => {
    const plan = planRegistry(
      [unit('3B-01')],
      [{ unitTypeId: 'three-bedroom', refs: ['3B-01 '] }],
    )

    expect(plan.renames).toEqual([])
  })

  test('a scheme change and a count rise in one plan', () => {
    const current = [unit('3B-01'), unit('3B-02')]
    const plan = planRegistry(current, [
      { unitTypeId: 'three-bedroom', refs: ['A-101', 'A-102', 'A-103'] },
    ])

    expect(plan.renames).toHaveLength(2)
    expect(plan.additions).toEqual([{ unitTypeId: 'three-bedroom', ref: 'A-103' }])
  })
})

describe('refsAfter', () => {
  test('describes the building the plan would leave behind', () => {
    const current = [unit('3B-01'), unit('3B-02'), unit('3B-03')]
    const plan = planRegistry(current, [
      { unitTypeId: 'three-bedroom', refs: ['A-101', 'A-102'] },
    ])

    expect([...refsAfter(current, plan)].sort()).toEqual(['A-101', 'A-102'])
  })

  test('feeds the uniqueness check, catching a rename that collides with a kept unit', () => {
    // The editor renumbers one type into references another type already
    // holds. Caught before the save rather than by the database after it.
    const current = [unit('3B-01'), unit('SD-01', { unitTypeId: 'semi-detached' })]
    const plan = planRegistry(current, [
      { unitTypeId: 'three-bedroom', refs: ['SD-01'] },
    ])

    expect(checkUnitRefs(refsAfter(current, plan))).toEqual([
      { ref: 'SD-01', reason: 'duplicate' },
    ])
  })
})

describe('checkUnitRegistry', () => {
  const building: CurrentUnit[] = [
    unit('3B-01'),
    unit('SD-01', { unitTypeId: 'semi-detached' }),
  ]

  test('a clean edit has nothing wrong with it', () => {
    expect(
      checkUnitRegistry(building, [{ unitTypeId: 'three-bedroom', refs: ['A-101'] }]),
    ).toEqual([])
  })

  test('catches a collision with a type the form is not even showing', () => {
    // The database would refuse this after the form was filled in. Catching it
    // here is the difference between a marked field and a lost edit.
    expect(
      checkUnitRegistry(building, [{ unitTypeId: 'three-bedroom', refs: ['SD-01'] }]),
    ).toEqual([{ ref: 'SD-01', reason: 'duplicate' }])
  })

  test('reports the problem against the name being edited, not the one being kept', () => {
    // Both are 'SD-01'; only one of them is in a field the clerk can change.
    const problems = checkUnitRegistry(building, [
      { unitTypeId: 'three-bedroom', refs: ['SD-01'] },
    ])

    expect(problems).toHaveLength(1)
  })

  test('a type being renamed does not collide with its own old names', () => {
    // Its current refs are replaced, not kept, so they must not be counted.
    expect(
      checkUnitRegistry(
        [unit('3B-01'), unit('3B-02')],
        [{ unitTypeId: 'three-bedroom', refs: ['3B-02', '3B-01'] }],
      ),
    ).toEqual([])
  })
})
