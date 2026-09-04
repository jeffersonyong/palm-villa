import { describe, expect, test } from 'vitest'

import { DEFAULT_PAYMENT_VIEW, readView, sortQueue, statusesForView } from './views'

/**
 * What the queue shows and in what order — tested for the reason the deposits
 * ledger's view is: it turns a string somebody may have typed into which rows
 * appear, and it decides what Finance sees first.
 */

const waiting = (createdAt: string) => ({
  status: 'pending_verification' as const,
  createdAt,
  verifiedAt: null,
})

const verified = (createdAt: string, verifiedAt: string | null = createdAt) => ({
  status: 'verified' as const,
  createdAt,
  verifiedAt,
})

describe('readView', () => {
  test('nothing asked for is everything', () => {
    expect(readView(undefined)).toBe(DEFAULT_PAYMENT_VIEW)
    expect(DEFAULT_PAYMENT_VIEW).toBe('all')
  })

  test('the two narrower views are read back as themselves', () => {
    expect(readView('waiting')).toBe('waiting')
    expect(readView('verified')).toBe('verified')
  })

  test('a hand-edited URL shows the queue rather than erroring', () => {
    expect(readView('nonsense')).toBe('all')
    expect(readView('')).toBe('all')
  })

  test('a repeated param takes the first value', () => {
    expect(readView(['verified', 'waiting'])).toBe('verified')
  })
})

describe('statusesForView', () => {
  test('everything asks for no status at all', () => {
    expect(statusesForView('all')).toEqual([])
  })

  test('the narrower views name their status', () => {
    expect(statusesForView('waiting')).toEqual(['pending_verification'])
    expect(statusesForView('verified')).toEqual(['verified'])
  })
})

describe('sortQueue', () => {
  test('waiting payments come before verified ones, whatever the dates', () => {
    const sorted = sortQueue([
      verified('2026-09-04T10:00:00Z'),
      waiting('2026-09-04T09:00:00Z'),
      verified('2026-09-01T10:00:00Z'),
      waiting('2026-09-02T09:00:00Z'),
    ])

    expect(sorted.map((payment) => payment.status)).toEqual([
      'pending_verification',
      'pending_verification',
      'verified',
      'verified',
    ])
  })

  test('the longest wait is at the top', () => {
    const sorted = sortQueue([
      waiting('2026-09-04T09:00:00Z'),
      waiting('2026-09-01T09:00:00Z'),
      waiting('2026-09-02T09:00:00Z'),
    ])

    expect(sorted.map((payment) => payment.createdAt)).toEqual([
      '2026-09-01T09:00:00Z',
      '2026-09-02T09:00:00Z',
      '2026-09-04T09:00:00Z',
    ])
  })

  test('the most recently verified is first among the verified', () => {
    const sorted = sortQueue([
      verified('2026-09-01T09:00:00Z', '2026-09-02T12:00:00Z'),
      verified('2026-09-01T10:00:00Z', '2026-09-04T12:00:00Z'),
      verified('2026-09-01T11:00:00Z', '2026-09-03T12:00:00Z'),
    ])

    expect(sorted.map((payment) => payment.verifiedAt)).toEqual([
      '2026-09-04T12:00:00Z',
      '2026-09-03T12:00:00Z',
      '2026-09-02T12:00:00Z',
    ])
  })

  test('a verified payment with no verification time falls back to when it was made', () => {
    const sorted = sortQueue([
      verified('2026-09-01T09:00:00Z', null),
      verified('2026-09-03T09:00:00Z', null),
    ])

    expect(sorted[0]?.createdAt).toBe('2026-09-03T09:00:00Z')
  })

  test('does not mutate what it was given', () => {
    const original = [verified('2026-09-04T10:00:00Z'), waiting('2026-09-01T09:00:00Z')]

    sortQueue(original)

    expect(original[0]?.status).toBe('verified')
  })
})
