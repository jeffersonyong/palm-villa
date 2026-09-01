import { describe, expect, it } from 'vitest'

import {
  formatVehicles,
  hasVehicleAnswer,
  normaliseVehicleRegistration,
  normaliseVehicleRegistrations,
} from './vehicle'

/**
 * These pin the one property the gate lookup depends on: two people typing the
 * same plate differently produce the same stored string. prd.md §12.5 makes
 * plate lookup the primary arrival path, and it is an equality match on an
 * indexed column — so a normalisation that lets `baa 1234` and `BAA1234` apart
 * is a guard who cannot find a booking that is right there.
 */
describe('normaliseVehicleRegistration', () => {
  it('upper-cases and trims', () => {
    expect(normaliseVehicleRegistration('  baa 1234 ')).toBe('BAA 1234')
  })

  it('collapses internal whitespace, so spacing is not part of the plate', () => {
    expect(normaliseVehicleRegistration('BAA   1234')).toBe('BAA 1234')
  })

  it('treats a blank entry as no vehicle rather than an unnamed one', () => {
    expect(normaliseVehicleRegistration('   ')).toBeNull()
    expect(normaliseVehicleRegistration('')).toBeNull()
  })
})

describe('normaliseVehicleRegistrations', () => {
  it('keeps the order they were given in', () => {
    expect(normaliseVehicleRegistrations(['bb 9', 'aa 1'])).toEqual(['BB 9', 'AA 1'])
  })

  it('drops the empty rows a repeated field leaves behind', () => {
    expect(normaliseVehicleRegistrations(['BAA1234', '', '  '])).toEqual(['BAA1234'])
  })

  it('de-duplicates after normalising, not before', () => {
    // The unique constraint on (booking, registration) would otherwise refuse
    // the whole write because one car was typed twice, two ways.
    expect(normaliseVehicleRegistrations(['baa 1234', 'BAA  1234'])).toEqual(['BAA 1234'])
  })

  it('is empty for no input', () => {
    expect(normaliseVehicleRegistrations([])).toEqual([])
  })
})

describe('hasVehicleAnswer', () => {
  it('accepts plates', () => {
    expect(hasVehicleAnswer(['BAA1234'], false)).toBe(true)
  })

  it('accepts the deliberate exception', () => {
    expect(hasVehicleAnswer([], true)).toBe(true)
  })

  it('refuses silence — the case prd.md §13 [C] does not allow', () => {
    expect(hasVehicleAnswer([], false)).toBe(false)
  })
})

describe('formatVehicles', () => {
  it('joins several onto one line', () => {
    expect(formatVehicles(['BAA1234', 'BB5678'])).toBe('BAA1234 · BB5678')
  })

  it('returns null for none, so the caller decides what absence looks like', () => {
    expect(formatVehicles([])).toBeNull()
  })
})
