import { currentPropertyId } from '@/lib/db/property'
import { dataClient } from '@/lib/supabase/data'

/**
 * What a staff member is allowed to do, read from the role tables
 * (architecture.md §4: user_role → role_permission, union across roles).
 *
 * Two queries rather than a PostgREST embed: the join runs across a composite
 * foreign key, and two indexed lookups are simpler than teaching the embed
 * syntax about it. Both are scoped by property, so a future second building
 * gives the same person different powers per property for free.
 *
 * Returns raw strings; the caller narrows them through toPermissionSet(),
 * which owns the closed vocabulary.
 */
export async function permissionsForUser(userId: string): Promise<readonly string[]> {
  const propertyId = await currentPropertyId()

  const { data: roleRows, error: roleError } = await dataClient()
    .from('user_role')
    .select('role_id')
    .eq('property_id', propertyId)
    .eq('user_id', userId)

  if (roleError) {
    throw new Error(`Could not read roles for user ${userId}: ${roleError.message}`)
  }

  const roleIds = (roleRows as { role_id: string }[]).map((row) => row.role_id)

  if (roleIds.length === 0) {
    return []
  }

  const { data: permissionRows, error: permissionError } = await dataClient()
    .from('role_permission')
    .select('permission')
    .eq('property_id', propertyId)
    .in('role_id', roleIds)

  if (permissionError) {
    throw new Error(`Could not read permissions for user ${userId}: ${permissionError.message}`)
  }

  return (permissionRows as { permission: string }[]).map((row) => row.permission)
}
