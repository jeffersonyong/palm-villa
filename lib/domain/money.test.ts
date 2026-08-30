import { describe, expect, test } from 'vitest'

import { bnd, centsFromInput, formatCents, sumCents } from './money'

/**
 * Money tests.
 *
 * Coverage here is mandatory (architecture.md §2) — every figure the product
 * quotes, charges and verifies passes through this module. It went untested
 * until the payments slice needed a parser; these cover the whole module, not
 * just the new function.
 */

describe('bnd', () => {
  test('converts whole dollars to cents', () => {
    expect(bnd(0)).toBe(0)
    expect(bnd(1)).toBe(100)
    expect(bnd(442)).toBe(44200)
  })

  test('throws on a fractional amount rather than rounding it', () => {
    // Silently rounding here would put a booking a cent out, and a cent out is
    // a reconciliation problem for a human rather than a rounding detail.
    expect(() => bnd(4.5)).toThrow(/whole Brunei dollars/)
  })
})

describe('sumCents', () => {
  test('sums a list, and an empty list is zero', () => {
    expect(sumCents([])).toBe(0)
    expect(sumCents([44200, 2800, 1000])).toBe(48000)
  })
})

describe('centsFromInput', () => {
  test.each([
    ['0', 0],
    ['0.01', 1],
    ['442', 44200],
    ['442.5', 44250],
    ['442.50', 44250],
    ['442.05', 44205],
    ['  10  ', 1000],
    ['1000', 100000],
  ])('parses %j as %i cents', (value, expected) => {
    expect(centsFromInput(value)).toBe(expected)
  })

  test.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['abc', 'not a number'],
    ['1,000', 'a grouping comma'],
    ['$442', 'a currency symbol'],
    ['-5', 'negative'],
    ['4.155', 'a third decimal place'],
    ['4.', 'a trailing point'],
    ['.5', 'a leading point'],
    ['1e3', 'exponent notation'],
    ['Infinity', 'not finite'],
  ])('refuses %j — %s', (value) => {
    expect(centsFromInput(value)).toBeNull()
  })

  test('rejects rather than repairs', () => {
    // The form says what it did not understand. Guessing at a mistyped figure
    // is how a payment gets recorded at the wrong amount.
    expect(centsFromInput('1,0O0')).toBeNull()
  })
})

describe('formatCents', () => {
  test('always shows both minor digits', () => {
    expect(formatCents(0)).toBe('0.00')
    expect(formatCents(5)).toBe('0.05')
    expect(formatCents(50)).toBe('0.50')
    expect(formatCents(44200)).toBe('442.00')
  })

  test('groups thousands', () => {
    expect(formatCents(100000)).toBe('1,000.00')
    expect(formatCents(123456789)).toBe('1,234,567.89')
  })

  test('carries a negative sign, for a variance rendered as a shortfall', () => {
    expect(formatCents(-4200)).toBe('-42.00')
    expect(formatCents(-1)).toBe('-0.01')
  })

  test('omits the currency, which the surrounding copy supplies', () => {
    // The client writes prices as "$" but means BND, so callers write
    // "BND {formatCents(x)}" rather than rendering an ambiguous dollar sign.
    expect(formatCents(44200)).not.toMatch(/[$A-Za-z]/)
  })

  test('round-trips a parsed amount', () => {
    expect(formatCents(centsFromInput('442.05')!)).toBe('442.05')
  })
})
