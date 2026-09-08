import { describe, expect, test } from 'vitest'

import { BOOKING_STATUSES, type BookingStatus } from './booking-state'
import { bnd } from './money'
import {
  canSubmitTransfer,
  isAccessToken,
  isTransferChoice,
  publicStageOf,
  PUBLIC_LIMITS,
  transferPlanFor,
  type PublicStage,
} from './public-booking'

/**
 * The rules an anonymous caller runs on (capabilities A1–A4).
 *
 * Two of these matter more than they look. `amountDueFor` decides what a
 * customer is asked to transfer and therefore which row the server raises —
 * get it wrong and a guest is asked for BND 600 to secure a room, or the
 * business holds a unit against a day pass it never charged for.
 * `publicStageOf` decides what the page says about somebody's money.
 */

describe('the private link', () => {
  test('accepts what newAccessToken() produces', () => {
    // 16 bytes in base64url is 22 characters from the alphabet below. The same
    // shape is a CHECK constraint on the column, so a token that fails here
    // would be refused by the database too.
    expect(isAccessToken('AAAAAAAAAAAAAAAAAAAAAA')).toBe(true)
    expect(isAccessToken('a-b_c0123456789ABCDEFG')).toBe(true)
  })

  test.each([
    ['', 'empty'],
    ['AAAAAAAAAAAAAAAAAAAAA', '21 characters'],
    ['AAAAAAAAAAAAAAAAAAAAAAA', '23 characters'],
    ['AAAAAAAAAAAAAAAAAAAA==', 'base64 padding'],
    ['AAAAAAAAAAAAAAAAAAAA/+', 'base64 rather than base64url'],
    ["' or 1=1--            ", 'something else entirely'],
  ])('refuses %s (%s)', (value) => {
    expect(isAccessToken(value)).toBe(false)
  })
})

describe('what the customer is asked to transfer', () => {
  const stay = { stream: 'short_stay', total: bnd(600), securityDeposit: bnd(100) } as const

  test('a short stay defaults to the deposit, not to its price', () => {
    // N29, 10 September 2026: the guest transfers the BND 100 to book, and the
    // stay is settled on arrival. Asking for the whole stay by default would
    // be the policy the client reversed.
    expect(transferPlanFor(stay)).toEqual({
      total: bnd(100),
      deposit: bnd(100),
      stay: 0,
      choosable: true,
    })
  })

  test('and can be settled outright, which is the client’s second case', () => {
    // He named both: "the deposit only, or the full amount with the deposit".
    // One transfer of BND 700, and the two parts stay apart underneath.
    expect(transferPlanFor(stay, 'everything')).toEqual({
      total: bnd(700),
      deposit: bnd(100),
      stay: bnd(600),
      choosable: true,
    })
  })

  test('paying everything is not a part payment', () => {
    // N16 is the stay paid in halves and is still out. This is the stay paid
    // in full, sooner — so the stay part is the whole stay, never a fraction.
    const plan = transferPlanFor(stay, 'everything')

    expect(plan.stay).toBe(stay.total)
    expect(plan.deposit + plan.stay).toBe(plan.total)
  })

  test('a day pass is paid for in full, with nothing to choose', () => {
    // There is no unit to secure and prd.md §11 holds the BND 100 against a
    // room, so there is no deposit to defer and no question to ask.
    expect(transferPlanFor({ stream: 'day_pass', total: bnd(25), securityDeposit: 0 })).toEqual({
      total: bnd(25),
      deposit: 0,
      stay: bnd(25),
      choosable: false,
    })
  })

  test('a stay quoting no deposit asks for the whole stay, and offers no choice', () => {
    // Reachable through configuration rather than code: an owner setting the
    // deposit to zero produces the pre-N29 shape, and the unit must not then
    // be held against nothing.
    expect(transferPlanFor({ stream: 'short_stay', total: bnd(600), securityDeposit: 0 })).toEqual({
      total: bnd(600),
      deposit: 0,
      stay: bnd(600),
      choosable: false,
    })
  })

  test('a tenancy is treated as paid in full, not as a deposit', () => {
    // Nothing public sells one, and this is the safe fall-through: a stream
    // this flow does not know is asked for its price rather than silently
    // securing a unit for BND 100.
    expect(
      transferPlanFor({ stream: 'tenancy', total: bnd(1200), securityDeposit: bnd(100) }),
    ).toMatchObject({ total: bnd(1200), choosable: false })
  })

  test('an unasked-for choice cannot change what a day pass costs', () => {
    // The form never offers it, but a hand-written request could send it.
    expect(
      transferPlanFor({ stream: 'day_pass', total: bnd(25), securityDeposit: 0 }, 'everything'),
    ).toMatchObject({ total: bnd(25) })
  })

  test('only the two choices are accepted', () => {
    expect(isTransferChoice('deposit_only')).toBe(true)
    expect(isTransferChoice('everything')).toBe(true)
    expect(isTransferChoice('half')).toBe(false)
    expect(isTransferChoice('')).toBe(false)
  })
})

