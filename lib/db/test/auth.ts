import { randomUUID } from 'node:crypto'

import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from '../property'

/**
 * Auth users for the integration suite.
 *
 * Two shapes, because the audit trail treats them differently:
 *
 * - **Subjects** (`givenDisposableUser`) are acted *upon* — granted roles,
 *   deleted, listed. They carry no audit rows as actor, so the suite deletes
 *   them afterwards and they leave nothing behind.
 * - **Actors** (`testActorId`, `pinnedUserId`) have acted, which by design
 *   pins them forever: `audit_event.actor_id` restricts deletion so the
 *   trail's actors stay resolvable (architecture.md §3). Minting a fresh one
 *   per run would therefore grow the staff list by several undeletable rows
 *   every `npm run test`, so these are get-or-created at fixed addresses and
 *   reused: the residue is two accounts, forever, instead of an ever-growing
 *   pile.
 */

const ACTOR_EMAIL = 'test-actor@example.test'
const PINNED_EMAIL = 'test-pinned@example.test'
const PASSWORD = 'test-password'

async function findUserIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await dataClient().auth.admin.listUsers({ page, perPage: 100 })

    if (error) {
      throw new Error(`Could not list users: ${error.message}`)
    }

    const match = data.users.find((user) => (user.email ?? '').toLowerCase() === email)

    if (match) {
      return match.id
    }

    if (data.users.length < 100) {
      return null
    }
  }

  return null
}

async function getOrCreateUser(email: string, displayName: string): Promise<string> {
  const { data, error } = await dataClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })

  if (!error && data.user) {
    return data.user.id
  }

  if (error && error.code !== 'email_exists') {
    throw new Error(`Test setup could not create ${email}: ${error.message}`)
  }

  const existing = await findUserIdByEmail(email)

  if (!existing) {
    throw new Error(`${email} exists but could not be found by listing users.`)
  }

  return existing
}

/** A throwaway subject, safe to delete in the test's own cleanup. */
export async function givenDisposableUser(): Promise<string> {
  const { data, error } = await dataClient().auth.admin.createUser({
    email: `test-${randomUUID()}@example.test`,
    password: PASSWORD,
    email_confirm: true,
  })

  if (error || !data.user) {
    throw new Error(`Test setup could not create an auth user: ${error?.message}`)
  }

  return data.user.id
}

/** The shared actor for writes that need one. Undeletable once it has acted. */
export async function testActorId(): Promise<string> {
  return getOrCreateUser(ACTOR_EMAIL, 'Test Actor')
}

/**
 * A user that has acted, for the tests that assert such an account cannot be
 * deleted. Its audit row is written once and reused, so the assertion does
 * not cost a new undeletable account per run.
 */
export async function pinnedUserId(): Promise<string> {
  const userId = await getOrCreateUser(PINNED_EMAIL, 'Test Pinned')
  const propertyId = await currentPropertyId()

  const { count, error } = await dataClient()
    .from('audit_event')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', userId)

  if (error) {
    throw new Error(`Could not check the pinned user's history: ${error.message}`)
  }

  if ((count ?? 0) === 0) {
    const { error: insertError } = await dataClient().from('audit_event').insert({
      property_id: propertyId,
      actor_id: userId,
      action: 'test.acted',
      entity_type: 'test_entity',
      entity_id: randomUUID(),
    })

    if (insertError) {
      throw new Error(`Could not pin the test user: ${insertError.message}`)
    }
  }

  return userId
}
