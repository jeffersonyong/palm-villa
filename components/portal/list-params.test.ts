import { describe, expect, test } from 'vitest'

import {
  MAX_SEARCH_LENGTH,
  matchesSearch,
  overlapRangeOf,
  readChoices,
  readSearch,
  readStayWindow,
  staysOverlap,
} from './list-params'

const COLOURS = ['red', 'green', 'blue'] as const
type Colour = (typeof COLOURS)[number]
const isColour = (value: string): value is Colour => (COLOURS as readonly string[]).includes(value)

describe('readChoices', () => {
  test('nothing asked for is nothing chosen', () => {
    expect(readChoices(undefined, COLOURS, isColour)).toEqual([])
  })

  test('one value or several, always in canonical order', () => {
    expect(readChoices('blue', COLOURS, isColour)).toEqual(['blue'])
    expect(readChoices(['blue', 'red'], COLOURS, isColour)).toEqual(['red', 'blue'])
  })

  test('drops what it does not recognise rather than erroring', () => {
    expect(readChoices(['blue', 'plaid'], COLOURS, isColour)).toEqual(['blue'])
  })

  test('a value repeated is one choice', () => {
    expect(readChoices(['red', 'red'], COLOURS, isColour)).toEqual(['red'])
  })
})

describe('readStayWindow', () => {
  test('a pair of dates in order is a window', () => {
    expect(readStayWindow('2026-09-01', '2026-09-07')).toEqual({
      from: '2026-09-01',
      to: '2026-09-07',
    })
  })

  test('a single day is a window of one', () => {
    expect(readStayWindow('2026-09-01', '2026-09-01')).toEqual({
      from: '2026-09-01',
      to: '2026-09-01',
    })
  })

  test('half a pair is no window', () => {
    expect(readStayWindow('2026-09-01', undefined)).toBeNull()
    expect(readStayWindow(undefined, '2026-09-07')).toBeNull()
    expect(readStayWindow('2026-09-01', '')).toBeNull()
  })

  test('a reversed pair is no window', () => {
    expect(readStayWindow('2026-09-07', '2026-09-01')).toBeNull()
  })

  test('something that is not a date is no window', () => {
    expect(readStayWindow('September', '2026-09-07')).toBeNull()
    expect(readStayWindow('2026-02-30', '2026-03-01')).toBeNull()
  })
})

describe('overlapRangeOf', () => {
  test('pushes the inclusive last day out by one, so a day is [d, d+1)', () => {
    expect(overlapRangeOf({ from: '2026-09-01', to: '2026-09-01' })).toEqual({
      start: '2026-09-01',
      end: '2026-09-02',
    })
  })

  test('crosses a month end', () => {
    expect(overlapRangeOf({ from: '2026-09-28', to: '2026-09-30' })).toEqual({
      start: '2026-09-28',
      end: '2026-10-01',
    })
  })
})

describe('staysOverlap', () => {
  const range = overlapRangeOf({ from: '2026-09-10', to: '2026-09-12' })

  test('a stay across the window touches it', () => {
    expect(staysOverlap({ start: '2026-09-05', end: '2026-09-20' }, range)).toBe(true)
  })

  test('a stay ending on the first day of the window does not — checkout morning is not a night', () => {
    expect(staysOverlap({ start: '2026-09-05', end: '2026-09-10' }, range)).toBe(false)
  })

  test('a stay beginning on the last day of the window does', () => {
    expect(staysOverlap({ start: '2026-09-12', end: '2026-09-15' }, range)).toBe(true)
  })

  test('a stay beginning the day after does not', () => {
    expect(staysOverlap({ start: '2026-09-13', end: '2026-09-15' }, range)).toBe(false)
  })
})

describe('readSearch', () => {
  test('nothing asked for, or nothing but space, is no search', () => {
    expect(readSearch(undefined)).toBeNull()
    expect(readSearch('')).toBeNull()
    expect(readSearch('   ')).toBeNull()
  })

  test('trims, collapses whitespace, and keeps the case it was given', () => {
    expect(readSearch('  Lim   Wei ')).toBe('Lim Wei')
  })

  test('drops the characters that mean something to the query grammar', () => {
    // Commas and brackets are PostgREST filter syntax; the rest are LIKE
    // wildcards. None can appear in a reference, a name, a phone or a unit.
    expect(readSearch('PV-48,21(*%_)"\\')).toBe('PV-4821')
  })

  test('a term of only reserved characters is no search', () => {
    expect(readSearch('%%%')).toBeNull()
  })

  test('caps a runaway term', () => {
    expect(readSearch('a'.repeat(400))).toHaveLength(MAX_SEARCH_LENGTH)
  })

  test('a repeated param takes the first value', () => {
    expect(readSearch(['3B-04', 'PV-1'])).toBe('3B-04')
  })

  test('a phone number survives intact', () => {
    expect(readSearch('+673 000 0001')).toBe('+673 000 0001')
  })
})

describe('matchesSearch', () => {
  test('any field containing the term, whatever the case', () => {
    expect(matchesSearch('lim', ['PV-4821', 'Lim Wei', '3B-04'])).toBe(true)
    expect(matchesSearch('b-0', ['PV-4821', 'Lim Wei', '3B-04'])).toBe(true)
  })

  test('a field that is absent is not a match', () => {
    expect(matchesSearch('lim', [null, undefined])).toBe(false)
  })

  test('no field containing the term is no match', () => {
    expect(matchesSearch('tan', ['PV-4821', 'Lim Wei', '3B-04'])).toBe(false)
  })
})
