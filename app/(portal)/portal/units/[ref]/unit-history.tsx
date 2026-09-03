import Link from 'next/link'

import { EventHistory } from '@/components/portal/event-history'
import { Button } from '@/components/ui/button'
import type { AuditEvent } from '@/lib/db/audit'

import { HISTORY_PAGE_SIZE } from './history-window'

/**
 * Everything recorded against this unit, newest first.
 *
 * A unit outlives every booking in it, which is what makes this trail worth
 * having separately from the bookings': "why was 3B-04 unavailable all of
 * September" is a question about the unit, and the answer is here rather than
 * scattered across the bookings that were not made.
 *
 * Renames are in it too. A reference is what staff call a door, so changing one
 * changes how every past stay reads (prd.md §7.1 [A]) — and this is the record
 * of what it used to be called.
 *
 * And every edit to the unit's note, which is what lets the note itself be a
 * single editable block rather than an append-only thread: the thread is here,
 * and the block at the top of the screen says what is true now.
 *
 * Which is also why this one is paged and the booking's is not: a unit is never
 * finished, and a note that gets corrected twice a month is two events a month
 * for the life of the building. The newest page is shown and the rest is one
 * click behind it — see `history-window.ts`.
 */

const ACTION_LABELS: Record<string, string> = {
  'unit.marked_out_of_service': 'Taken out of service',
  'unit.returned_to_service': 'Returned to service',
  'unit.leased': 'Let long-term',
  'unit.lease_ended': 'Lease end date changed',
  'unit.lease_cancelled': 'Lease removed',
  'unit.added': 'Added to the building',
  'unit.note_added': 'Note added',
  'unit.note_changed': 'Note changed',
  'unit.note_cleared': 'Note cleared',
}

/**
 * A rename names both sides, because the trail's whole job here is to answer
 * "what was this door called before".
 */
function renameLabel(event: AuditEvent): string {
  const from = typeof event.before?.ref === 'string' ? event.before.ref : null
  const to = typeof event.after?.ref === 'string' ? event.after.ref : null

  return from && to ? `Renamed from ${from} to ${to}` : 'Renamed'
}

/**
 * The reason a unit went out of service is a fact about the unit, not a note on
 * the event — so it is stored under `reason` in the payload and read back here
 * the same way `EventHistory` reads a cancellation's.
 */
function actionLabel(event: AuditEvent): string {
  if (event.action === 'unit.renamed') {
    return renameLabel(event)
  }

  // The note's own text is not quoted in the trail. `EventHistory` quotes an
  // event's `reason` — a sentence written *about* an action — and a note is
  // the thing itself, often several lines of it. Six entries each carrying a
  // paragraph would bury the history in copies of a field the reader can see
  // in full at the top of the screen.

  // An unmapped action still renders as its raw verb. Hiding it would make the
  // trail lie by omission about something that happened to this unit.
  return ACTION_LABELS[event.action] ?? event.action.replace(/^unit\./, '').replace(/_/g, ' ')
}

interface UnitHistoryProps {
  /** The newest slice of the trail — never the whole thing. */
  events: readonly AuditEvent[]
  /** Everything recorded against the unit, including what is not shown. */
  total: number
  actorNames: ReadonlyMap<string, string>
  /** This unit's reference, for the link back to this screen. */
  ref_: string
  /** How many events the next page of the trail should open. */
  nextWindow: number
}

export function UnitHistory({ events, total, actorNames, ref_, nextWindow }: UnitHistoryProps) {
  const hidden = total - events.length

  return (
    <div className="grid gap-md">
      <EventHistory
        events={events}
        actorNames={actorNames}
        label={actionLabel}
        emptyMessage="Nothing has happened to this unit yet."
      />

      {/* The footer only exists when there is something behind it. A count
          that always reads "10 of 10" is chrome, and a "show older" that
          reveals nothing is a lie. */}
      {hidden > 0 ? (
        <div className="grid gap-sm border-t border-divider pt-md">
          <p className="text-caption text-muted-foreground">
            Showing the {events.length} most recent of {total}.
          </p>
          {/* A link rather than a button: the window is in the URL, so this is
              navigation, and it works before the page has hydrated. `scroll`
              off because the operations panel owns the scroll — the default
              would fire at the window and throw the reader back to the top of
              a list they were reading down. */}
          <Button asChild variant="tertiary">
            <Link
              href={`/portal/units/${encodeURIComponent(ref_)}?history=${nextWindow}`}
              scroll={false}
            >
              Show {Math.min(hidden, HISTORY_PAGE_SIZE)} older
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
