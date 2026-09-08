import { bruneiWindowBounds, type StayWindow } from '@/lib/domain/dates'
import { isAuditEntityType, isAuditFamily, SYSTEM_ACTOR } from '@/lib/domain/audit-label'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'

/**
 * The whole audit trail, filtered and paged (capability F4).
 *
 * lib/db/audit.ts reads a trail against a set of records — a booking's history,
 * a deposit's — and that is a different question from this one. F4 promises the
 * owner "every change to bookings, payments, deposits, and charges, with actor
 * and timestamp", which is asked across records: every discount this month,
 * everything one person did on Tuesday, every time an identity document was
 * opened. The two live apart because their filters have nothing in common.
 *
 * Reads `audit_event_summary`, which resolves each event's subject to something
 * readable. A subject since deleted comes back null and the screen falls back
 * to the name in the event's own payload — which is why the payloads carry one.
 */

export interface AuditTrailFilter {
  /** Inclusive Brunei days. Converted to instants exactly once, at the edge. */
  window?: StayWindow
  /** Action families — `booking`, `payment`, `facility` … */
  families?: readonly string[]
  /** Kinds of record — `booking`, `document`, `day_pass_band` … */
  entityTypes?: readonly string[]
  /** A staff member's id, or `system` for the events nobody performed. */
  actor?: string | null
  /** Matched against the subject label: a reference, a unit, a bank. */
  search?: string | null
}

export interface AuditTrailEvent {
  id: string
  actorId: string | null
  action: string
  actionFamily: string
  entityType: string
  entityId: string
  subjectLabel: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  at: string
}

export interface AuditTrailPage {
  events: readonly AuditTrailEvent[]
  /** Everything matching the filter, not just this page. */
  total: number
  /** The page actually shown — the one asked for, unless it was past the end. */
  page: number
}

const COLUMNS =
  'id, actor_id, action, action_family, entity_type, entity_id, subject_label, before, after, at'

/** What PostgREST says to an offset beyond the rows (`PGRST103`). */
const RANGE_NOT_SATISFIABLE = 'PGRST103'

const PAST_THE_END = Symbol('past the end of the trail')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AuditTrailRow {
  id: string
  actor_id: string | null
  action: string
  action_family: string
  entity_type: string
  entity_id: string
  subject_label: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  at: string
}

function toEvent(row: AuditTrailRow): AuditTrailEvent {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    actionFamily: row.action_family,
    entityType: row.entity_type,
    entityId: row.entity_id,
    subjectLabel: row.subject_label,
    before: row.before,
    after: row.after,
    at: row.at,
  }
}

/**
 * One page of the trail, newest first, with the count of everything behind it.
 *
 * A page **past the end** — a bookmark that has outlived its page, or a filter
 * narrowed while on page nine — lands on the last page that exists. PostgREST
 * answers an offset beyond the rows with 416 rather than an empty page and says
 * nothing about how many rows there are, so that case costs a count and a
 * second read. Only that case: a page that exists is one query. The same
 * handling lib/db/audit.ts worked out for a record's history.
 */
export async function listAuditTrail(
  filter: AuditTrailFilter,
  page: number,
  pageSize: number,
): Promise<AuditTrailPage> {
  const requested = Math.max(1, Math.trunc(page))
  const first = await readTrail(filter, {
    offset: (requested - 1) * pageSize,
    limit: pageSize,
  })

  if (first !== PAST_THE_END) {
    return { ...first, page: requested }
  }

  const total = await countTrail(filter)
  const last = Math.max(1, Math.ceil(total / pageSize))
  const window = await readTrail(filter, { offset: (last - 1) * pageSize, limit: pageSize })

  if (window === PAST_THE_END) {
    // The trail shrank between the two reads, which an append-only table cannot
    // do. Left loud rather than as a quiet empty page.
    throw new Error('Could not read the last page of the audit trail.')
  }

  return { ...window, page: last }
}

/**
 * The five predicates `applyTrailFilter` uses, structurally — the deposits
 * archive's `ArchiveQuery` for the same reason: the data client is untyped, so
 * naming the concrete builder would mean naming five generic parameters that
 * carry no information here. The builder mutates in place, which is what the
 * callers rely on.
 */
interface TrailQuery {
  gte(column: string, value: unknown): unknown
  lt(column: string, value: unknown): unknown
  in(column: string, values: readonly unknown[]): unknown
  is(column: string, value: unknown): unknown
  eq(column: string, value: unknown): unknown
  ilike(column: string, pattern: string): unknown
}

/**
 * The filter, applied to a query.
 *
 * Values are checked against the closed vocabularies before they reach
 * PostgREST — an unknown family or entity type is dropped rather than passed
 * on, and an actor that is not a uuid or the system sentinel is ignored. The
 * screen already narrows to what it offers; this is the second refusal, in the
 * one place a hand-edited URL arrives.
 */
function applyTrailFilter(query: TrailQuery, filter: AuditTrailFilter): void {
  // Each call mutates the builder, so nothing is chained on a return value.
  if (filter.window) {
    const bounds = bruneiWindowBounds(filter.window)

    query.gte('at', bounds.start)
    query.lt('at', bounds.end)
  }

  const families = (filter.families ?? []).filter(isAuditFamily)

  if (families.length > 0) {
    query.in('action_family', families)
  }

  const entityTypes = (filter.entityTypes ?? []).filter(isAuditEntityType)

  if (entityTypes.length > 0) {
    query.in('entity_type', entityTypes)
  }

  if (filter.actor === SYSTEM_ACTOR) {
    query.is('actor_id', null)
  } else if (filter.actor && UUID.test(filter.actor)) {
    query.eq('actor_id', filter.actor)
  }

  if (filter.search) {
    // `readSearch` has already stripped the characters that would change the
    // shape of a PostgREST filter value.
    query.ilike('subject_label', `%${filter.search}%`)
  }
}

async function readTrail(
  filter: AuditTrailFilter,
  window: { offset: number; limit: number },
): Promise<{ events: readonly AuditTrailEvent[]; total: number } | typeof PAST_THE_END> {
  const propertyId = await currentPropertyId()

  const query = dataClient()
    .from('audit_event_summary')
    .select(COLUMNS, { count: 'exact' })
    .eq('property_id', propertyId)

  applyTrailFilter(query, filter)

  // `id` is a second sort key rather than decoration: two events written in the
  // same statement share a timestamp, and a window whose ordering is only
  // mostly determined would show one event twice and drop another.
  const { data, error, count } = await query
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    .range(window.offset, window.offset + window.limit - 1)

  if (error?.code === RANGE_NOT_SATISFIABLE) {
    return PAST_THE_END
  }

  if (error) {
    throw new Error(`Could not read the audit trail: ${error.message}`)
  }

  const events = (data as AuditTrailRow[]).map(toEvent)

  return { events, total: count ?? events.length }
}

async function countTrail(filter: AuditTrailFilter): Promise<number> {
  const propertyId = await currentPropertyId()

  const query = dataClient()
    .from('audit_event_summary')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)

  applyTrailFilter(query, filter)

  const { count, error } = await query

  if (error) {
    throw new Error(`Could not count the audit trail: ${error.message}`)
  }

  return count ?? 0
}
