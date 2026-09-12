/**
 * How much of the verification queue is shown at once.
 *
 * **No `'use client'` in this file, and that is load-bearing** — see the note
 * on the bookings register's copy for the incident that taught it.
 *
 * 25, matching the register and the cash log. The queue is worked from the top
 * rather than read through, so the first page is nearly always the only one
 * that matters; the footer exists for the settled history beneath it, which
 * accumulates for the life of the building.
 */
export const DEFAULT_PAGE_SIZE = 25

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const

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