describe('when the transfer button is offered', () => {
  test('only from held, which is the only status the machine leaves for it', () => {
    expect(canSubmitTransfer('held')).toBe(true)
  })

  test.each(BOOKING_STATUSES.filter((status) => status !== 'held'))('never from %s', (status) => {
    expect(canSubmitTransfer(status)).toBe(false)
  })
})

describe('what the customer is told', () => {
  test.each<[BookingStatus, PublicStage]>([
    ['draft', 'awaiting_transfer'],
    ['held', 'awaiting_transfer'],
    ['awaiting_payment_verification', 'checking'],
    ['confirmed', 'confirmed'],
    ['checked_in', 'confirmed'],
    ['completed', 'confirmed'],
    ['cancelled', 'closed'],
    ['expired', 'closed'],
    ['no_show', 'closed'],
  ])('%s reads as %s', (status, stage) => {
    expect(publicStageOf(status)).toBe(stage)
  })

  test('a guest mid-stay is not told their booking has completed', () => {
    // `checked_in` and `completed` are operational facts about the property.
    // To the person who booked it, the booking is simply good.
    expect(publicStageOf('checked_in')).toBe(publicStageOf('confirmed'))
    expect(publicStageOf('completed')).toBe(publicStageOf('confirmed'))
  })

  test('every status the machine has resolves to a stage', () => {
    // A status with no stage would fall through to whatever the page renders
    // last, which on this surface is somebody's booking.
    for (const status of BOOKING_STATUSES) {
      expect(publicStageOf(status)).toBeTruthy()
    }
  })
})

describe('the limits', () => {
  test('the open-holds cap is the tightest, because inventory is what is at risk', () => {
    // prd.md §9.3's hold is indefinite (N7) and now reachable by anyone with
    // the URL. A request counter slows a script; this is what stops one phone
    // number sitting on the building.
    expect(PUBLIC_LIMITS.openBookingsPerPhone).toBeLessThan(PUBLIC_LIMITS.bookingsPerPhonePerDay)
    expect(PUBLIC_LIMITS.bookingsPerPhonePerDay).toBeLessThan(PUBLIC_LIMITS.bookingsPerIpPerHour)
  })

  test('pressing "I have transferred" is limited far more loosely than booking', () => {
    // It writes no inventory and a customer refreshing a page they are anxious
    // about is the ordinary case.
    expect(PUBLIC_LIMITS.submitsPerIpPerHour).toBeGreaterThan(PUBLIC_LIMITS.bookingsPerIpPerHour)
  })

  test('every limit leaves room for a real customer', () => {
    // A family comparing two date ranges and booking twice must never see a
    // refusal. Two is the number to stay clear of.
    for (const limit of Object.values(PUBLIC_LIMITS)) {
      expect(limit).toBeGreaterThan(2)
    }
  })
})
