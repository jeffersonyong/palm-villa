/**
 * Rows per page on the bookings register, and the sizes the footer offers.
 *
 * ── Why these are not in `bookings-pagination.tsx` ─────────────────────────
 *
 * They were, and it broke the screen. That file carries `'use client'`, and
 * every export of a client module reaching a server component is a *client
 * reference* — a proxy Next.js hands the RSC renderer so it can name the
 * module in the payload — not the value itself. The server saw an object where
 * it expected an array, and `PAGE_SIZE_OPTIONS.includes(...)` threw at request
 * time.
 *
 * Nothing catches that earlier: TypeScript types the import as the array it is
 * declared to be, and the query layer's tests never render the page. A plain
 * module with no directive is the fix, because both sides import the same real
 * value.
 *
 * 25 rather than the Staff tab's 10: that table is a dozen accounts an admin
 * visits occasionally, this one is the screen that replaced the spreadsheet and
 * is read by scanning. The options are `Pagination`'s own defaults.
 */

export const DEFAULT_PAGE_SIZE = 25

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const
