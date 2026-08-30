import { describe, expect, test } from 'vitest'

import { formatStayRange, formatTimestamp } from './dates'

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

describe('formatStayRange', () => {
  test('a single day is written once', () => {
    expect(formatStayRange('2026-09-12', '2026-09-12')).toBe('12 Sept 2026')
  })

  test('within one month, the month and year are written once', () => {
    expect(formatStayRange('2026-09-01', '2026-09-07')).toBe('1 – 7 Sept 2026')
  })

  test('within one year, the year is written once', () => {
    expect(formatStayRange('2026-09-28', '2026-10-04')).toBe('28 Sept – 4 Oct 2026')
  })

  test('across a year boundary, both ends are spelt out in full', () => {
    expect(formatStayRange('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027')
  })

  test('refuses a range that ends before it starts', () => {
    expect(() => formatStayRange('2026-09-07', '2026-09-01')).toThrow(/ends before it starts/)
  })

  test('refuses a malformed date', () => {
    expect(() => formatStayRange('2026-02-30', '2026-03-04')).toThrow(/valid calendar date/)
  })
})
