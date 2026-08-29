import { randomUUID } from 'node:crypto'

import { afterEach, describe, expect, test } from 'vitest'

import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'
import { setRolePermissions, setUserRoles } from './staff'

/**
 * The role-administration writes (migration 001100) against the real
 * database: the replace must be atomic with its audit event, and the CHECK
 * constraint must abort the whole save when a string is unknown.
 *
 * Every test works on a scratch role it creates itself — the seeded five are
 * live configuration for the dev portal and are never touched. Actors are
 * throwaway auth users; having acted, they are pinned by the audit FK and
 * deliberately left behind (local-only; db:reset clears auth.users).
 */

const scratchRoleIds: string[] = []
const createdUserIds: string[] = []

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
    const actorId = await givenAuthUser()
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
    const actorId = await givenAuthUser()
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
    const actorId = await givenAuthUser()

    const result = await setRolePermissions(randomUUID(), ['booking.view'], actorId)

    expect(result).toEqual({ ok: false, error: 'role_not_found' })
  })
})

describe('setUserRoles', () => {
  test('replaces the role set and audits each change', async () => {
    const userId = await givenAuthUser()
    const actorId = await givenAuthUser()
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
