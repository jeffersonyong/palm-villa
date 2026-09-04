import { addDays, isStayDate, type StayDate } from '@/lib/domain/dates'

/**
 * How a list screen reads its filters out of the URL.
 *
 * Filters are URL state on every list screen — a staff member keeps "everything
 * awaiting payment" in a tab, bookmarks it, sends the link on — so every one of
 * them reads the same shapes back: a repeating param of known values, a pair of
 * dates, and a search term. The bookings register and the units board each
 * carried a private copy of this; the deposits ledger is the third screen,
 * which is when a copy becomes a pattern.
 *
 * Everything here falls back rather than erroring. A hand-edited URL should
 * narrow the list, not break the screen: unknown values are dropped, half a
 * date pair is no date pair, a reversed range is no range, a blank search is
 * no search.
 */

/**
 * The chosen values of a repeating param, in the canonical order rather than
 * the URL's.
 *
 * Repeated params (`?status=confirmed&status=checked_in`) rather than one
 * comma-joined value: it is what a browser does with a multi-valued field, what
 * `URLSearchParams` reads back without help, and it keeps each value a whole
 * token so a stray comma cannot invent a third status.
 */
export function readChoices<T extends string>(
  value: string | string[] | undefined,
  canonical: readonly T[],
  isMember: (candidate: string) => candidate is T,
): readonly T[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value]
  const chosen = new Set(raw.filter(isMember))

  return canonical.filter((entry) => chosen.has(entry))
}

/**
 * A window of days, **both ends inclusive** — the first and last day the filter
 * row's calendar shows as selected, because that is what the person clicking
 * them meant.
 */
export interface StayWindow {
  from: StayDate
  to: StayDate
}

/** The `from`/`to` pair, or null unless both are real dates in order. */
export function readStayWindow(
  from: string | undefined,
  to: string | undefined,
): StayWindow | null {
  if (!from || !to || !isStayDate(from) || !isStayDate(to) || from > to) {
    return null
  }

  return { from, to }
}

/**
 * The window as the half-open range a stay is compared against.
 *
 * Occupancy is `[check_in, check_out)` — the convention the exclusion
 * constraint uses (architecture.md §5.2) — so the inclusive last day is pushed
 * out by one. This conversion belongs at the boundary and nowhere else: a
 * single-day window is `[d, d+1)`, which is exactly "stays touching d".
 */
export function overlapRangeOf(window: StayWindow): { start: StayDate; end: StayDate } {
  return { start: window.from, end: addDays(window.to, 1) }
}

/** Whether a half-open stay touches a half-open range. */
export function staysOverlap(
  stay: { start: StayDate; end: StayDate },
  range: { start: StayDate; end: StayDate },
): boolean {
  return stay.start < range.end && stay.end > range.start
}

/** As long as a search needs to be: a reference, a name, a phone number. */
export const MAX_SEARCH_LENGTH = 80

/**
 * The characters a search term may not carry, dropped rather than escaped.
 *
 * None of them can appear in anything the screens search — a reference, a
 * name, a phone number, a unit — and every one of them means something to
 * the grammar the term ends up in: `,` `(` `)` `"` `\` are PostgREST's
 * filter syntax, and `*` `%` `_` are LIKE wildcards. Stripping them here, at
 * the boundary, is what lets the query builders below treat the term as
 * plain text.
 */
const SEARCH_RESERVED = /[,()"\\*%_]/g

/**
 * The `q` param as a search term, or null when there is nothing to search
 * for. Trimmed, whitespace collapsed, capped, and stripped of the characters
 * above. A repeated param takes the first value.
 */
export function readSearch(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value

  if (raw === undefined) {
    return null
  }

  const term = raw
    .replace(SEARCH_RESERVED, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SEARCH_LENGTH)

  return term.length > 0 ? term : null
}

/**
 * Whether a record matches a search term — any of its searchable fields
 * contains it, case-insensitively. The in-memory twin of the `ilike` the
 * database-paged lists use, so a held deposit and a released one answer a
 * search the same way.
 */
export function matchesSearch(
  term: string,
  fields: readonly (string | null | undefined)[],
): boolean {
  const needle = term.toLowerCase()

  return fields.some(
    (field) => field !== null && field !== undefined && field.toLowerCase().includes(needle),
  )
}
