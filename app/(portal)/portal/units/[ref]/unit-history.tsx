import { EventHistory } from '@/components/portal/event-history'
import type { AuditEventPage } from '@/lib/db/audit'
import { describeAuditEvent } from '@/lib/domain/audit-label'

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
 * and the block at the top of the screen says what is true now. The note's own
 * text is deliberately not quoted in the trail — `EventHistory` quotes a
 * `reason`, a sentence written *about* an action, where a note is the thing
 * itself and often several lines of it.
 *
 * The verbs are `describeAuditEvent`, shared with every other trail since the
 * audit log (F4) became a reader of all of them at once.
 */

interface UnitHistoryProps {
  history: AuditEventPage
  /** The unit's own address, which page 1 of its history shares. */
  path: string
  actorNames: ReadonlyMap<string, string>
}

export function UnitHistory({ history, path, actorNames }: UnitHistoryProps) {
  return (
    <EventHistory
      history={history}
      path={path}
      actorNames={actorNames}
      label={describeAuditEvent}
      emptyMessage="Nothing recorded against this unit yet."
    />
  )
}
