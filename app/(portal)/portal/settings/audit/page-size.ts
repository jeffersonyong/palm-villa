/**
 * How many events a page of the audit trail holds.
 *
 * A plain module with no `'use client'`, deliberately: the page reads these on
 * the server and the pagination island reads them in the browser, and a client
 * module's export reaching a server component is a reference rather than a
 * value. The reports screen's `page-size.ts` records the same reason.
 *
 * Twenty-five, matching every other register in the portal. The trail is the
 * densest list in the product — a busy day is a hundred events — so the reader
 * who wants a whole week on one screen reaches for 100 rather than being given
 * it by default.
 */

export const DEFAULT_PAGE_SIZE = 25

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

export function readPage(value: string | undefined): number {
  const page = Number(value)

  return Number.isInteger(page) && page > 0 ? page : 1
}

export function readPageSize(value: string | undefined): number {
  const size = Number(value)

  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE
}
