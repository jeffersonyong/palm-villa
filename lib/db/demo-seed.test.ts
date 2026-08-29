import { describe, expect, test } from 'vitest'

import { isFree } from '@/lib/domain/availability'
import { BOOKING_STATUSES } from '@/lib/domain/booking-state'
import { totalOf } from '@/lib/domain/lines'

import { buildDemoBookings } from './demo-seed'
import { units } from './fixtures'

/**
 * The demo seed is throwaway, but it feeds every list screen in development, so
 * the properties that make those screens trustworthy are worth pinning: it must
 * be deterministic, its statuses must be reachable, and it must not describe a
 * building where two guests hold the same unit on the same night.
 */

// Fixed so the suite does not depend on the day it runs.
const TODAY = '2026-08-28'

describe('buildDemoBookings', () => {
  test('produces bookings without hitting an illegal transition or price error', () => {
    const bookings = buildDemoBookings(TODAY, units)

    expect(bookings.length).toBeGreaterThan(0)
    for (const booking of bookings) {
      expect(BOOKING_STATUSES).toContain(booking.status)
    }
  })

  test('is deterministic for a given day', () => {
    expect(buildDemoBookings(TODAY, units)).toEqual(buildDemoBookings(TODAY, units))
  })

  test('gives every booking a unique reference in the PV-0000 format', () => {
    const references = buildDemoBookings(TODAY, units).map((booking) => booking.reference)

    for (const reference of references) {
      expect(reference).toMatch(/^PV-\d{4}$/)
    }
    expect(new Set(references).size).toBe(references.length)
  })

  test('never double-books a unit', () => {
    const bookings = buildDemoBookings(TODAY, units)

    for (const unit of units) {
      const ranges = bookings
        .filter((booking) => booking.unitId === unit.id)
        .map((booking) => booking.range)

      // Each range must be free of every range placed before it.
      ranges.forEach((range, index) => {
        expect(isFree(range, ranges.slice(0, index))).toBe(true)
      })
    }
  })

  test('totals agree with their own lines', () => {
    for (const booking of buildDemoBookings(TODAY, units)) {
      expect(booking.total).toBe(totalOf(booking.lines))
    }
  })

  test('populates the screens: an arrival, a departure and something awaiting payment', () => {
    const bookings = buildDemoBookings(TODAY, units)

    expect(bookings.some((b) => b.status === 'confirmed' && b.range.start === TODAY)).toBe(true)
    expect(bookings.some((b) => b.status === 'checked_in' && b.range.end === TODAY)).toBe(true)
    expect(bookings.some((b) => b.status === 'awaiting_payment_verification')).toBe(true)
  })

  test('includes a booking priced above the base rate, so a total is itemised', () => {
    const bookings = buildDemoBookings(TODAY, units)

    expect(bookings.some((booking) => booking.lines.length > 1)).toBe(true)
  })
})
