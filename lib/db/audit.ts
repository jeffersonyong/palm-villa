import { currentPropertyId } from '@/lib/db/property'
import { dataClient } from '@/lib/supabase/data'

/**
 * A single audit event, from TypeScript.
 *
 * The database functions write their own audit rows in the same transaction
 * as their data change, and that stays the preferred shape. This exists for
 * the writes whose primary operation is the GoTrue admin API (creating a
 * staff account, banning one, resetting a password) — there is no SQL
 * transaction to join, so the event is recorded immediately after the API
 * call succeeds. The table's append-only triggers apply here like everywhere
 * else (architecture.md §4).
 */

export interface AuditEventInput {
  actorId: string | null
  /** Dotted verb, e.g. `staff.account_created`. */
  action: string
  entityType: string
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const propertyId = await currentPropertyId()

  const { error } = await dataClient()
    .from('audit_event')
    .insert({
      property_id: propertyId,
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      before: input.before ?? null,
      after: input.after ?? null,
    })

  if (error) {
    throw new Error(`Could not record audit event ${input.action}: ${error.message}`)
  }
}

/** One recorded event, as the history panel reads it. */
export interface AuditEvent {
  id: string
  actorId: string | null
  /** Dotted verb, e.g. `booking.amended`. */
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  /** ISO timestamp, formatted at the edge. */
  at: string
}

/**
 * Everything recorded against one entity, newest first.
 *
 * The read half of the trail F4 promises. `audit_event_entity_idx` is
 * (property_id, entity_type, entity_id, at desc) — this query is what that
 * index was built for.
 *
 * Unbounded on purpose: the events against a single booking are a handful, and
 * a limit here would silently truncate the record a dispute turns on. The
 * property-wide audit screen is the one that will need paging.
 */
export async function listAuditEvents(
  entityType: string,
  entityId: string,
): Promise<readonly AuditEvent[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('audit_event')
    .select('id, actor_id, action, before, after, at')
    .eq('property_id', propertyId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('at', { ascending: false })

  if (error) {
    throw new Error(`Could not read the history for ${entityType} ${entityId}: ${error.message}`)
  }

  return (
    data as {
      id: string
      actor_id: string | null
      action: string
      before: Record<string, unknown> | null
      after: Record<string, unknown> | null
      at: string
    }[]
  ).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    before: row.before,
    after: row.after,
    at: row.at,
  }))
}
