import { describe, expect, test } from 'vitest'

import { balanceOf, canSettle, describeBalance } from './balance'
import { bnd } from './money'

/**
 * The balance a booking carries.
 *
 * Small arithmetic, mandatory coverage: this figure decides what a clerk is
 * told a guest owes, and it is what a confirmation is matched against — so an
 * error here is a guest charged the wrong amount, not a display fault.
 */

describe('balanceOf', () => {
  test('a booking nobody has paid owes all of it', () => {
    // Arrange / Act
    const balance = balanceOf(bnd(400), 0)

    // Assert
    expect(balance).toEqual({
      total: bnd(400),
      paid: 0,
      outstanding: bnd(400),
      state: 'outstanding',
    })
  })

  test('the case this exists for: paid for one night, extended to two', () => {
    const balance = balanceOf(bnd(400), bnd(200))

    expect(balance.outstanding).toBe(bnd(200))
    expect(balance.state).toBe('outstanding')
  })

  test('a fully paid booking is settled, and owes nothing', () => {
    const balance = balanceOf(bnd(400), bnd(400))

    expect(balance.outstanding).toBe(0)
    expect(balance.state).toBe('settled')
  })

  test('paying more than the booking is worth reads as overpaid, not as settled', () => {
    // Negative, and named. An overpayment is a refund conversation — prd.md
    // §9.6 keeps money movement out of this system — so it must not quietly
    // collapse into "settled" and disappear.
    const balance = balanceOf(bnd(400), bnd(450))

    expect(balance.outstanding).toBe(-bnd(50))
    expect(balance.state).toBe('overpaid')
  })

  test('a comped booking with nothing paid is settled rather than outstanding', () => {
    // A 100% discount takes the total to zero, and zero owed is zero owed.
    expect(balanceOf(0, 0).state).toBe('settled')
  })
})

describe('describeBalance', () => {
  test.each([
    [bnd(1), 'outstanding'],
    [0, 'settled'],
    [-bnd(1), 'overpaid'],
  ])('%d cents reads as %s', (outstanding, expected) => {
    expect(describeBalance(outstanding)).toBe(expected)
  })
})

describe('canSettle', () => {
  test('a booking that owes something can take a payment', () => {
    expect(canSettle(balanceOf(bnd(400), bnd(200)))).toBe(true)
  })

  test('a settled booking cannot', () => {
    expect(canSettle(balanceOf(bnd(400), bnd(400)))).toBe(false)
  })

  test('an overpaid booking cannot — that is a refund, not a payment', () => {
    expect(canSettle(balanceOf(bnd(400), bnd(450)))).toBe(false)
  })
})
