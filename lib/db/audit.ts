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

/** A window onto a trail, and how long the whole trail is. */
export interface AuditEventWindow {
  events: readonly AuditEvent[]
  /** Every event recorded against the entity, not just the ones returned. */
  total: number
}

/**
 * Everything recorded against one entity, newest first.
 *
 * The read half of the trail F4 promises. `audit_event_entity_idx` is
 * (property_id, entity_type, entity_id, at desc) — this query is what that
 * index was built for.
 *
 * Unbounded, and only correct where the trail is: the events against a single
 * booking are a handful, and a limit here would silently truncate the record a
 * dispute turns on. A **unit** is the other case — it outlives every booking in
 * it and accumulates an event every time somebody edits its note — so the unit
 * screen reads a window instead (`listAuditEventWindow`). The property-wide
 * audit screen will need the same.
 */
export async function listAuditEvents(
  entityType: string,
  entityId: string,
): Promise<readonly AuditEvent[]> {
  const { events } = await readTrail(entityType, entityId, null)

  return events
}

/**
 * The newest `limit` events, and the count of everything behind them.
 *
 * The count is what lets a screen say "10 of 143" rather than offering a
 * "show older" that may turn out to reveal nothing — and it comes back on the
 * same round trip, so the window costs one query, not two.
 */
export async function listAuditEventWindow(
  entityType: string,
  entityId: string,
  limit: number,
): Promise<AuditEventWindow> {
  return readTrail(entityType, entityId, limit)
}

/**
 * Everything recorded against several entities of one type, newest first.
 *
 * One query for a set of ids rather than one per id. The booking screen is
 * what needs it: a booking's trail already folds in each payment's events and
 * the deposit's, and the documents slice adds a row per identity document,
 * slip and photograph — which turns a handful of round trips into a dozen on a
 * screen prd.md §20 measures in seconds.
 *
 * An empty id list returns nothing without asking the database, because
 * PostgREST reads `in.()` as a syntax error rather than as an empty set.
 */
export async function listAuditEventsForEntities(
  entityType: string,
  entityIds: readonly string[],
): Promise<readonly AuditEvent[]> {
  if (entityIds.length === 0) {
    return []
  }

  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('audit_event')
    .select('id, actor_id, action, before, after, at')
    .eq('property_id', propertyId)
    .eq('entity_type', entityType)
    .in('entity_id', [...new Set(entityIds)])
    .order('at', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    throw new Error(`Could not read the history for ${entityType}: ${error.message}`)
  }

  return (data as AuditRow[]).map(toAuditEvent)
}

interface AuditRow {
  id: string
  actor_id: string | null
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  at: string
}

function toAuditEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    before: row.before,
    after: row.after,
    at: row.at,
  }
}

/**
 * One read, windowed or not.
 *
 * `id` is a second sort key rather than decoration: two events written in the
 * same statement can share a timestamp, and a window whose ordering is only
 * *mostly* determined would show the same event on two pages and drop another
 * altogether.
 */
async function readTrail(
  entityType: string,
  entityId: string,
  limit: number | null,
): Promise<AuditEventWindow> {
  const propertyId = await currentPropertyId()

  let query = dataClient()
    .from('audit_event')
    .select('id, actor_id, action, before, after, at', { count: 'exact' })
    .eq('property_id', propertyId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('at', { ascending: false })
    .order('id', { ascending: false })

  if (limit !== null) {
    query = query.range(0, limit - 1)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Could not read the history for ${entityType} ${entityId}: ${error.message}`)
  }

  const events = (data as AuditRow[]).map(toAuditEvent)

  return { events, total: count ?? events.length }
}
