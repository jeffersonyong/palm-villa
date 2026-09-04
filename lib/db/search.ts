/**
 * A search term as PostgREST predicates: any of the columns contains it,
 * case-insensitively.
 *
 * One `or` of `ilike` patterns rather than a full-text index, because what the
 * screens search is a handful of short identifying fields — a reference, a
 * name, a phone number, a unit — and "contains" is the question a staff member
 * with half a reference is asking.
 *
 * The term is interpolated into filter grammar, so it is checked against it
 * here even though `readSearch` has already stripped what it refuses. This is
 * the audit trail's rule (`subjectFilter` in ./audit.ts): the one place a
 * value meets the grammar is the one place to refuse what would change it.
 */

const RESERVED = /[,()"\\*%_]/g

interface SearchableQuery {
  or(filters: string): unknown
}

/** Narrows `query` to rows where any of `columns` contains `term`. */
export function applySearch(
  query: SearchableQuery,
  columns: readonly string[],
  term: string,
): void {
  const safe = term.replace(RESERVED, '').trim()

  if (safe.length === 0) {
    return
  }

  // `*` is PostgREST's spelling of `%`; the builder encodes the rest.
  query.or(columns.map((column) => `${column}.ilike.*${safe}*`).join(','))
}
