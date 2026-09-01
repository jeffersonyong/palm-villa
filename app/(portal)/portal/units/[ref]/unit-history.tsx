import { EventHistory } from '@/components/portal/event-history'
import type { AuditEvent } from '@/lib/db/audit'

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
 */

const ACTION_LABELS: Record<string, string> = {
  'unit.marked_out_of_service': 'Taken out of service',
  'unit.returned_to_service': 'Returned to service',
  'unit.leased': 'Let long-term',
  'unit.lease_ended': 'Lease end date changed',
  'unit.lease_cancelled': 'Lease removed',
  'unit.added': 'Added to the building',
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

  // An unmapped action still renders as its raw verb. Hiding it would make the
  // trail lie by omission about something that happened to this unit.
  return ACTION_LABELS[event.action] ?? event.action.replace(/^unit\./, '').replace(/_/g, ' ')
}

interface UnitHistoryProps {
  events: readonly AuditEvent[]
  actorNames: ReadonlyMap<string, string>
}

export function UnitHistory({ events, actorNames }: UnitHistoryProps) {
  return (
    <EventHistory
      events={events}
      actorNames={actorNames}
      label={actionLabel}
      emptyMessage="Nothing has happened to this unit yet."
    />
  )
}
