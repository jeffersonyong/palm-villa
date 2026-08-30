import { dataClient } from '@/lib/supabase/data'

/**
 * Direct reads for assertions the query layer has no reason to expose.
 *
 * `lib/db` deliberately offers no "list every guest" function, because no
 * screen needs one, and these tests still have to check that a rolled-back
 * booking left no guest behind.
 *
 * The audit read is a near-duplicate of `listAuditEvents` in lib/db/audit.ts,
 * which the booking detail screen's history panel uses, and stays separate on
 * purpose: it reads oldest-first, because a test asserting a sequence of events
 * should read in the order they happened, and it does not scope by property or
 * entity type, so a test cannot pass by filtering away the row it broke.
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
