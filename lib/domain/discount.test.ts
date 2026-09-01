import { describe, expect, test } from 'vitest'

import { parseDiscount, resolveDiscount, subtotalOf, MAX_DISCOUNT_REASON_LENGTH } from './discount'
import { line } from './lines'
import { bnd } from './money'

/**
 * Coverage here is mandatory: this module decides how much money the property
 * gives away, and it is the only place that decides it (architecture.md §2).
 */

const reason = 'Repeat guest, third stay this year'

describe('resolveDiscount — fixed amounts', () => {
  test('takes the stated amount off and returns it as a negative line', () => {
    // Arrange
    const subtotal = bnd(440)

    // Act
    const result = resolveDiscount(subtotal, { kind: 'amount', value: bnd(40), reason })

    // Assert
    expect(result.ok).toBe(true)
    expect(result.ok && result.amount).toBe(bnd(40))
    expect(result.ok && result.line).toEqual({
      type: 'discount',
      description: 'Discount',
      quantity: 1,
      unitPrice: -bnd(40),
      amount: -bnd(40),
    })
  })

  test('allows a discount that lands exactly on the subtotal', () => {
    const result = resolveDiscount(bnd(200), { kind: 'amount', value: bnd(200), reason })

    expect(result.ok).toBe(true)
    expect(result.ok && result.amount).toBe(bnd(200))
  })

  test('refuses a discount worth more than the booking', () => {
    const result = resolveDiscount(bnd(200), { kind: 'amount', value: bnd(201), reason })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe('exceeds_total')
  })
})

describe('resolveDiscount — percentages', () => {
  test('takes the stated percentage of the subtotal', () => {
    const result = resolveDiscount(bnd(440), { kind: 'percent', value: 10, reason })

    expect(result.ok).toBe(true)
    expect(result.ok && result.amount).toBe(bnd(44))
    expect(result.ok && result.line.description).toBe('Discount — 10%')
  })

  test('rounds an odd percentage to the nearest cent', () => {
    // 33% of 100.00 is 33.00; 33% of 100.01 is 33.0033, which must land on a cent.
    const result = resolveDiscount(10001, { kind: 'percent', value: 33, reason })

    expect(result.ok && result.amount).toBe(3300)
  })

  test('a full comp is allowed, and leaves nothing to pay', () => {
    const result = resolveDiscount(bnd(300), { kind: 'percent', value: 100, reason })

    expect(result.ok && result.amount).toBe(bnd(300))
  })

  test('refuses more than 100%', () => {
    const result = resolveDiscount(bnd(300), { kind: 'percent', value: 101, reason })

    expect(!result.ok && result.error.code).toBe('invalid_value')
  })
})

describe('resolveDiscount — what it refuses outright', () => {
  test.each([
    ['zero', 0],
    ['negative', -500],
    ['fractional cents', 10.5],
  ])('refuses a %s value', (_label, value) => {
    const result = resolveDiscount(bnd(440), { kind: 'amount', value, reason })

    expect(!result.ok && result.error.code).toBe('invalid_value')
  })

  test('refuses a missing reason', () => {
    const result = resolveDiscount(bnd(440), { kind: 'amount', value: bnd(40), reason: '' })

    expect(!result.ok && result.error.code).toBe('reason_required')
  })

  test('a reason of only whitespace is no reason at all', () => {
    const result = resolveDiscount(bnd(440), { kind: 'amount', value: bnd(40), reason: '   ' })

    expect(!result.ok && result.error.code).toBe('reason_required')
  })

  test('refuses a reason longer than the column allows', () => {
    const result = resolveDiscount(bnd(440), {
      kind: 'amount',
      value: bnd(40),
      reason: 'x'.repeat(MAX_DISCOUNT_REASON_LENGTH + 1),
    })

    expect(!result.ok && result.error.code).toBe('reason_too_long')
  })
})

describe('subtotalOf', () => {
  test('sums the priced lines and ignores a discount already among them', () => {
    const lines = [
      line('accommodation', '2 nights', 2, bnd(220)),
      line('discount', 'Discount', 1, -bnd(40)),
    ]

    expect(subtotalOf(lines)).toBe(bnd(440))
  })
})

describe('parseDiscount', () => {
  test('"none" is not an error — it is the ordinary case', () => {
    const result = parseDiscount({ kind: 'none', value: '', reason: '' })

    expect(result).toEqual({ ok: true, discount: null })
  })

  test('reads an amount typed in BND as cents', () => {
    const result = parseDiscount({ kind: 'amount', value: '40.50', reason })

    expect(result.ok && result.discount).toEqual({ kind: 'amount', value: 4050, reason })
  })

  test('reads a whole percentage', () => {
    const result = parseDiscount({ kind: 'percent', value: '15', reason })

    expect(result.ok && result.discount).toEqual({ kind: 'percent', value: 15, reason })
  })

  test('trims the reason it stores', () => {
    const result = parseDiscount({ kind: 'amount', value: '40', reason: `  ${reason}  ` })

    expect(result.ok && result.discount?.reason).toBe(reason)
  })

  test.each([
    ['a percentage sign', '10%'],
    ['a fraction of a percent', '10.5'],
    ['words', 'ten'],
    ['zero', '0'],
    ['over a hundred', '150'],
  ])('refuses %s as a percentage', (_label, value) => {
    const result = parseDiscount({ kind: 'percent', value, reason })

    expect(!result.ok && result.error.field).toBe('discountValue')
  })

  test.each([
    ['a currency symbol', '$40'],
    ['a grouping comma', '1,000'],
    ['three decimal places', '40.000'],
  ])('refuses %s as an amount', (_label, value) => {
    const result = parseDiscount({ kind: 'amount', value, reason })

    expect(!result.ok && result.error.field).toBe('discountValue')
  })

  test('refuses a discount with no reason, and says which field', () => {
    const result = parseDiscount({ kind: 'amount', value: '40', reason: '   ' })

    expect(!result.ok && result.error.field).toBe('discountReason')
  })

  test('refuses a kind it does not recognise', () => {
    const result = parseDiscount({ kind: 'free', value: '40', reason })

    expect(!result.ok && result.error.field).toBe('discountKind')
  })
})
