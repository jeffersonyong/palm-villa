import { cache } from 'react'

import { hasPermission, toPermissionSet, type Permission } from '@/lib/auth/permissions'
import { getAuthenticatedUser } from '@/lib/auth/session'
import { permissionsForUser } from '@/lib/db/permissions'

/**
 * Permission gate for server actions.
 *
 * architecture.md §4: "Enforcement is in the server layer (a helper called at
 * the top of every server action)." This is that helper. It reads the session
 * from the request's cookies rather than taking one as a parameter — a server
 * action has ambient cookie access, and one line at the top of every action
 * is the whole point.
 *
 * The gate in proxy.ts only answers "is anyone signed in"; this answers "may
 * this person do this", so it fails closed on both a missing session and a
 * missing permission.
 */

export type { Permission } from '@/lib/auth/permissions'

export class PermissionDeniedError extends Error {
  constructor(readonly permission: Permission) {
    super(`You do not have permission to do that (${permission}).`)
    this.name = 'PermissionDeniedError'
  }
}

/**
 * The authenticated staff member as an authorisation subject: who they are,
 * and the union of their roles' permissions (architecture.md §4). Actions
 * pass `userId` on to the database functions as `p_actor_id`, so every audit
 * event knows who acted.
 */
export interface Actor {
  userId: string
  permissions: ReadonlySet<Permission>
}

/**
 * Memoised per request: a screen that checks four permissions while rendering
 * pays for one role lookup, not four. `getAuthenticatedUser` is itself cached,
 * so the auth round-trip is shared too.
 */
const loadActor = cache(async (): Promise<Actor | null> => {
  const user = await getAuthenticatedUser()

  if (!user) {
    return null
  }

  return {
    userId: user.id,
    permissions: toPermissionSet(await permissionsForUser(user.id)),
  }
})

/**
 * The non-throwing read, for render-time gating: a screen that should show a
 * quiet "no access" card instead of an error asks for the actor and decides.
 * Mutations never use this — they call requirePermission and let it throw.
 */
export async function getActor(): Promise<Actor | null> {
  return loadActor()
}

/**
 * Asserts the current session holds a permission, and returns the actor.
 *
 * Throws `PermissionDeniedError` when it does not, so a server action can call
 * this on its first line and treat everything after as authorised.
 */
export async function requirePermission(permission: Permission): Promise<Actor> {
  const actor = await loadActor()

  if (!actor || !hasPermission(actor.permissions, permission)) {
    throw new PermissionDeniedError(permission)
  }

  return actor
}
