import { describe, expect, test } from 'vitest'

import {
  allowedEvents,
  BOOKING_STATUSES,
  isTerminal,
  transition,
  type BookingEvent,
  type BookingStatus,
} from './booking-state'

/**
 * State machine tests.
 *
 * Coverage here is mandatory (architecture.md §2). The negative cases matter
 * more than the positive ones: the machine exists to make illegal moves
 * impossible, so the tests that count are the ones asserting a move is refused.
 */

const ALL_STATUSES: readonly BookingStatus[] = [
  'draft',
  'held',
  'awaiting_payment_verification',
  'confirmed',
  'checked_in',
  'completed',
  'expired',
  'cancelled',
  'no_show',
]

const ALL_EVENTS: readonly BookingEvent[] = [
  'hold',
  'submit_payment',
  'verify_payment',
  'pay_in_full',
  'check_in',
  'check_out',
  'expire',
  'cancel',
  'mark_no_show',
]

describe('BOOKING_STATUSES', () => {
  test('lists every status exactly once', () => {
    expect([...BOOKING_STATUSES].sort()).toEqual([...ALL_STATUSES].sort())
  })
})

describe('the happy paths from prd.md §9.2', () => {
  test('public flow: draft → held → awaiting verification → confirmed → checked in → completed', () => {
    const path: readonly [BookingStatus, BookingEvent, BookingStatus][] = [
      ['draft', 'hold', 'held'],
      ['held', 'submit_payment', 'awaiting_payment_verification'],
      ['awaiting_payment_verification', 'verify_payment', 'confirmed'],
      ['confirmed', 'check_in', 'checked_in'],
      ['checked_in', 'check_out', 'completed'],
    ]

    for (const [from, event, expected] of path) {
      const result = transition(from, event)

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.status).toBe(expected)
    }
  })

  test('walk-in flow: draft → confirmed in one action, never passing through held', () => {
    // prd.md §9.4 [C]: the guest is present and pays immediately, so no unit is
    // ever held against an unpaid promise.
    const result = transition('draft', 'pay_in_full')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.status).toBe('confirmed')
  })

  test('a lapsed hold expires', () => {
    const result = transition('held', 'expire')

    expect(result.ok && result.status).toBe('expired')
  })
})

describe('illegal moves are refused', () => {
  test('a booking cannot be confirmed without payment', () => {
    // The only routes to `confirmed` are verify_payment and pay_in_full. There
    // is no "confirm" event, which is what keeps booked-ahead pay-on-arrival
    // out of v1 (prd.md §9.4) structurally rather than by convention.
    const reachesConfirmed = ALL_STATUSES.flatMap((status) =>
      allowedEvents(status)
        .map((event) => ({ status, event, result: transition(status, event) }))
        .filter((entry) => entry.result.ok && entry.result.status === 'confirmed'),
    )

    expect(reachesConfirmed.map((entry) => entry.event).sort()).toEqual([
      'pay_in_full',
      'pay_in_full',
      'verify_payment',
    ])
  })

  test('a checked-in guest cannot be cancelled or marked no-show', () => {
    for (const event of ['cancel', 'mark_no_show'] as const) {
      const result = transition('checked_in', event)

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error.code).toBe('illegal_transition')
    }
  })

  test('a booking cannot be checked in before it is confirmed', () => {
    for (const status of ['draft', 'held', 'awaiting_payment_verification'] as const) {
      expect(transition(status, 'check_in').ok).toBe(false)
    }
  })

  test('a confirmed booking cannot be re-held or re-paid', () => {
    for (const event of ['hold', 'pay_in_full', 'submit_payment'] as const) {
      expect(transition('confirmed', event).ok).toBe(false)
    }
  })
})

describe('terminal states', () => {
  test.each(['completed', 'expired', 'cancelled', 'no_show'] as const)(
    '%s is terminal and refuses every event',
    (status) => {
      expect(isTerminal(status)).toBe(true)
      expect(allowedEvents(status)).toEqual([])

      for (const event of ALL_EVENTS) {
        const result = transition(status, event)

        expect(result.ok).toBe(false)
        if (result.ok) return

        expect(result.error.code).toBe('terminal_state')
      }
    },
  )

  test.each(['draft', 'held', 'awaiting_payment_verification', 'confirmed', 'checked_in'] as const)(
    '%s is not terminal',
    (status) => {
      expect(isTerminal(status)).toBe(false)
      expect(allowedEvents(status).length).toBeGreaterThan(0)
    },
  )

  test('an expired hold cannot be revived — that would be a new booking', () => {
    expect(transition('expired', 'pay_in_full').ok).toBe(false)
  })
})

describe('exhaustive sweep', () => {
  test('every state/event pair either returns a valid status or a typed error', () => {
    for (const status of ALL_STATUSES) {
      for (const event of ALL_EVENTS) {
        const result = transition(status, event)

        if (result.ok) {
          expect(ALL_STATUSES).toContain(result.status)
        } else {
          expect(['illegal_transition', 'terminal_state']).toContain(result.error.code)
          expect(result.error.message.length).toBeGreaterThan(0)
        }
      }
    }
  })

  test('allowedEvents agrees with transition for every pair', () => {
    for (const status of ALL_STATUSES) {
      const allowed = allowedEvents(status)

      for (const event of ALL_EVENTS) {
        expect(transition(status, event).ok).toBe(allowed.includes(event))
      }
    }
  })
})
