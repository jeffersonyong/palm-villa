import { randomUUID } from 'node:crypto'

import { afterEach, describe, expect, test } from 'vitest'

import { hasPermission, toPermissionSet } from '@/lib/auth/permissions'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'
import { permissionsForUser } from './permissions'

/**
 * The role lookup requirePermission() sits on, and the two auth foreign keys
 * (migration 001000), against the real database.
 *
 * Each test creates its own throwaway auth users and deletes them on the way
 * out. The one deliberate exception is the user pinned under an audit event —
 * the restrict FK exists precisely to make that deletion impossible, so the
 * test leaves them behind (local-only; `npm run db:reset` clears auth.users).
 */

const createdUserIds: string[] = []

async function givenAuthUser(): Promise<string> {
  const { data, error } = await dataClient().auth.admin.createUser({
    email: `test-${randomUUID()}@example.test`,
    password: 'test-password',
    email_confirm: true,
  })

  if (error || !data.user) {
    throw new Error(`Test setup could not create an auth user: ${error?.message}`)
  }

  createdUserIds.push(data.user.id)

  return data.user.id
}

async function grantRole(userId: string, slug: string): Promise<void> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('staff_role')
    .select('id')
    .eq('property_id', propertyId)
    .eq('slug', slug)
    .single()

  if (error) {
    throw new Error(`Test setup could not find the seeded role '${slug}': ${error.message}`)
  }

  const { error: grantError } = await dataClient().from('user_role').insert({
    user_id: userId,
    property_id: propertyId,
    role_id: (data as { id: string }).id,
  })

  if (grantError) {
    throw new Error(`Test setup could not grant '${slug}': ${grantError.message}`)
  }
}

afterEach(async () => {
  for (const userId of createdUserIds.splice(0)) {
    // Best-effort: the audit-pinned user is undeletable by design.
    await dataClient().auth.admin.deleteUser(userId)
  }
})

describe('permissionsForUser', () => {
  test('returns the union across roles', async () => {
    const userId = await givenAuthUser()

    await grantRole(userId, 'front-office')
    await grantRole(userId, 'finance')

    const permissions = await permissionsForUser(userId)

    // Raw rows: one from each role, including their overlap twice —
    // deduplication is toPermissionSet's job, and this is what it receives.
    expect(permissions).toContain('booking.create')
    expect(permissions).toContain('deposit.approve_release')
    expect(permissions.filter((permission) => permission === 'payment.verify')).toHaveLength(2)

    const set = toPermissionSet(permissions)

    expect(hasPermission(set, 'payment.verify')).toBe(true)

    // Neither role holds the admin-only or excluded strings (prd.md §4).
    expect(permissions).not.toContain('config.manage')
    expect(permissions).not.toContain('inspection.record')
  })

  test('returns nothing for a user with no roles', async () => {
    const userId = await givenAuthUser()

    expect(await permissionsForUser(userId)).toHaveLength(0)
  })
})

describe('auth foreign keys (migration 001000)', () => {
  test('deleting a user cascades their role grants', async () => {
    const userId = await givenAuthUser()

    await grantRole(userId, 'security')

    const { error } = await dataClient().auth.admin.deleteUser(userId)

    expect(error).toBeNull()

    const { data } = await dataClient().from('user_role').select('role_id').eq('user_id', userId)

    expect(data).toHaveLength(0)
  })

  test('a user who has acted cannot be deleted', async () => {
    // The restrict FK encodes the policy: audit actors stay resolvable
    // forever, so an account that has acted is disabled, never deleted.
    const userId = await givenAuthUser()
    const propertyId = await currentPropertyId()

    const { error: auditError } = await dataClient().from('audit_event').insert({
      property_id: propertyId,
      actor_id: userId,
      action: 'test.acted',
      entity_type: 'test_entity',
      entity_id: randomUUID(),
    })

    expect(auditError).toBeNull()

    const { error } = await dataClient().auth.admin.deleteUser(userId)

    expect(error).not.toBeNull()
  })
})
