import { describe, expect, test } from 'vitest'

import {
  activeChargesTotal,
  canAddCharge,
  canApproveRelease,
  depositFiguresOf,
  depositStageOf,
  describeReleaseFailure,
  isDepositStage,
  owedStateOf,
  type DepositStage,
  type DepositStageFacts,
} from './deposit'
import { bnd } from './money'

/**
 * What is held, what is owed, and who may sign it off.
 *
 * Mandatory coverage (architecture.md §2). Two things turn on this module and
 * both are money: the figure a guest is handed back at the end of a stay, and
 * whether a release may be approved at all — which prd.md §11 requirement 4
 * makes the one gated action in the deposit flow. An error in the first
 * short-changes a guest; an error in the second lets a deposit be signed off on
 * a unit nobody has looked at.
 */

const DEPOSIT = bnd(100)

const facts = (overrides: Partial<DepositStageFacts> = {}): DepositStageFacts => ({
  released: false,
  inspected: false,
  bookingStatus: 'checked_in',
  ...overrides,
})

describe('depositStageOf', () => {
  test('a deposit taken from a guest still in the unit is in house', () => {
    // Arrange / Act
    const stage = depositStageOf(facts())

    // Assert
    expect(stage).toBe('in_house')
  })

  test('a departed guest whose unit nobody has looked at is awaiting inspection', () => {
    expect(depositStageOf(facts({ bookingStatus: 'completed' }))).toBe('awaiting_inspection')
  })

  test('once the inspection is recorded the deposit is ready to release', () => {
    expect(depositStageOf(facts({ bookingStatus: 'completed', inspected: true }))).toBe(
      'ready_for_release',
    )
  })

  test('an approved release is the last word', () => {
    expect(
      depositStageOf(facts({ bookingStatus: 'completed', inspected: true, released: true })),
    ).toBe('released')
  })

  test('released outranks every other fact, so a stage can never move backwards', () => {
    // Facts that would otherwise read as `in_house`. A released deposit reads
    // as released whatever else is true of it — the pipeline is one-way, and a
    // deposit that appeared to un-release itself would be a ledger nobody could
    // reconcile.
    expect(depositStageOf({ released: true, inspected: false, bookingStatus: 'checked_in' })).toBe(
      'released',
    )
  })

  test('an inspection outranks the booking status', () => {
    // Only reachable if a booking were somehow reopened after inspection, which
    // it cannot be — `completed` is terminal. Pinned so the precedence is a
    // decision rather than an accident of ordering.
    expect(depositStageOf(facts({ inspected: true }))).toBe('ready_for_release')
  })

  test.each<[DepositStage, DepositStageFacts]>([
    ['in_house', facts({ bookingStatus: 'confirmed' })],
    ['in_house', facts({ bookingStatus: 'checked_in' })],
    ['awaiting_inspection', facts({ bookingStatus: 'completed' })],
  ])('reads as %s', (expected, given) => {
    expect(depositStageOf(given)).toBe(expected)
  })
})

describe('isDepositStage', () => {
  test.each(['in_house', 'awaiting_inspection', 'ready_for_release', 'released'])(
    '%s is a stage',
    (value) => {
      expect(isDepositStage(value)).toBe(true)
    },
  )

  test('"owed" is not a stage — it is a fact about a released deposit', () => {
    expect(isDepositStage('owed')).toBe(false)
  })

  test('rubbish from a URL is refused', () => {
    expect(isDepositStage('')).toBe(false)
    expect(isDepositStage('RELEASED')).toBe(false)
  })
})

describe('depositFiguresOf', () => {
  test('a deposit with nothing against it goes back whole', () => {
    // Arrange / Act
    const figures = depositFiguresOf(DEPOSIT, 0)

    // Assert
    expect(figures).toEqual({
      amount: DEPOSIT,
      chargesTotal: 0,
      releasable: DEPOSIT,
      owed: 0,
    })
  })

  test('charges come off what goes back', () => {
    const figures = depositFiguresOf(DEPOSIT, bnd(30))

    expect(figures.releasable).toBe(bnd(70))
    expect(figures.owed).toBe(0)
  })

  test('charges exactly equal to the deposit leave nothing on either side', () => {
    const figures = depositFiguresOf(DEPOSIT, DEPOSIT)

    expect(figures.releasable).toBe(0)
    expect(figures.owed).toBe(0)
  })

  test('the deposit is not a cap: charges above it become an amount owed', () => {
    // prd.md §11 [C], stated in as many words. The excess is a real figure the
    // product tracks, not an overflow to discard.
    const figures = depositFiguresOf(DEPOSIT, bnd(150))

    expect(figures.releasable).toBe(0)
    expect(figures.owed).toBe(bnd(50))
  })

  test('neither figure is ever negative', () => {
    expect(depositFiguresOf(DEPOSIT, bnd(1000))).toMatchObject({ releasable: 0, owed: bnd(900) })
    expect(depositFiguresOf(0, 0)).toMatchObject({ releasable: 0, owed: 0 })
  })

  test('at most one of the two is non-zero', () => {
    for (const charges of [0, bnd(1), bnd(99), DEPOSIT, bnd(101), bnd(500)]) {
      const figures = depositFiguresOf(DEPOSIT, charges)

      expect(Math.min(figures.releasable, figures.owed)).toBe(0)
    }
  })
})

