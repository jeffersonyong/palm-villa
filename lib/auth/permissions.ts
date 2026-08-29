/**
 * The permission vocabulary and the pure set logic over it.
 *
 * Pure and I/O-free on purpose: requirePermission() composes these with the
 * session and the database, but what "holding a permission" means is decided
 * here, where a unit test can reach it without a running stack.
 */

/**
 * The atomic permission strings (prd.md §4).
 *
 * Permissions, not roles, are the unit of enforcement. Roles are compositions
 * of these and are data rather than code, so a role change is an admin action
 * and never a deployment. The same closed list is enforced in the database by
 * the CHECK constraint on role_permission (migration 000400) — a new string
 * is a code change and a migration, together.
 */
export const PERMISSIONS = [
  'booking.view',
  'booking.create',
  'booking.amend',
  'booking.cancel',
  'booking.override_hold',
  'payment.verify',
  'payment.record_cash',
  'inspection.record',
  'charge.create',
  'charge.waive',
  'deposit.approve_release',
  'unit.manage',
  'tenancy.manage',
  'config.manage',
  'report.view',
  'document.view_identity',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(PERMISSIONS)

/**
 * Rows from role_permission, as a set — the union across a user's roles
 * (architecture.md §4).
 *
 * Unknown strings are dropped rather than kept or thrown on: the CHECK
 * constraint makes them near-impossible, but if one ever appears (a migration
 * ahead of a deploy, say) the safe reading is "a permission this build cannot
 * check is a permission this build does not grant".
 */
export function toPermissionSet(raw: readonly string[]): ReadonlySet<Permission> {
  return new Set(raw.filter((value): value is Permission => KNOWN_PERMISSIONS.has(value)))
}

export function hasPermission(
  permissions: ReadonlySet<Permission>,
  permission: Permission,
): boolean {
  return permissions.has(permission)
}
