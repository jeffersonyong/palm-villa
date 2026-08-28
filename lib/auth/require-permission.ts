/**
 * Permission gate for server actions.
 *
 * architecture.md §4: "Enforcement is in the server layer (a
 * requirePermission(session, 'deposit.approve_release') helper called at the
 * top of every server action)." This is that helper.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHENTICATION IS NOT IMPLEMENTED YET. In development this helper ALLOWS
 * EVERY ACTION.
 *
 * It exists now, and is called now, so that the auth slice fills in one
 * function rather than hunting the codebase for unguarded mutations. The
 * production guard below is deliberately fail-closed: if this ships before
 * auth lands, every mutation refuses rather than silently permitting.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * The atomic permission strings (prd.md §4).
 *
 * Permissions, not roles, are the unit of enforcement. Roles are compositions
 * of these and are data rather than code, so a role change is an admin action
 * and never a deployment.
 */
export type Permission =
  | 'booking.view'
  | 'booking.create'
  | 'booking.amend'
  | 'booking.cancel'
  | 'booking.override_hold'
  | 'payment.verify'
  | 'payment.record_cash'
  | 'inspection.record'
  | 'charge.create'
  | 'charge.waive'
  | 'deposit.approve_release'
  | 'unit.manage'
  | 'tenancy.manage'
  | 'config.manage'
  | 'report.view'
  | 'document.view_identity'

export class PermissionDeniedError extends Error {
  constructor(readonly permission: Permission) {
    super(`You do not have permission to do that (${permission}).`)
    this.name = 'PermissionDeniedError'
  }
}

/**
 * Asserts the current session holds a permission.
 *
 * Throws `PermissionDeniedError` when it does not, so a server action can call
 * this on its first line and treat everything after as authorised.
 */
export async function requirePermission(permission: Permission): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    // Fail closed. Replaced by the real session and role lookup in the auth
    // slice: read the Supabase session, union the user's role permissions
    // (architecture.md §4), and check membership.
    throw new PermissionDeniedError(permission)
  }
}
