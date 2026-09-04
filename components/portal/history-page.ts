/**
 * Which page of a record's history a screen is showing, and how to address
 * the others.
 *
 * ── Why a trail is paged, and paged in the URL ────────────────────────────
 *
 * A booking's own verbs are a handful, but its trail is not only its own: the
 * payments' events, the deposit's and every document's are folded in, and a
 * deposit's trail folds in each charge and each photograph. A unit is never
 * finished at all. Left unbounded, the panel is a column that grows with the
 * record — and the read behind it grows with it.
 *
 * So every history shows one page of `HISTORY_PAGE_SIZE` and addresses the
 * rest as `?history=<page>`, in the URL rather than in component state, for
 * the reason the list screens do (design.md §Components — Table pagination):
 * a link somebody pastes to a colleague should open on what they were looking
 * at. Page 1 is the absence of the param, so a record's plain address and the
 * first page of its history are the same URL.
 *
 * The page is only read here. It is *clamped* where the total is known — the
 * read (`listAuditEventPage`) lands a bookmark that has outlived its page on
 * the last page that exists, rather than on an empty one.
 */

import type { Route } from 'next'

export const HISTORY_PAGE_SIZE = 10

/**
 * The `?history=` param, read as a page number.
 *
 * Anything that is not a usable figure — absent, empty, a word, zero,
 * negative, `Infinity` — is the first page, because a history is not the kind
 * of thing to show an error about.
 */
export function historyPage(param: string | undefined): number {
  const requested = Number(param)

  if (!Number.isFinite(requested) || requested < 1) {
    return 1
  }

  return Math.trunc(requested)
}

/**
 * The address of one page of a record's history. Page 1 is the record itself.
 *
 * `Route` by assertion, as the login redirect does: the path is a record's
 * own address, which the caller took from a typed route, and the query is
 * built here.
 */
export function historyHref(path: string, page: number): Route {
  return (page > 1 ? `${path}?history=${page}` : path) as Route
}
