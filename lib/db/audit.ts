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

  const { error } = await dataClient().from('audit_event').insert({
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