describe('activeChargesTotal', () => {
  test('no charges is nothing', () => {
    expect(activeChargesTotal([])).toBe(0)
  })

  test('charges sum', () => {
    expect(
      activeChargesTotal([
        { amount: bnd(30), waived: false },
        { amount: bnd(12), waived: false },
      ]),
    ).toBe(bnd(42))
  })

  test('a waived charge counts for nothing but is still a row', () => {
    // The waiver is a decision somebody took under `charge.waive`, so the
    // charge stays on the screen and out of the arithmetic.
    expect(
      activeChargesTotal([
        { amount: bnd(30), waived: false },
        { amount: bnd(500), waived: true },
      ]),
    ).toBe(bnd(30))
  })

  test('every charge waived is the same as none', () => {
    expect(activeChargesTotal([{ amount: bnd(500), waived: true }])).toBe(0)
  })
})

describe('canApproveRelease', () => {
  test('a departed guest whose unit has been inspected can be signed off', () => {
    expect(canApproveRelease(facts({ bookingStatus: 'completed', inspected: true }))).toEqual({
      ok: true,
    })
  })

  test('without an inspection it is refused, and says who records one', () => {
    // prd.md §11 requirement 4, the gate this whole slice is built around.
    const check = canApproveRelease(facts({ bookingStatus: 'completed' }))

    expect(check).toMatchObject({ ok: false, error: { code: 'inspection_missing' } })
    expect(check.ok === false && check.error.message).toContain('Housekeeping')
  })

  test('a guest still in the unit cannot have their deposit released', () => {
    expect(canApproveRelease(facts({ inspected: true }))).toMatchObject({
      ok: false,
      error: { code: 'booking_not_completed' },
    })
  })

  test('an already released deposit says so rather than complaining about anything else', () => {
    // Precedence, and it matters: the second approver of a race needs to be
    // told the release happened, not sent to find an inspection that exists.
    expect(
      canApproveRelease({ released: true, inspected: false, bookingStatus: 'checked_in' }),
    ).toMatchObject({ ok: false, error: { code: 'already_released' } })
  })

  test('the check-out refusal outranks the missing inspection', () => {
    // Both are true of an in-house guest. The actionable one is the stay, since
    // an inspection cannot be recorded until the guest has left anyway.
    expect(canApproveRelease(facts())).toMatchObject({
      ok: false,
      error: { code: 'booking_not_completed' },
    })
  })
})

describe('canAddCharge', () => {
  test('a charge can be raised while the guest is still in the unit', () => {
    expect(canAddCharge(facts())).toBe(true)
  })

  test('and after check-out, before the release is approved', () => {
    expect(canAddCharge(facts({ bookingStatus: 'completed', inspected: true }))).toBe(true)
  })

  test('approval closes the charges — the statement is what was signed', () => {
    expect(canAddCharge(facts({ released: true }))).toBe(false)
  })
})

describe('owedStateOf', () => {
  test('an unreleased deposit owes nothing yet', () => {
    expect(owedStateOf({ released: false, owed: bnd(50), owedSettledAt: null })).toBe('none')
  })

  test('a released deposit with nothing owing is done', () => {
    expect(owedStateOf({ released: true, owed: 0, owedSettledAt: null })).toBe('none')
  })

  test('an excess nobody has paid is owed', () => {
    expect(owedStateOf({ released: true, owed: bnd(50), owedSettledAt: null })).toBe('owed')
  })

  test('once recorded as paid it is settled', () => {
    expect(
      owedStateOf({ released: true, owed: bnd(50), owedSettledAt: '2026-09-06T02:00:00Z' }),
    ).toBe('settled')
  })
})

describe('describeReleaseFailure', () => {
  test.each(['already_released', 'inspection_missing', 'booking_not_completed'])(
    '%s reads the same as the screen’s own refusal',
    (code) => {
      expect(describeReleaseFailure(code).code).toBe(code)
      expect(describeReleaseFailure(code).message.length).toBeGreaterThan(0)
    },
  )

  test('an unmapped code still produces a sentence a clerk can act on', () => {
    // A guard nobody mapped is a bug to find, and a blank dialog is how it
    // stays unfound.
    expect(describeReleaseFailure('something_new').message).toContain('Reload')
  })
})
