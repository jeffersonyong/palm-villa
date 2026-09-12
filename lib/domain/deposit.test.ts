import { describe, expect, test } from 'vitest'

import {
  activeChargesTotal,
  canAddCharge,
  canApproveRelease,
  canTopUp,
  depositFiguresOf,
  depositSecuresBooking,
  depositAtClose,
  depositShortfallOf,
  depositStageOf,
  describeReleaseFailure,
  isDepositOutcome,
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
  collected: true,
  released: false,
  forfeited: false,
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
    expect(depositStageOf(facts({ released: true }))).toBe('released')
  })

  test('an inspection outranks the booking status', () => {
    // Only reachable if a booking were somehow reopened after inspection, which
    // it cannot be — `completed` is terminal. Pinned so the precedence is a
    // decision rather than an accident of ordering.
    expect(depositStageOf(facts({ inspected: true }))).toBe('ready_for_release')
  })

  test('a deposit taken before the guest arrives is held, not in house', () => {
    // The ordinary case since the deposit moved from the door to the booking
    // (prd.md §9.1): the money sits on the ledger for days before anybody
    // checks in, and calling that "guest in stay" was the ledger assuming a
    // deposit could only exist because somebody had.
    for (const bookingStatus of ['confirmed', 'held', 'awaiting_payment_verification'] as const) {
      expect(depositStageOf(facts({ bookingStatus }))).toBe('secured')
    }
  })

  test('a promise is awaited whatever the booking is doing', () => {
    expect(depositStageOf(facts({ collected: false, bookingStatus: 'confirmed' }))).toBe(
      'awaiting_verification',
    )
  })

  test('a deposit kept when its booking closed reads as kept', () => {
    // prd.md §9.5 [C]: the guest who cancels or never arrives forfeits it.
    for (const bookingStatus of ['cancelled', 'no_show'] as const) {
      expect(depositStageOf(facts({ bookingStatus, forfeited: true }))).toBe('forfeited')
    }
  })

  test('kept is final: nothing after it moves the stage', () => {
    // Not reachable — a cancelled booking is never inspected — and pinned so
    // the precedence is a decision, the way released's is.
    expect(depositStageOf(facts({ forfeited: true, inspected: true }))).toBe('forfeited')
  })

  test('a promise on a booking that closed without a stay was never received', () => {
    // Not "transfer awaited": nobody is waiting on it any more, the payments
    // queue has dropped it, and a badge saying otherwise on a cancelled booking
    // would send a clerk looking for money the product has stopped expecting.
    for (const bookingStatus of ['cancelled', 'no_show', 'expired'] as const) {
      expect(depositStageOf(facts({ collected: false, bookingStatus }))).toBe('lapsed')
    }
  })

  test('a deposit held on a booking closed before forfeiture existed still reads as held', () => {
    // Only a row written before 22 September 2026 can be here: closing a
    // booking now settles its deposit in the same transaction. The money is
    // still in the safe and the guest never arrived, which is what it says.
    for (const bookingStatus of ['cancelled', 'no_show', 'expired'] as const) {
      expect(depositStageOf(facts({ bookingStatus }))).toBe('secured')
    }
  })

  test.each<[DepositStage, DepositStageFacts]>([
    ['secured', facts({ bookingStatus: 'confirmed' })],
    ['in_house', facts({ bookingStatus: 'checked_in' })],
    ['awaiting_inspection', facts({ bookingStatus: 'completed' })],
  ])('reads as %s', (expected, given) => {
    expect(depositStageOf(given)).toBe(expected)
  })
})

