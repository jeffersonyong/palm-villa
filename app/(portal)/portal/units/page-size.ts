/**
 * Rows per page on the units board, and the sizes the footer offers.
 *
 * A plain module with no `'use client'` directive, for the reason the bookings
 * register's own `page-size.ts` sets out at length: every export of a client
 * module reaching a server component is a client *reference* rather than the
 * value, so `PAGE_SIZE_OPTIONS.includes(...)` would throw at request time.
 *
 * 25, the same default as the bookings register and the deposits ledger, so
 * every list screen opens at one size (changed from 50 on 2026-09-04). The
 * board first shipped showing the whole building on one page on the argument
 * that "what is the state of the building this morning" should not be paged;
 * in use the stat strip answers that question before the table does, and
 * fifty rows was a longer scroll than a reader wanting one unit needed. The
 * footer still offers 50 and 100 for anyone who would rather see it whole.
 */

export const DEFAULT_PAGE_SIZE = 25

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
