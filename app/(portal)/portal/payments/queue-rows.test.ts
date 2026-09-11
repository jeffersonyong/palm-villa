import { describe, expect, test } from 'vitest'

import type { Deposit } from '@/lib/db/deposits'
import type { Payment } from '@/lib/db/payments'
import { bnd } from '@/lib/domain/money'

import { buildQueue, countWaiting, depositEntry, paymentEntry } from './queue-rows'

/**
 * Two kinds of money, one queue (capability B4, extended by B16).
 *
 * The ordering is the screen's whole behaviour: a clerk works from the top,
 * and a queue that sorts wrong leaves somebody waiting longer than the person
 * above them. What these prove is that a promised deposit takes its place in
 * that order by when it was promised, rather than being stacked underneath the
 * payments where the oldest thing on the screen would not be at the top.
 */

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    bookingId: 'booking-1',
    bookingReference: 'PV-4821',
    guestName: 'Ahmad',
    guestPhone: '+673 111',
    method: 'bank_transfer',
    status: 'pending_verification',
    expected: bnd(600),
    due: bnd(600),
    amount: null,
    observedReference: null,
    observedSender: null,
    observedOn: null,
    matchKind: null,
    amountOverrideReason: null,
    matchReason: null,
    collectedBy: null,
    collectedAt: null,
    verifiedBy: null,
    verifiedAt: null,
    createdAt: '2026-09-10T02:00:00Z',
    slipDocumentId: null,
    checkIn: '2026-09-20',
    passDate: null,
    unitRef: '3B-01',
    bookingStream: 'short_stay',
    ...overrides,
  } as Payment
}

function deposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: 'dep-1',
    bookingId: 'booking-2',
    bookingReference: 'PV-4822',
    bookingStatus: 'awaiting_payment_verification',
    guestName: 'Siti',
    guestPhone: '+673 222',
    stay: {
      occupancyId: 'occ-1',
      unitId: 'unit-1',
      unitRef: '4B-02',
      range: { start: '2026-09-25', end: '2026-09-28' },
    },
    amount: bnd(100),
    method: 'bank_transfer',
    collectedBy: null,
    collectedAt: null,
    promisedAt: '2026-09-10T01:00:00Z',
    observed: null,
    overrideReason: null,
    inspection: null,
    charges: 0,
    chargeCount: 0,
    release: null,
    settlement: null,
    stage: 'awaiting_verification',
    figures: { held: bnd(100), charges: 0, returned: bnd(100), owed: 0 },
    quoted: bnd(100),
    shortfall: 0,
    ...overrides,
  } as Deposit
}

describe('flattening a payment', () => {
  test('shows a day pass its own date, since it has no check-in', () => {
    // prd.md §6.1: a day pass occupies no unit, so `check_in` is null on the
    // view. Before the pass had a date of its own the queue drew an em dash.
    const entry = paymentEntry(
      payment({ checkIn: null, passDate: '2026-10-02', bookingStream: 'day_pass' }),
    )

    expect(entry.arriving).toBe('2026-10-02')
  })

  test('prefers the stay date where there is one', () => {
    expect(paymentEntry(payment()).arriving).toBe('2026-09-20')
  })
})

describe('flattening a promised deposit', () => {
  test('waits from when the customer said they had sent it', () => {
    const entry = depositEntry(deposit())

    expect(entry.createdAt).toBe('2026-09-10T01:00:00Z')
    expect(entry.status).toBe('pending_verification')
  })

  test('is matched against what the booking quoted', () => {
    const entry = depositEntry(deposit())

    expect(entry.due).toBe(bnd(100))
    expect(entry.expected).toBe(bnd(100))
    // Nobody has looked yet, which is the whole reason it is in this queue.
    expect(entry.amount).toBeNull()
  })

  test('follows the quote when an amendment repriced it, not the row', () => {
    // `verify_deposit()` matches against `booking.security_deposit_cents` read
    // live under the row lock, so a dialog pre-filled from the deposit's own
    // figure would be refused for a discrepancy nobody could see.
    const entry = depositEntry(deposit({ amount: bnd(100), quoted: bnd(150) }))

    expect(entry.due).toBe(bnd(150))
    expect(entry.expected).toBe(bnd(150))
  })

  test('carries no slip, because a document hangs off a payment', () => {
    expect(depositEntry(deposit()).slipDocumentId).toBeNull()
  })
})

describe('the queue as one list', () => {
  test('sorts a promised deposit among the payments by how long it has waited', () => {
    const queue = buildQueue(
      [payment({ id: 'newer', createdAt: '2026-09-10T03:00:00Z' })],
      [deposit({ id: 'older', promisedAt: '2026-09-10T01:00:00Z' })],
      'all',
    )

    // Oldest first: the deposit has been waiting two hours longer, so it is
    // the one somebody should deal with next.
    expect(queue.map((entry) => entry.id)).toEqual(['older', 'newer'])
  })

  test('puts everything waiting above everything verified', () => {
    const queue = buildQueue(
      [
        payment({
          id: 'settled',
          status: 'verified',
          amount: bnd(600),
          verifiedAt: '2026-09-11T00:00:00Z',
        }),
      ],
      [deposit({ id: 'promised' })],
      'all',
    )

    expect(queue.map((entry) => entry.id)).toEqual(['promised', 'settled'])
  })

  test('the verified view holds no deposits at all', () => {
    // A verified deposit leaves this queue for the ledger, which is the screen
    // that answers what the property holds. A verified payment stays, because
    // the queue's second half is the only log of one there is.
    const queue = buildQueue([payment({ status: 'verified' })], [deposit()], 'verified')

    expect(queue.every((entry) => entry.kind === 'payment')).toBe(true)
  })

  test('counts what is still waiting on somebody', () => {
    const queue = buildQueue(
      [payment({ id: 'a' }), payment({ id: 'b', status: 'verified' })],
      [deposit()],
      'all',
    )

    expect(countWaiting(queue)).toBe(2)
  })

  test('keys a row by kind as well as id, so two tables cannot collide', () => {
    // Both ids are uuids from different tables. Nothing stops them being equal
    // in principle, and a duplicate React key silently drops a row from a
    // queue whose whole job is that nothing is missed.
    const queue = buildQueue([payment({ id: 'same' })], [deposit({ id: 'same' })], 'all')

    expect(new Set(queue.map((entry) => `${entry.kind}-${entry.id}`)).size).toBe(2)
  })
})
