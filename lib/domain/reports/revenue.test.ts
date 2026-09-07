import { describe, expect, test } from 'vitest'

import { bnd } from '../money'
import {
  revenueByStream,
  revenueDateOf,
  revenueInWindow,
  type DatedRevenue,
  type RevenueSource,
} from './revenue'

function payment(overrides: Partial<RevenueSource> = {}): RevenueSource {
  return {
    stream: 'short_stay',
    method: 'cash',
    status: 'verified',
    amount: bnd(200),
    collectedAt: '2026-09-06T03:00:00Z',
    observedOn: null,
    verifiedAt: '2026-09-06T03:00:00Z',
    ...overrides,
  }
}

const WINDOW = { from: '2026-09-01', to: '2026-09-30' } as const

describe('revenueDateOf', () => {
  test('cash lands on the Brunei day it was collected', () => {
    // 23:30 UTC is already the next morning at the desk.
    expect(revenueDateOf(payment({ collectedAt: '2026-09-06T23:30:00Z' }))).toBe('2026-09-07')
  })

  test('a transfer lands on the date read off the bank, not the day it was checked', () => {
    const transfer = payment({
      method: 'bank_transfer',
      collectedAt: null,
      observedOn: '2026-09-02',
      verifiedAt: '2026-09-05T02:00:00Z',
    })

    expect(revenueDateOf(transfer)).toBe('2026-09-02')
  })

  test('a transfer with no observed date falls back to the day it was verified', () => {
    // verify_payment() takes `p_observed_on` as an optional parameter, so this
    // is a real row rather than a defensive branch.
    const transfer = payment({
      method: 'bank_transfer',
      collectedAt: null,
      observedOn: null,
      verifiedAt: '2026-09-05T02:00:00Z',
    })

    expect(revenueDateOf(transfer)).toBe('2026-09-05')
  })

  test('a promise is not money: an unverified payment has no date', () => {
    expect(revenueDateOf(payment({ status: 'pending_verification', amount: null }))).toBeNull()
  })

  test('a verified payment nobody has put an amount against has no date either', () => {
    expect(revenueDateOf(payment({ amount: null }))).toBeNull()
  })
})

describe('revenueInWindow', () => {
  test('keeps the payments whose money landed inside the window, both ends included', () => {
    const payments = [
      payment({ collectedAt: '2026-08-31T20:00:00Z' }), // 1 Sept in Brunei — in
      payment({ collectedAt: '2026-08-31T02:00:00Z' }), // 31 Aug — out
      payment({ method: 'bank_transfer', collectedAt: null, observedOn: '2026-09-30' }), // in
      payment({ method: 'bank_transfer', collectedAt: null, observedOn: '2026-10-01' }), // out
    ]

    expect(revenueInWindow(payments, WINDOW).map((row) => row.date)).toEqual([
      '2026-09-01',
      '2026-09-30',
    ])
  })

  test('drops what is not money at all', () => {
    const pending = payment({ status: 'pending_verification', amount: null })

    expect(revenueInWindow([pending], WINDOW)).toEqual([])
  })
})

describe('revenueByStream', () => {
  const dated = (overrides: Partial<RevenueSource>): DatedRevenue =>
    revenueInWindow([payment(overrides)], WINDOW)[0] as DatedRevenue

  test('splits each stream by method and totals both ways', () => {
    const matrix = revenueByStream([
      dated({ amount: bnd(200) }),
      dated({
        amount: bnd(400),
        method: 'bank_transfer',
        collectedAt: null,
        observedOn: '2026-09-04',
      }),
      dated({ amount: bnd(20), stream: 'day_pass' }),
    ])

    expect(matrix.byStream[0]).toMatchObject({
      stream: 'short_stay',
      byMethod: { cash: bnd(200), bank_transfer: bnd(400) },
      total: bnd(600),
      count: 2,
    })
    expect(matrix.byStream[1]).toMatchObject({ stream: 'day_pass', total: bnd(20), count: 1 })
    expect(matrix.byMethod).toEqual({ cash: bnd(220), bank_transfer: bnd(400) })
    expect(matrix.total).toBe(bnd(620))
  })

  test('every stream is present at zero, so an empty one reads as nil not as missing', () => {
    const matrix = revenueByStream([])

    expect(matrix.byStream.map((row) => row.stream)).toEqual(['short_stay', 'day_pass', 'tenancy'])
    expect(matrix.byStream.every((row) => row.total === 0 && row.count === 0)).toBe(true)
    expect(matrix.total).toBe(0)
  })

  test('tenancy is zero because a lease carries no payments until phase three', () => {
    const matrix = revenueByStream([dated({ amount: bnd(200) })])

    expect(matrix.byStream[2]).toMatchObject({ stream: 'tenancy', total: 0, count: 0 })
  })
})
