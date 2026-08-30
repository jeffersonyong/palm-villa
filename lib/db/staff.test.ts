import { randomUUID } from 'node:crypto'

import { afterEach, describe, expect, test } from 'vitest'

import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'
import { deleteStaffAccount, setRolePermissions, setUserRoles } from './staff'
import { givenDisposableUser, pinnedUserId, testActorId } from './test/auth'

/**
 * The role-administration writes (migration 001100) against the real
 * database: the replace must be atomic with its audit event, and the CHECK
 * constraint must abort the whole save when a string is unknown.
 *
 * Every test works on a scratch role it creates itself — the seeded five are
 * live configuration for the dev portal and are never touched. Subjects are
 * throwaway users, deleted afterwards; the actor is shared, because acting
 * pins an account permanently (lib/db/test/auth.ts).
 */

const scratchRoleIds: string[] = []
const createdUserIds: string[] = []

/**
 * Actors are shared and reused (lib/db/test/auth.ts): having acted, they can
 * never be deleted, so a fresh one per run would leave a new undeletable
 * account in the staff list every time the suite runs.
 */
async function givenAuthUser(): Promise<string> {
  const userId = await givenDisposableUser()

  createdUserIds.push(userId)

  return userId
}

async function givenScratchRole(): Promise<string> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('staff_role')
    .insert({ property_id: propertyId, slug: `test-${randomUUID()}`, name: 'Scratch Role' })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Test setup could not create a scratch role: ${error.message}`)
  }

  const roleId = (data as { id: string }).id

  scratchRoleIds.push(roleId)

  return roleId
}

async function rolePermissions(roleId: string): Promise<string[]> {
  const { data, error } = await dataClient()
    .from('role_permission')
    .select('permission')
    .eq('role_id', roleId)

  if (error) {
    throw new Error(error.message)
  }

  return (data as { permission: string }[]).map((row) => row.permission).sort()
}

afterEach(async () => {
  for (const roleId of scratchRoleIds.splice(0)) {
    await dataClient().from('staff_role').delete().eq('id', roleId)
  }

  for (const userId of createdUserIds.splice(0)) {
    // Best-effort: users that acted are pinned by the audit FK.
    await dataClient().auth.admin.deleteUser(userId)
  }
})

describe('setRolePermissions', () => {
  test('replaces the set and audits before/after in one transaction', async () => {
    const roleId = await givenScratchRole()
    const actorId = await testActorId()
    const propertyId = await currentPropertyId()

    await dataClient()
      .from('role_permission')
      .insert({ property_id: propertyId, role_id: roleId, permission: 'booking.view' })

    const result = await setRolePermissions(roleId, ['payment.verify', 'booking.create'], actorId)

    expect(result.ok).toBe(true)
    expect(await rolePermissions(roleId)).toEqual(['booking.create', 'payment.verify'])

    const { data: events } = await dataClient()
      .from('audit_event')
      .select('action, actor_id, before, after')
      .eq('entity_id', roleId)

    expect(events).toHaveLength(1)

    const [event] = events as {
      action: string
      actor_id: string
      before: { permissions: string[] }
      after: { permissions: string[] }
    }[]

    expect(event?.action).toBe('role.permissions_set')
    expect(event?.actor_id).toBe(actorId)
    expect(event?.before.permissions).toEqual(['booking.view'])
    expect(event?.after.permissions).toEqual(['booking.create', 'payment.verify'])
  })

  test('an unknown permission aborts the whole save', async () => {
    const roleId = await givenScratchRole()
    const actorId = await testActorId()
    const propertyId = await currentPropertyId()

    await dataClient()
      .from('role_permission')
      .insert({ property_id: propertyId, role_id: roleId, permission: 'booking.view' })

    // The CHECK constraint (000400) rejects the string, and because write and
    // audit share a transaction, nothing changes — not even the valid half.
    await expect(
      setRolePermissions(roleId, ['booking.create', 'checkin.record'], actorId),
    ).rejects.toThrow()

    expect(await rolePermissions(roleId)).toEqual(['booking.view'])

    const { data: events } = await dataClient()
      .from('audit_event')
      .select('id')
      .eq('entity_id', roleId)

    expect(events).toHaveLength(0)
  })

  test('reports a role that no longer exists', async () => {
    const actorId = await testActorId()

    const result = await setRolePermissions(randomUUID(), ['booking.view'], actorId)

    expect(result).toEqual({ ok: false, error: 'role_not_found' })
  })
})

describe('setUserRoles', () => {
  test('replaces the role set and audits each change', async () => {
    const userId = await givenAuthUser()
    const actorId = await testActorId()
    const first = await givenScratchRole()
    const second = await givenScratchRole()

    await setUserRoles(userId, [first, second], actorId)
    await setUserRoles(userId, [second], actorId)

    const { data: grants } = await dataClient()
      .from('user_role')
      .select('role_id')
      .eq('user_id', userId)

    expect((grants as { role_id: string }[]).map((row) => row.role_id)).toEqual([second])

    const { data: events } = await dataClient()
      .from('audit_event')
      .select('action')
      .eq('entity_id', userId)

    expect(events).toHaveLength(2)
    expect(
      (events as { action: string }[]).every((event) => event.action === 'staff.roles_set'),
    ).toBe(true)
  })
})

describe('deleteStaffAccount', () => {
  test('deletes an unused account, role grants included, and records it', async () => {
    const userId = await givenAuthUser()
    const actorId = await testActorId()
    const roleId = await givenScratchRole()
    const propertyId = await currentPropertyId()

    await dataClient()
      .from('user_role')
      .insert({ user_id: userId, property_id: propertyId, role_id: roleId })

    const result = await deleteStaffAccount(userId, actorId)

    expect(result.ok).toBe(true)

    const { data: gone } = await dataClient().auth.admin.getUserById(userId)

    expect(gone?.user ?? null).toBeNull()

    const { data: grants } = await dataClient()
      .from('user_role')
      .select('role_id')
      .eq('user_id', userId)

    expect(grants).toHaveLength(0)

    const { data: events } = await dataClient()
      .from('audit_event')
      .select('action, actor_id')
      .eq('entity_id', userId)

    expect(events).toHaveLength(1)
    expect((events as { action: string; actor_id: string }[])[0]?.action).toBe(
      'staff.account_deleted',
    )
    expect((events as { action: string; actor_id: string }[])[0]?.actor_id).toBe(actorId)
  })

  test('refuses an account that has acted', async () => {
    // Shared fixture: a fresh one would be pinned by its own audit row and
    // linger in the staff list after every run (lib/db/test/auth.ts).
    const userId = await pinnedUserId()
    const actorId = await testActorId()

    const result = await deleteStaffAccount(userId, actorId)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.error.code).toBe('has_history')
    }

    // Still there — refusal must not be destructive.
    const { data } = await dataClient().auth.admin.getUserById(userId)

    expect(data?.user?.id).toBe(userId)
  })
})
