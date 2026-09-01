/**
 * Rows per page on the units board, and the sizes the footer offers.
 *
 * A plain module with no `'use client'` directive, for the reason the bookings
 * register's own `page-size.ts` sets out at length: every export of a client
 * module reaching a server component is a client *reference* rather than the
 * value, so `PAGE_SIZE_OPTIONS.includes(...)` would throw at request time.
 *
 * 50 rather than the register's 25. The building is fifty-odd units, so the
 * default shows the whole of it on one page — the board's first job is "what is
 * the state of the building this morning", and paging that answer in halves
 * would be worse than not paging it. The footer is there for the property that
 * outgrows one screen, and for the reader who would rather work in tens.
 */

export const DEFAULT_PAGE_SIZE = 50

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
