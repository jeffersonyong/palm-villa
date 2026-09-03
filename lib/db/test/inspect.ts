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
  /**
   * Null where nobody performed the act.
   *
   * Read by the documents tests, which assert that retention expiry credits no
   * one: a scheduled deletion attributed to whichever staff member happened to
   * be nearby would be worse than one attributed to nobody.
   */
  actorId: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

/** Audit events written against one entity, oldest first. */
export async function auditEventsFor(entityId: string): Promise<AuditEvent[]> {
  const { data, error } = await dataClient()
    .from('audit_event')
    .select('action, actor_id, before, after')
    .eq('entity_id', entityId)
    .order('at')

  if (error) {
    throw new Error(`Could not read audit events: ${error.message}`)
  }

  return (data as { action: string; actor_id: string | null; before: never; after: never }[]).map(
    (row) => ({
      action: row.action,
      actorId: row.actor_id,
      before: row.before,
      after: row.after,
    }),
  )
}

export interface PaymentRow {
  id: string
  method: string
  status: string
  expected_amount_cents: number
  amount_cents: number | null
  match_kind: string | null
  amount_override_reason: string | null
  match_reason: string | null
  observed_reference: string | null
  observed_sender: string | null
  collected_at: string | null
  verified_at: string | null
}

/**
 * Payments against one booking, oldest first, read straight from the table.
 *
 * Not `listPaymentsForBooking`, deliberately: that reads the summary view, and
 * a test asserting what was actually stored should not be able to pass because
 * the view papered over it.
 */
export async function paymentsFor(bookingId: string): Promise<PaymentRow[]> {
  const { data, error } = await dataClient()
    .from('payment')
    .select(
      'id, method, status, expected_amount_cents, amount_cents, match_kind, ' +
        'amount_override_reason, match_reason, observed_reference, observed_sender, ' +
        'collected_at, verified_at',
    )
    .eq('booking_id', bookingId)
    .order('created_at')

  if (error) {
    throw new Error(`Could not read payments: ${error.message}`)
  }

  return data as unknown as PaymentRow[]
}
