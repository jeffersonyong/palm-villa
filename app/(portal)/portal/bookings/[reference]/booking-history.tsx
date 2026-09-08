import { EventHistory } from '@/components/portal/event-history'
import type { AuditEventPage } from '@/lib/db/audit'
import { describeAuditEvent } from '@/lib/domain/audit-label'

/**
 * Everything recorded against this booking, newest first.
 *
 * The "who, what, when" half of capability B3. The trail's shape — actor mark,
 * verb, timestamp, quoted reason — is `EventHistory`, which every history
 * shares; the vocabulary is `describeAuditEvent`, which they now share too.
 *
 * It used to live here, and moved when the property-wide audit log (F4) became
 * a fourth reader of the same verbs: a copy per screen was right while a trail
 * was always read against one record, and would have been the first thing to
 * disagree once one screen read all of them at once.
 *
 * Events on the booking's **payments**, its deposit and its documents are
 * folded in by the page. They carry their own `entity_type`, so a trail built
 * only from the booking's own events would show it reaching `confirmed` with no
 * record of what was actually banked — the lie by omission this is written to
 * avoid.
 */

interface BookingHistoryProps {
  history: AuditEventPage
  /** The booking's own address, which page 1 of its history shares. */
  path: string
  /** Display names by `auth.users.id`; an actor with no name renders as system. */
  actorNames: ReadonlyMap<string, string>
}

export function BookingHistory({ history, path, actorNames }: BookingHistoryProps) {
  return (
    <EventHistory
      history={history}
      path={path}
      actorNames={actorNames}
      label={describeAuditEvent}
      emptyMessage="Nothing recorded against this booking yet."
    />
  )
}
