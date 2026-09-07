/**
 * Rows per page on the reporting screens, and the sizes their footers offer.
 *
 * A plain module with no `'use client'` directive, for the reason the bookings
 * register's own `page-size.ts` sets out at length: every export of a client
 * module reaching a server component is a client *reference* rather than the
 * value, so `PAGE_SIZE_OPTIONS.includes(...)` would throw at request time.
 *
 * 25, the size every other list screen opens at. Both tables that use it are
 * bounded — one row per unit, one row per day in the period — so neither can
 * grow without limit the way the register does; what pages them is length
 * rather than volume. Forty-eight units and a year of days are both longer
 * than anybody scrolls to answer one question.
 */

export const DEFAULT_PAGE_SIZE = 25

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

/** The requested page, defaulting to the first. */
export function readPage(value: string | undefined): number {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

/** The requested rows-per-page, restricted to the sizes the footer offers. */
export function readPageSize(value: string | undefined): number {
  const parsed = Number(value)

  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_PAGE_SIZE
}
