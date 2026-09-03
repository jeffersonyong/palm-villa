import { describe, expect, test } from 'vitest'

import {
  countByStatus,
  deriveUnitStatus,
  isUnitStatus,
  UNIT_STATUSES,
  UNIT_STATUS_LABELS,
  type OccupancyStatus,
  type UnitStatus,
} from './unit-status'

/**
 * What a unit is doing, from the facts recorded about it.
 *
 * Mandatory coverage: this is the whole of capability B8's answer. Getting it
 * wrong does not misdraw a badge — it tells a clerk a unit is free when
 * somebody is asleep in it, or that it is occupied when it could be sold.
 */

const covering = (status: OccupancyStatus) => ({
  outOfServiceSince: null,
  covering: { status },
})

describe('deriveUnitStatus', () => {
  test('a unit nothing covers is available', () => {
    // Arrange / Act
    const status = deriveUnitStatus({ outOfServiceSince: null, covering: null })

    // Assert
    expect(status).toBe('available')
  })

  test('a checked-in guest makes the unit occupied', () => {
    expect(deriveUnitStatus(covering('checked_in'))).toBe('occupied')
  })

  test('a confirmed booking makes it booked', () => {
    expect(deriveUnitStatus(covering('confirmed'))).toBe('booked')
  })

  test('a lease makes it leased long-term', () => {
    expect(deriveUnitStatus(covering('leased'))).toBe('leased_long_term')
  })

  test.each<OccupancyStatus>(['held', 'awaiting_payment_verification'])(
    'a %s occupancy holds the unit',
    (status) => {
      expect(deriveUnitStatus(covering(status))).toBe('held')
    },
  )

  test('a draft occupancy reads as held, not as available', () => {
    // A draft occupancy still holds its slot in the exclusion constraint. If
    // this said "available", the board and available_units() would disagree
    // about the same row — and the board would be the one that was wrong.
    expect(deriveUnitStatus(covering('draft'))).toBe('held')
  })

  test('out of service outranks a guest who is in the unit', () => {
    const status = deriveUnitStatus({
      outOfServiceSince: '2026-09-04',
      covering: { status: 'checked_in' },
    })

    expect(status).toBe('out_of_service')
  })

  test('out of service outranks a lease', () => {
    const status = deriveUnitStatus({
      outOfServiceSince: '2026-09-04',
      covering: { status: 'leased' },
    })

    expect(status).toBe('out_of_service')
  })

  test('a lease outranks nothing else, because nothing else can cover the same day', () => {
    // Not a redundant assertion: it pins the fact that the exclusion
    // constraint, not this function, is what stops two things covering one
    // unit. If that ever stopped being true, `covering` would need to become a
    // list and this file would need to say which wins.
    expect(deriveUnitStatus(covering('leased'))).toBe('leased_long_term')
  })

  // ── The documented gap ────────────────────────────────────────────────────
  //
  // These two assert a divergence rather than a behaviour, so that closing it
  // is a deliberate act. An occupancy in either state whose end date has not
  // passed still blocks availability, but the board calls the unit available:
  // that is prd.md §6.4's `awaiting_inspection`, which capabilities C2–C3 will
  // write. Changing these lines should mean the inspection slice has landed.
  test.each<OccupancyStatus>(['completed', 'no_show'])(
    'a %s occupancy reads as available — the awaiting-inspection gap, until C2–C3',
    (status) => {
      expect(deriveUnitStatus(covering(status))).toBe('available')
    },
  )

  test.each<OccupancyStatus>(['expired', 'cancelled'])(
    'a %s occupancy never reaches here, and reads as available if it does',
    (status) => {
      // unit_state() filters these out with the same predicate the exclusion
      // constraint uses. Belt and braces: a released occupancy releases its
      // unit on both sides of the boundary.
      expect(deriveUnitStatus(covering(status))).toBe('available')
    },
  )
})

describe('the status vocabulary', () => {
  test('every status has a label', () => {
    for (const status of UNIT_STATUSES) {
      expect(UNIT_STATUS_LABELS[status]).toBeTruthy()
    }
  })

  test('reads in lifecycle order, with the two stored facts last', () => {
    expect(UNIT_STATUSES).toEqual([
      'available',
      'held',
      'booked',
      'occupied',
      'leased_long_term',
      'out_of_service',
    ])
  })

  test('recognises its own statuses and rejects anything else', () => {
    expect(isUnitStatus('occupied')).toBe(true)
    expect(isUnitStatus('out_of_service')).toBe(true)
    // The two prd.md §6.4 names that this build cannot show.
    expect(isUnitStatus('awaiting_inspection')).toBe(false)
    expect(isUnitStatus('cleaning')).toBe(false)
    expect(isUnitStatus('')).toBe(false)
  })
})

describe('countByStatus', () => {
  test('counts what it is given', () => {
    const counts = countByStatus(['available', 'available', 'occupied'])

    expect(counts.available).toBe(2)
    expect(counts.occupied).toBe(1)
  })

  test('reports zero for a status nothing is in, rather than omitting it', () => {
    // A tile that disappears at zero makes the strip's width jump through the
    // day, and "nothing is out of service" is worth saying.
    const counts = countByStatus(['available'])

    expect(counts.out_of_service).toBe(0)
    expect(Object.keys(counts).sort()).toEqual([...UNIT_STATUSES].sort())
  })

  test('an empty building is all zeroes, not an empty object', () => {
    const counts = countByStatus([])

    expect(Object.values(counts)).toEqual(UNIT_STATUSES.map(() => 0))
  })

  test('the totals add up to the units counted', () => {
    const statuses: UnitStatus[] = ['available', 'held', 'booked', 'occupied', 'available']
    const counts = countByStatus(statuses)

    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(statuses.length)
  })
})