describe('isDepositStage', () => {
  test.each([
    'secured',
    'in_house',
    'awaiting_inspection',
    'ready_for_release',
    'released',
    'forfeited',
    'lapsed',
  ])('%s is a stage', (value) => {
    expect(isDepositStage(value)).toBe(true)
  })

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
    expect(canApproveRelease(facts({ released: true }))).toMatchObject({
      ok: false,
      error: { code: 'already_released' },
    })
  })

  test('the check-out refusal outranks the missing inspection', () => {
    // Both are true of an in-house guest. The actionable one is the stay, since
    // an inspection cannot be recorded until the guest has left anyway.
    expect(canApproveRelease(facts())).toMatchObject({
      ok: false,
      error: { code: 'booking_not_completed' },
    })
  })

  test('a kept deposit is never released, and says it was kept', () => {
    expect(canApproveRelease(facts({ bookingStatus: 'cancelled', forfeited: true }))).toMatchObject(
      { ok: false, error: { code: 'already_forfeited' } },
    )
  })

  test('a booking that closed without a stay is not told to wait for a check-out', () => {
    // Only a deposit held on a booking closed before forfeiture existed. "The
    // guest has not checked out yet" would be untrue — they are never coming.
    for (const bookingStatus of ['cancelled', 'no_show', 'expired'] as const) {
      expect(canApproveRelease(facts({ bookingStatus }))).toMatchObject({
        ok: false,
        error: { code: 'booking_closed' },
      })
    }
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

  test('so does keeping it — nothing is deducted from money the business has kept', () => {
    expect(canAddCharge(facts({ bookingStatus: 'cancelled', forfeited: true }))).toBe(false)
  })

  test('a booking that closed without a stay takes no charge, even with a deposit still held', () => {
    // A deposit left held on a booking cancelled before forfeiture existed:
    // its release is refused (`booking_closed`), so a charge raised against it
    // could never be settled and would stand on the ledger for good.
    for (const bookingStatus of ['cancelled', 'no_show', 'expired'] as const) {
      expect(canAddCharge(facts({ bookingStatus }))).toBe(false)
    }
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
  test.each([
    'already_released',
    'already_forfeited',
    'booking_closed',
    'inspection_missing',
    'booking_not_completed',
  ])('%s reads the same as the screen’s own refusal', (code) => {
    expect(describeReleaseFailure(code).code).toBe(code)
    expect(describeReleaseFailure(code).message.length).toBeGreaterThan(0)
  })

  test('an unmapped code still produces a sentence a clerk can act on', () => {
    // A guard nobody mapped is a bug to find, and a blank dialog is how it
    // stays unfound.
    expect(describeReleaseFailure('something_new').message).toContain('Reload')
  })
})

describe('depositShortfallOf', () => {
  test('a deposit held for the quoted figure is short of nothing', () => {
    expect(depositShortfallOf(DEPOSIT, DEPOSIT, true)).toBe(0)
  })

  test('a deposit held for less is short of the difference', () => {
    // The case this exists for: a guest who sent BND 50 of the BND 100 now
    // and meant to send the rest on Friday.
    expect(depositShortfallOf(DEPOSIT, bnd(50), true)).toBe(bnd(50))
  })

  test('an over-held deposit is short of nothing rather than negative', () => {
    expect(depositShortfallOf(DEPOSIT, bnd(150), true)).toBe(0)
  })

  test('a promise is never short, whatever it carries', () => {
    // A transfer nobody has checked is worth nothing yet, so the gap between
    // it and the quote is money unverified rather than money missing — which
    // the `awaiting_verification` stage already says. Reading one as the other
    // would flag every deposit the moment a customer pressed their own button.
    expect(depositShortfallOf(DEPOSIT, bnd(50), false)).toBe(0)
    expect(depositShortfallOf(DEPOSIT, DEPOSIT, false)).toBe(0)
  })

  test('a booking quoting nothing is short of nothing', () => {
    expect(depositShortfallOf(0, 0, true)).toBe(0)
  })
})

describe('depositSecuresBooking', () => {
  test('a booking quoting no deposit is secured whatever is held', () => {
    expect(depositSecuresBooking({ quoted: 0, held: 0, collected: false })).toBe(true)
  })

  test('the quoted figure held in full secures it, and so does more', () => {
    expect(depositSecuresBooking({ quoted: DEPOSIT, held: DEPOSIT, collected: true })).toBe(true)
    expect(depositSecuresBooking({ quoted: DEPOSIT, held: bnd(150), collected: true })).toBe(true)
  })

  test('a deposit that arrived short secures nothing', () => {
    expect(depositSecuresBooking({ quoted: DEPOSIT, held: bnd(50), collected: true })).toBe(false)
  })

  test('a promise carrying the whole figure still secures nothing', () => {
    // The reason `collected` is a separate fact from `held`: a promised row
    // carries the full quoted figure and the property is holding none of it.
    expect(depositSecuresBooking({ quoted: DEPOSIT, held: DEPOSIT, collected: false })).toBe(false)
  })
})

describe('canTopUp', () => {
  const short = {
    closed: false,
    recorded: true,
    collected: true,
    released: false,
    shortfall: bnd(50),
  }

  test('a collected deposit short of its quote may be topped up', () => {
    expect(canTopUp(short)).toEqual({ ok: true })
  })

  test('a booking that closed without a stay takes nothing more, whatever else is true', () => {
    // First, because every other refusal names a way to take money — record
    // it, confirm it in the queue — and a closed booking has none.
    for (const facts of [short, { ...short, recorded: false }, { ...short, collected: false }]) {
      const check = canTopUp({ ...facts, closed: true })

      expect(check.ok || check.error.code).toBe('booking_closed')
    }
  })

  test('a booking with no deposit row is sent to record one instead', () => {
    const check = canTopUp({ ...short, recorded: false })

    expect(check.ok).toBe(false)
    expect(check.ok || check.error.code).toBe('not_recorded')
    expect(check.ok || check.error.message).toContain('Record the deposit')
  })

  test('an unverified promise is sent to the queue instead', () => {
    const check = canTopUp({ ...short, collected: false })

    expect(check.ok || check.error.code).toBe('not_collected')
  })

  test('a released deposit says so rather than naming the shortfall', () => {
    // Order matters: once somebody has signed the release the shortfall
    // stopped being collectable, and complaining about it would name the
    // wrong problem.
    const check = canTopUp({ ...short, released: true })

    expect(check.ok || check.error.code).toBe('already_released')
  })

  test('a whole deposit has nothing to top up', () => {
    const check = canTopUp({ ...short, shortfall: 0 })

    expect(check.ok || check.error.code).toBe('nothing_short')
  })
})

describe('a short deposit is not a stage', () => {
  test('it keeps whichever stage the pipeline gives it', () => {
    // The decision this pins: short cuts across all six stages rather than
    // being a seventh, so a deposit can be short and `in_house` at once.
    const collected: DepositStageFacts = {
      collected: true,
      released: false,
      forfeited: false,
      inspected: false,
      bookingStatus: 'confirmed',
    }

    expect(depositStageOf(collected)).toBe('secured')
    expect(depositStageOf({ ...collected, bookingStatus: 'checked_in' })).toBe('in_house')
    expect(depositStageOf({ ...collected, bookingStatus: 'completed' })).toBe('awaiting_inspection')
  })

  test('a short deposit may still be released', () => {
    // You give back what you actually hold, less charges. Refusing the release
    // because the deposit came up short would trap the guest's money forever.
    expect(
      canApproveRelease({
        collected: true,
        released: false,
        forfeited: false,
        inspected: true,
        bookingStatus: 'completed',
      }),
    ).toEqual({ ok: true })
  })
})

describe('depositAtClose', () => {
  /**
   * What cancelling a booking, or marking it a no-show, has to decide about.
   * The dialog words its sentence from this and nothing else, so a clerk is
   * only ever asked to keep or return money that is actually in the safe.
   */
  const held = { amount: DEPOSIT, collected: true, released: false, forfeited: false }

  test('a deposit in the safe is what the close decides about', () => {
    expect(depositAtClose({ quoted: DEPOSIT, waiverReason: null, deposit: held })).toEqual({
      kind: 'held',
      amount: DEPOSIT,
      shortfall: 0,
    })
  })

  test('so is one that arrived short — for what actually arrived', () => {
    expect(
      depositAtClose({
        quoted: DEPOSIT,
        waiverReason: null,
        deposit: { ...held, amount: bnd(50) },
      }),
    ).toEqual({ kind: 'held', amount: bnd(50), shortfall: bnd(50) })
  })

  test('a promise nobody verified holds nothing to keep', () => {
    expect(
      depositAtClose({
        quoted: DEPOSIT,
        waiverReason: null,
        deposit: { ...held, collected: false },
      }),
    ).toEqual({ kind: 'promised' })
  })

  test('a quote with nothing taken against it has nothing to keep', () => {
    expect(depositAtClose({ quoted: DEPOSIT, waiverReason: null, deposit: null })).toEqual({
      kind: 'not_taken',
    })
  })

  test('a waived deposit says why nothing is held', () => {
    expect(
      depositAtClose({ quoted: 0, waiverReason: 'Held under PV-0042', deposit: null }),
    ).toEqual({ kind: 'waived', reason: 'Held under PV-0042' })
  })

  test('a booking quoting nothing has nothing to keep', () => {
    expect(depositAtClose({ quoted: 0, waiverReason: null, deposit: null })).toEqual({
      kind: 'not_quoted',
    })
  })

  test('a deposit already given back or kept is settled, and asks nothing', () => {
    for (const deposit of [
      { ...held, released: true },
      { ...held, forfeited: true },
    ]) {
      expect(depositAtClose({ quoted: DEPOSIT, waiverReason: null, deposit })).toEqual({
        kind: 'settled',
      })
    }
  })
})

describe('isDepositOutcome', () => {
  test.each(['keep', 'return'])('%s is an outcome', (value) => {
    expect(isDepositOutcome(value)).toBe(true)
  })

  test('anything else from a form is refused', () => {
    for (const value of ['', 'KEEP', 'forfeit', null, undefined, 1]) {
      expect(isDepositOutcome(value)).toBe(false)
    }
  })
})
