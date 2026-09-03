/**
 * How much of a unit's history the screen asks for, and how that grows.
 *
 * ── Why a unit's trail needs this and a booking's does not ────────────────
 *
 * A booking's history is a handful of events and then the booking is over. A
 * unit is never over: it outlives every stay in it, and it records an event
 * every time somebody takes it out of service, lets it, renames it or edits its
 * note. Left unbounded, the panel is a column that grows for the life of the
 * building — and the read behind it grows with it.
 *
 * So the screen shows the newest `HISTORY_PAGE_SIZE` and offers the rest a page
 * at a time, in the URL rather than in component state. Same reasoning as the
 * board's pagination: a link somebody pastes to a colleague should open on what
 * they were looking at.
 *
 * ── No ceiling, deliberately ──────────────────────────────────────────────
 *
 * A hand-typed `?history=100000` reads the whole trail — exactly what the
 * screen did before this existed, so it is not a new cost — and capping it
 * would mean a unit old enough to pass the cap has history nobody can reach.
 * An append-only record that quietly stops is worse than a slow one.
 */

export const HISTORY_PAGE_SIZE = 10

/**
 * The `?history=` param, read as a number of events.
 *
 * Anything that is not a usable figure — absent, empty, a word, negative,
 * `Infinity` — is one page, because the trail is not the kind of thing to show
 * an error about.
 */
export function historyWindow(param: string | undefined): number {
  const requested = Number(param)

  if (!Number.isFinite(requested)) {
    return HISTORY_PAGE_SIZE
  }

  // Rounded up to a whole page, so a fiddled URL still produces one of the
  // windows the "show older" link would have produced.
  const pages = Math.max(Math.ceil(requested / HISTORY_PAGE_SIZE), 1)

  return pages * HISTORY_PAGE_SIZE
}
