import { describe, expect, test } from 'vitest'

import { bnd } from './money'
import {
  amountVariance,
  checkPaymentMatch,
  describeVariance,
  requiresReasons,
  type PaymentMatchInput,
} from './payment-match'

/**
 * Payment matching tests.
 *
 * Coverage here is mandatory (architecture.md §2), and as with the state
 * machine the refusals are the point: this module exists so that scope B5's
 * "a short payment is flagged, never silently accepted" is true of the code
 * and not just of the proposal.
 */

const DUE = bnd(442)

function input(overrides: Partial<PaymentMatchInput> = {}): PaymentMatchInput {
  return {
    dueCents: DUE,
    observedCents: DUE,
    match: 'reference',
    amountOverrideReason: null,
    matchReason: null,
    ...overrides,
  }
}

describe('amountVariance', () => {
  test('is negative when short, positive when over, zero when exact', () => {
    expect(amountVariance(bnd(442), bnd(400))).toBe(-4200)
    expect(amountVariance(bnd(442), bnd(500))).toBe(5800)
    expect(amountVariance(bnd(442), bnd(442))).toBe(0)
  })

  test('resolves to the cent', () => {
    // Money is integer cents precisely so that a one-cent difference is a
    // difference. A float-based engine would round this away.
    expect(amountVariance(44200, 44199)).toBe(-1)
  })
})

describe('describeVariance', () => {
  test.each([
    [0, 'exact'],
    [-1, 'short'],
    [-4200, 'short'],
    [1, 'over'],
    [5800, 'over'],
  ] as const)('%i is %s', (variance, expected) => {
    expect(describeVariance(variance)).toBe(expected)
  })
})

describe('requiresReasons', () => {
  test('asks for nothing when the amount is exact and the reference matched', () => {
    expect(requiresReasons({ dueCents: DUE, observedCents: DUE, match: 'reference' })).toEqual({
      amount: false,
      match: false,
    })
  })

  test('the two axes are independent, and both can be required at once', () => {
    // A transfer with no reference that is also short is one click carrying
    // two separate justifications.
    expect(requiresReasons({ dueCents: DUE, observedCents: bnd(400), match: 'manual' })).toEqual({
      amount: true,
      match: true,
    })
  })
})

describe('checkPaymentMatch', () => {
  test('confirms an exact amount matched on reference, with no reasons needed', () => {
    const result = checkPaymentMatch(input())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.variance).toBe(0)
    expect(result.kind).toBe('exact')
    expect(result.overridden).toBe(false)
  })

  /**
   * The headline case. scope-of-capabilities.md B5 is a promise to the client
   * in writing: "a short payment is flagged, never silently accepted". This
   * test is the evidence for it, and the database CHECK constraint
   * `payment_mismatch_needs_reason` is the second line of the same defence.
   */
  test('REFUSES a short payment with no reason', () => {
    const result = checkPaymentMatch(input({ observedCents: bnd(400) }))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('reason_required')
    expect(result.error.field).toBe('amountOverrideReason')
  })

  test('refuses a payment short by a single cent', () => {
    // No tolerance band. A near-miss is still a discrepancy someone must
    // account for, and a threshold would be a policy nobody has set.
    expect(checkPaymentMatch(input({ observedCents: DUE - 1 })).ok).toBe(false)
  })

  test('refuses a whitespace-only reason', () => {
    // Trimming is part of the rule, not the form's job: three spaces satisfy
    // `required` in a browser and satisfy nobody reading the audit trail.
    const result = checkPaymentMatch(
      input({ observedCents: bnd(400), amountOverrideReason: '   ' }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.field).toBe('amountOverrideReason')
  })

  test('confirms a short payment once a reason is given', () => {
    const result = checkPaymentMatch(
      input({ observedCents: bnd(400), amountOverrideReason: 'Guest paid the balance in cash.' }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.variance).toBe(-4200)
    expect(result.kind).toBe('short')
    expect(result.overridden).toBe(true)
  })

  /**
   * prd.md §10.4 names only the short case, because that is the one that loses
   * money. An overpayment is a refund conversation, and refunds are §18 N5 —
   * open. Confirming one silently would be the system taking a position on N5
   * that nobody has given it, so it is refused just as firmly.
   */
  test('REFUSES an over-payment with no reason', () => {
    const result = checkPaymentMatch(input({ observedCents: bnd(500) }))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.field).toBe('amountOverrideReason')
  })

  test('confirms an over-payment once a reason is given', () => {
    const result = checkPaymentMatch(
      input({
        observedCents: bnd(500),
        amountOverrideReason: 'Guest transferred the deposit too.',
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.kind).toBe('over')
    expect(result.overridden).toBe(true)
  })

  test('refuses a manual match with no reason, even when the amount is exact', () => {
    const result = checkPaymentMatch(input({ match: 'manual' }))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.field).toBe('matchReason')
  })

  test('confirms a manual match once a reason is given', () => {
    const result = checkPaymentMatch(
      input({
        match: 'manual',
        matchReason: 'Sender name matches the guest; no reference quoted.',
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.overridden).toBe(false)
  })

  test('a manual match that is also short needs both reasons, and names the missing one', () => {
    const missingAmount = checkPaymentMatch(
      input({ observedCents: bnd(400), match: 'manual', matchReason: 'Sender name matches.' }),
    )

    expect(missingAmount.ok).toBe(false)
    if (missingAmount.ok) return
    expect(missingAmount.error.field).toBe('amountOverrideReason')

    const missingMatch = checkPaymentMatch(
      input({
        observedCents: bnd(400),
        match: 'manual',
        amountOverrideReason: 'Short by agreement.',
      }),
    )

    expect(missingMatch.ok).toBe(false)
    if (missingMatch.ok) return
    expect(missingMatch.error.field).toBe('matchReason')
  })

  test('confirms a manual match that is also short when both reasons are given', () => {
    const result = checkPaymentMatch(
      input({
        observedCents: bnd(400),
        match: 'manual',
        amountOverrideReason: 'Balance to follow in cash.',
        matchReason: 'No reference quoted; sender name matches the guest.',
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.kind).toBe('short')
    expect(result.overridden).toBe(true)
  })

  test('every refusal carries a message a staff member can act on', () => {
    const refusals = [
      input({ observedCents: bnd(400) }),
      input({ observedCents: bnd(500) }),
      input({ match: 'manual' }),
    ].map(checkPaymentMatch)

    for (const result of refusals) {
      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error.message.length).toBeGreaterThan(0)
    }
  })
})
