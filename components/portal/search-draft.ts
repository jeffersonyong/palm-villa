/**
 * Which of the two search terms wins when they disagree.
 *
 * A search field holds two: the **draft** being typed, and the **applied**
 * term the server actually filtered by, which arrives as a prop. They are
 * apart for as long as a round trip takes, and the field has to decide, on
 * every change to the applied term, whether to adopt it or keep typing.
 *
 * Adopting it always — the obvious rule — loses characters. A field that
 * commits on a pause pushes `?q=PV` and keeps taking keys while the server
 * answers; when the answer lands, the applied term is `PV`, the draft is
 * `PV-004`, and adopting throws away the four characters typed since. To
 * whoever is typing, letters simply vanish from the box.
 *
 * The distinction that fixes it is *whose* change this is. A field that
 * remembers what it last asked for can tell its own term coming back — which
 * is not news and must not disturb the draft — from a term set by something
 * else: the row's Clear, the back button, a link that arrived carrying `?q=`.
 * Only the second replaces what is being typed.
 *
 * Pure and tested here rather than inside the component: the sequence that
 * broke it is three renders deep, and it is the shared field behind every
 * list screen in the portal.
 */

export interface SearchSync {
  /** The applied term the field has already reconciled against. */
  readonly seen: string
  /** The term the field last asked for. Its own echo, when it returns. */
  readonly asked: string
}

export interface SearchDraftChange {
  /** What to remember, once this change is taken. */
  readonly sync: SearchSync
  /** The draft to replace, or null to leave what is being typed alone. */
  readonly draft: string | null
}

/** A field that has asked for nothing and shows what was applied. */
export function searchSyncFor(applied: string): SearchSync {
  return { seen: applied, asked: applied }
}

/**
 * What a newly applied term means for the draft, or null when it means
 * nothing because the field has already reconciled against it.
 *
 * The new `asked` is the applied term either way. After an echo the two agree
 * anyway; after an outside change the field is showing a term it did not ask
 * for, and saying so keeps the *next* outside change — a Clear that puts it
 * back to empty — recognisable as one.
 */
export function reconcileSearchDraft(sync: SearchSync, applied: string): SearchDraftChange | null {
  if (sync.seen === applied) {
    return null
  }

  return {
    sync: { seen: applied, asked: applied },
    draft: applied === sync.asked ? null : applied,
  }
}

/** The sync after the field asks for a term. */
export function searchAsked(sync: SearchSync, term: string): SearchSync {
  return { ...sync, asked: term }
}
