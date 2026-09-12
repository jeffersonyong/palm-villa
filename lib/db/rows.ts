/**
 * Reading past PostgREST's row ceiling.
 *
 * ── The thing this exists to prevent ───────────────────────────────────────
 *
 * PostgREST is configured with `max_rows = 1000` (supabase/config.toml), and
 * it **truncates rather than failing**. A query that matches more comes back
 * with a thousand rows, no error, no flag, and nothing in the response saying
 * a decision was made. Every consequence of that is silent: a list that stops,
 * a total that is short by an unknown amount, a report that reconciles to the
 * wrong figure. There is no failing test and no log line, because from the
 * caller's side nothing went wrong.
 *
 * `lib/db/export.ts` worked this out first and chunked every read it makes.
 * This is that loop, moved somewhere the rest of the query layer can reach it,
 * because the export was never the only read that outgrows a thousand rows —
 * `listPayments` had six callers doing it, among them the revenue report and
 * the daily cash-up, which are exactly the two answers that must not be
 * quietly wrong about money.
 *
 * ── When to use this, and when to page instead ─────────────────────────────
 *
 * Chunking is for a caller that genuinely needs every matching row: a CSV, or
 * a running balance that is accumulated over a whole window. A screen that
 * shows rows to a person wants `PageRequest` and a real footer instead —
 * handing a browser five thousand table rows is its own bug, and one this
 * cannot fix.
 */

/** PostgREST's configured ceiling. A page of exactly this many means more. */
export const CHUNK = 1000

/**
 * Every row, however many pages that takes.
 *
 * `build` is called per page rather than once, because a PostgREST builder
 * carries its range and cannot be re-ranged after it has been awaited — so
 * callers pass a factory that constructs a fresh query each time rather than
 * a query to re-use.
 *
 * `label` names the read in the error, because a failure three pages into a
 * loop otherwise says nothing about which read failed.
 */
export async function readAllRows<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  options: { chunk?: number; label?: string } = {},
): Promise<T[]> {
  const chunk = options.chunk ?? CHUNK
  const label = options.label ?? 'rows'
  const rows: T[] = []

  for (let from = 0; ; from += chunk) {
    const { data, error } = await build(from, from + chunk - 1)

    if (error) {
      throw new Error(`Could not read ${label}: ${error.message}`)
    }

    const page = (data ?? []) as T[]

    rows.push(...page)

    // A short page is the last page. A full one means there may be more, so
    // the loop asks again — including the case where the total is an exact
    // multiple of the chunk, which costs one empty read and never a lost row.
    if (page.length < chunk) {
      return rows
    }
  }
}
