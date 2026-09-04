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
 * The records whose events make up one trail.
 *
 * A screen's history is rarely one entity's. A booking's folds in its
 * payments, its deposit and its documents; a deposit's folds in the
 * inspection, each charge and each photograph. They are separate entities on
 * purpose — `charge.created` is a lookup on one verb, which is what makes
 * "every charge raised this month" answerable — but they are one story, and a
 * reader should get it in one read, in one order, rather than assembled from
 * several and sorted by hand.
 */
export interface AuditSubject {
  entityType: string
  entityIds: readonly string[]
}

/** One page of a trail, and how long the whole trail is. */
export interface AuditEventPage {
  events: readonly AuditEvent[]
  /** Every event recorded against the subjects, not just the ones returned. */
  total: number
  /** The page actually shown — the one asked for, unless that was past the end. */
  page: number
}

/**
 * Everything recorded against one entity, newest first.
 *
 * Unbounded, and for the tests and the jobs rather than the screens: a screen
 * reads `listAuditEventPage`, because a trail that is read whole grows with
 * the record for the life of the building.
 */
export async function listAuditEvents(
  entityType: string,
  entityId: string,
): Promise<readonly AuditEvent[]> {
  const trail = await readTrail([{ entityType, entityIds: [entityId] }], null)

  // Unwindowed, so there is no range to fall past; the narrowing is for the
  // type, not for a case that happens.
  return trail === PAST_THE_END ? [] : trail.events
}

/**
 * One page of the trail across several subjects, newest first, with the count
 * of everything behind it.
 *
 * The read half of what capability F4 promises, per record. One query
 * whatever the number of subjects: `audit_event_entity_idx` is
 * (property_id, entity_type, entity_id, at desc), and an OR across (type, id)
 * pairs is what that index answers.
 *
 * The count comes back on the same round trip, so a screen can say "11–20 of
 * 143" and draw the pages that exist rather than offering a next page that
 * turns out to be empty.
 *
 * A page **past the end** — a bookmark that has outlived its page — lands on
 * the last page that exists. PostgREST answers an offset beyond the rows with
 * 416 rather than an empty page, and says nothing about how many rows there
 * are, so that case costs a count and a second read. Only that case: a page
 * that exists is one query.
 */
export async function listAuditEventPage(
  subjects: readonly AuditSubject[],
  page: number,
  pageSize: number,
): Promise<AuditEventPage> {
  const requested = Math.max(1, Math.trunc(page))
  const first = await readTrail(subjects, { offset: (requested - 1) * pageSize, limit: pageSize })

  if (first !== PAST_THE_END) {
    return { ...first, page: requested }
  }

  const total = await countTrail(subjects)
  const last = Math.max(1, Math.ceil(total / pageSize))
  const window = await readTrail(subjects, { offset: (last - 1) * pageSize, limit: pageSize })

  if (window === PAST_THE_END) {
    // The trail shrank between the two reads — which an append-only table
    // cannot do. Left as a loud failure rather than a quiet empty page.
    throw new Error(`Could not read the last page of the history for ${describeSubjects(subjects)}`)
  }

  return { ...window, page: last }
}

/** What PostgREST says to an offset beyond the rows (`PGRST103`). */
const RANGE_NOT_SATISFIABLE = 'PGRST103'

const PAST_THE_END = Symbol('past the end of the trail')

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

const IDENTIFIER = /^[a-z_]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The subjects as a PostgREST `or` filter — one
 * `and(entity_type.eq.X,entity_id.in.(…))` per subject, subjects with no ids
 * left out.
 *
 * The values are interpolated into filter grammar, so they are checked
 * against it. Entity types are the product's own constants and ids are uuids
 * the database issued — nothing here comes from a request — but a value that
 * *could* carry a comma or a bracket would silently become a different
 * filter, and this is the one place to refuse that.
 */
function subjectFilter(subjects: readonly AuditSubject[]): string | null {
  const clauses = subjects
    .filter((subject) => subject.entityIds.length > 0)
    .map((subject) => {
      if (!IDENTIFIER.test(subject.entityType)) {
        throw new Error(`Audit subject type is not a plain identifier: ${subject.entityType}`)
      }

      const ids = [...new Set(subject.entityIds)]

      for (const id of ids) {
        if (!UUID.test(id)) {
          throw new Error(`Audit subject id is not a uuid: ${id}`)
        }
      }

      return `and(entity_type.eq.${subject.entityType},entity_id.in.(${ids.join(',')}))`
    })

  return clauses.length > 0 ? clauses.join(',') : null
}

/**
 * One read, windowed or not.
 *
 * `id` is a second sort key rather than decoration: two events written in the
 * same statement can share a timestamp, and a window whose ordering is only
 * *mostly* determined would show the same event on two pages and drop another
 * altogether.
 *
 * A subject list with no ids in it returns nothing without asking the
 * database — PostgREST reads `in.()` as a syntax error rather than as an
 * empty set, and there is nothing to ask.
 */
async function readTrail(
  subjects: readonly AuditSubject[],
  window: { offset: number; limit: number } | null,
): Promise<{ events: readonly AuditEvent[]; total: number } | typeof PAST_THE_END> {
  const filter = subjectFilter(subjects)

  if (filter === null) {
    return { events: [], total: 0 }
  }

  const propertyId = await currentPropertyId()

  let query = dataClient()
    .from('audit_event')
    .select('id, actor_id, action, before, after, at', { count: 'exact' })
    .eq('property_id', propertyId)
    .or(filter)
    .order('at', { ascending: false })
    .order('id', { ascending: false })

  if (window !== null) {
    query = query.range(window.offset, window.offset + window.limit - 1)
  }

  const { data, error, count } = await query

  if (error?.code === RANGE_NOT_SATISFIABLE) {
    return PAST_THE_END
  }

  if (error) {
    throw new Error(
      `Could not read the history for ${describeSubjects(subjects)}: ${error.message}`,
    )
  }

  const events = (data as AuditRow[]).map(toAuditEvent)

  return { events, total: count ?? events.length }
}

/** How long the trail is, without reading any of it. */
async function countTrail(subjects: readonly AuditSubject[]): Promise<number> {
  const filter = subjectFilter(subjects)

  if (filter === null) {
    return 0
  }

  const propertyId = await currentPropertyId()

  const { count, error } = await dataClient()
    .from('audit_event')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .or(filter)

  if (error) {
    throw new Error(
      `Could not count the history for ${describeSubjects(subjects)}: ${error.message}`,
    )
  }

  return count ?? 0
}

function describeSubjects(subjects: readonly AuditSubject[]): string {
  return subjects
    .filter((subject) => subject.entityIds.length > 0)
    .map((subject) => `${subject.entityType} ${subject.entityIds.join(', ')}`)
    .join('; ')
}
