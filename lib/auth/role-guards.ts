/**
 * Lock-out guards for role administration (F1/F2), pure so a unit test can
 * exercise them without a stack.
 *
 * Both are minimal by design and recorded as assumptions in architecture.md
 * §4: they stop the two irreversible-by-UI mistakes — locking yourself out,
 * and editing the Admin role into one that can no longer edit roles — while
 * leaving everything else to the admin's judgement (another admin can still
 * demote you, and that is a feature).
 */

const CONFIG_MANAGE = 'config.manage'

/** The role whose permission set must always allow role administration. */
export const ADMIN_ROLE_SLUG = 'admin'

/**
 * Whether a set of roles, unioned, holds a permission — the same union rule
 * requirePermission applies to a session (architecture.md §4), asked ahead of
 * a write instead.
 */
export function roleUnionHasPermission(
  roleIds: readonly string[],
  permissionsByRoleId: ReadonlyMap<string, readonly string[]>,
  permission: string,
): boolean {
  return roleIds.some((roleId) => (permissionsByRoleId.get(roleId) ?? []).includes(permission))
}

/**
 * Guard for editing your own roles: refuse a new set whose union drops
 * `config.manage`, because the person saving it could never undo it.
 */
export function wouldLockSelfOut(
  targetIsSelf: boolean,
  newRoleIds: readonly string[],
  permissionsByRoleId: ReadonlyMap<string, readonly string[]>,
): boolean {
  return targetIsSelf && !roleUnionHasPermission(newRoleIds, permissionsByRoleId, CONFIG_MANAGE)
}

/**
 * Guard for editing a role's permissions: the `admin` role always keeps
 * `config.manage`. Without this, one save could leave the venue with roles
 * nobody can edit — recoverable only by a developer.
 */
export function adminRoleKeepsConfigManage(
  roleSlug: string,
  newPermissions: readonly string[],
): boolean {
  return roleSlug !== ADMIN_ROLE_SLUG || newPermissions.includes(CONFIG_MANAGE)
}
