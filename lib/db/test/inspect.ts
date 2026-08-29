import { dataClient } from '@/lib/supabase/data'

/**
 * Direct reads for assertions the query layer has no reason to expose.
 *
 * `lib/db` deliberately offers no "list every guest" or "read the audit trail"
 * function, because no screen needs one. These tests still have to check that a
 * rolled-back booking left no guest behind and that a transition wrote its
 * audit event, so the reads live here rather than widening the query layer's
 * surface to suit its own tests.
 */

export async function givenGuestNames(): Promise<string[]> {
  const { data, error } = await dataClient().from('guest').select('name')

  if (error) {
    throw new Error(`Could not read guests: ${error.message}`)
  }

  return (data as { name: string }[]).map((row) => row.name)
}

export interface AuditEvent {
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

/** Audit events written against one entity, oldest first. */
export async function auditEventsFor(entityId: string): Promise<AuditEvent[]> {
  const { data, error } = await dataClient()
    .from('audit_event')
    .select('action, before, after')
    .eq('entity_id', entityId)
    .order('at')

  if (error) {
    throw new Error(`Could not read audit events: ${error.message}`)
  }

  return data as AuditEvent[]
}
