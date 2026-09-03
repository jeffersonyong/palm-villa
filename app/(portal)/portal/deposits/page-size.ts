/**
 * Rows per page in the deposits archive, and the sizes the footer offers.
 *
 * A plain module with no `'use client'` directive, for the reason the bookings
 * register's own `page-size.ts` sets out: every export of a client module
 * reaching a server component is a client *reference* rather than the value,
 * so `PAGE_SIZE_OPTIONS.includes(...)` would throw at request time.
 *
 * 25, like the register and unlike the units board. The board defaults to 50
 * because the building is fifty-odd units and the whole of it is the answer;
 * released deposits accumulate for the life of the property, so a page of them
 * is a page rather than a complete picture.
 */

export const DEFAULT_PAGE_SIZE = 25

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const
