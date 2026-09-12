/**
 * How much of the cash log is shown at once.
 *
 * **No `'use client'` in this file, and that is load-bearing.** Every export of
 * a client module reaching a server component arrives as a client *reference* —
 * a proxy Next.js hands the RSC renderer — rather than the value, so
 * `PAGE_SIZE_OPTIONS.includes(...)` would throw at request time with types that
 * say it cannot. The bookings register records the incident that taught this.
 *
 * 25 to match the register and the deposits ledger: a cash log is scanned for a
 * figure somebody half-remembers, and the denser sizes belong to screens read
 * as a report. Until now this table had no footer at all and rendered every
 * cash payment ever taken — which was also the bug, because PostgREST stopped
 * at a thousand of them without saying so.
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
