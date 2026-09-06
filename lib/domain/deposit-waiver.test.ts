import { describe, expect, test } from 'vitest'

import { MAX_DEPOSIT_WAIVER_REASON_LENGTH, parseDepositWaiver } from './deposit-waiver'

/**
 * The one rule this module owns: a waived deposit has a reason, and an
 * unwaived one has nothing to say. Mandatory coverage (architecture.md §2) —
 * a waiver decides that BND 100 is not taken from a guest.
 */
describe('parseDepositWaiver', () => {
  test('an unticked box is no waiver, whatever the reason field holds', () => {
    expect(parseDepositWaiver({ waive: 'false', reason: '' })).toEqual({ ok: true, reason: null })
    expect(parseDepositWaiver({ waive: 'false', reason: 'typed then unticked' })).toEqual({
      ok: true,
      reason: null,
    })
  })

  test('anything other than the literal true is read as not waived', () => {
    expect(parseDepositWaiver({ waive: 'on', reason: 'x' })).toEqual({ ok: true, reason: null })
    expect(parseDepositWaiver({ waive: '', reason: 'x' })).toEqual({ ok: true, reason: null })
  })

  test('a waiver keeps its reason, trimmed', () => {
    expect(
      parseDepositWaiver({ waive: 'true', reason: '  Extends PV-1234, deposit held there  ' }),
    ).toEqual({ ok: true, reason: 'Extends PV-1234, deposit held there' })
  })

  test('a waiver with no reason is refused against the reason field', () => {
    const result = parseDepositWaiver({ waive: 'true', reason: '   ' })

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.error.field).toBe('depositWaiverReason')
      expect(result.error.message).toMatch(/why/i)
    }
  })

  test('a reason at the ceiling is accepted and one over it is refused', () => {
    const atLimit = 'x'.repeat(MAX_DEPOSIT_WAIVER_REASON_LENGTH)
    const overLimit = 'x'.repeat(MAX_DEPOSIT_WAIVER_REASON_LENGTH + 1)

    expect(parseDepositWaiver({ waive: 'true', reason: atLimit })).toEqual({
      ok: true,
      reason: atLimit,
    })

    const result = parseDepositWaiver({ waive: 'true', reason: overLimit })

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.error.message).toContain(String(MAX_DEPOSIT_WAIVER_REASON_LENGTH))
    }
  })
})
