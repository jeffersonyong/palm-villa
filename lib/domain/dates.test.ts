import { describe, expect, test } from 'vitest'

import { formatTimestamp } from './dates'

/**
 * Timestamps are rendered in the property's timezone, not the reader's.
 *
 * An audit trail read in Brunei that silently renders in the browser's locale
 * would put an event on the wrong day for anyone reviewing it from elsewhere —
 * and the whole point of the trail is agreeing on when something happened.
 */
describe('formatTimestamp', () => {
  test('renders an instant in Asia/Brunei rather than UTC', () => {
    // 23:30 UTC is 07:30 the next morning in Brunei (UTC+8).
    expect(formatTimestamp('2026-09-14T23:30:00Z')).toBe('15 Sept 2026, 07:30')
  })

  test('keeps a 24-hour clock, so 13:05 is never 1:05', () => {
    expect(formatTimestamp('2026-09-14T05:05:00Z')).toBe('14 Sept 2026, 13:05')
  })

  test('survives the microsecond precision Postgres returns', () => {
    expect(formatTimestamp('2026-09-14T05:05:00.123456+00:00')).toBe('14 Sept 2026, 13:05')
  })
})
