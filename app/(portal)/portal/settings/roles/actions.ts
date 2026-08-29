'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS, type Permission } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/require-permission'
import { adminRoleKeepsConfigManage, wouldLockSelfOut } from '@/lib/auth/role-guards'
import {
  createStaffAccount,
  listRolesWithPermissions,
  resetStaffPassword,
  setAccountDisabled,
  setRolePermissions,
  setUserRoles,
} from '@/lib/db/staff'

/**
 * Role administration (capabilities F1/F2). Every action gates on
 * `config.manage` first — prd.md §4 grants it to Admin alone by default —
 * and every one lands in the audit trail via lib/db/staff.
 */

export interface RoleAdminState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
}

const ROLES_PATH = '/portal/settings/roles'

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {}

  for (const issue of error.issues) {
    const field = issue.path[0]

    if (typeof field === 'string' && !fieldErrors[field]) {
      fieldErrors[field] = issue.message
    }
  }

  return fieldErrors
}

/* ── Create a staff account ────────────────────────────────────────────── */

const createStaffSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter their name.').max(120),
  email: z.email('Enter a valid email address.'),
  // Mirrors supabase/config.toml minimum_password_length.
  tempPassword: z.string().min(6, 'Use at least 6 characters.'),
  roleIds: z.array(z.uuid()),
})

export async function createStaffAction(
  _previous: RoleAdminState,
  formData: FormData,
): Promise<RoleAdminState> {
  const actor = await requirePermission('config.manage')

  const parsed = createStaffSchema.safeParse({
    displayName: formData.get('displayName'),
    email: formData.get('email'),
    tempPassword: formData.get('tempPassword'),
    roleIds: formData.getAll('roleIds'),
  })

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsOf(parsed.error) }
  }

  const result = await createStaffAccount({
    email: parsed.data.email,
    displayName: parsed.data.displayName,
    tempPassword: parsed.data.tempPassword,
    roleIds: parsed.data.roleIds,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', fieldErrors: { email: result.error.message } }
  }

  revalidatePath(ROLES_PATH)

  return { status: 'done' }
}

/* ── Replace a user's role set ─────────────────────────────────────────── */

const setUserRolesSchema = z.object({
  userId: z.uuid(),
  roleIds: z.array(z.uuid()),
})

export async function setUserRolesAction(
  _previous: RoleAdminState,
  formData: FormData,
): Promise<RoleAdminState> {
  const actor = await requirePermission('config.manage')

  const parsed = setUserRolesSchema.safeParse({
    userId: formData.get('userId'),
    roleIds: formData.getAll('roleIds'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'Check the selected roles and try again.' }
  }

  const roles = await listRolesWithPermissions()
  const permissionsByRoleId = new Map(roles.map((role) => [role.id, role.permissions]))

  if (wouldLockSelfOut(parsed.data.userId === actor.userId, parsed.data.roleIds, permissionsByRoleId)) {
    return {
      status: 'error',
      message: "You can't remove your own admin access — ask another admin to change your roles.",
    }
  }

  await setUserRoles(parsed.data.userId, parsed.data.roleIds, actor.userId)
  revalidatePath(ROLES_PATH)

  return { status: 'done' }
}

/* ── Replace a role's permission set ───────────────────────────────────── */

const permissionString = z.enum(PERMISSIONS)

const setRolePermissionsSchema = z.object({
  roleId: z.uuid(),
  permissions: z.array(permissionString),
})

export async function setRolePermissionsAction(
  _previous: RoleAdminState,
  formData: FormData,
): Promise<RoleAdminState> {
  const actor = await requirePermission('config.manage')

  const parsed = setRolePermissionsSchema.safeParse({
    roleId: formData.get('roleId'),
    permissions: formData.getAll('permissions'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'Check the selected permissions and try again.' }
  }

  const roles = await listRolesWithPermissions()
  const role = roles.find((candidate) => candidate.id === parsed.data.roleId)

  if (!role) {
    return { status: 'error', message: 'That role no longer exists.' }
  }

  if (!adminRoleKeepsConfigManage(role.slug, parsed.data.permissions)) {
    return {
      status: 'error',
      message: 'The Admin role always keeps "Edit settings & roles" — without it, nobody could undo this.',
    }
  }

  const result = await setRolePermissions(
    parsed.data.roleId,
    parsed.data.permissions satisfies Permission[],
    actor.userId,
  )

  if (!result.ok) {
    return { status: 'error', message: 'That role no longer exists.' }
  }

  revalidatePath(ROLES_PATH)

  return { status: 'done' }
}

/* ── Disable / enable an account ───────────────────────────────────────── */

const setAccountStatusSchema = z.object({
  userId: z.uuid(),
  disabled: z.enum(['true', 'false']).transform((value) => value === 'true'),
})

export async function setAccountStatusAction(
  _previous: RoleAdminState,
  formData: FormData,
): Promise<RoleAdminState> {
  const actor = await requirePermission('config.manage')

  const parsed = setAccountStatusSchema.safeParse({
    userId: formData.get('userId'),
    disabled: formData.get('disabled'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'Something went wrong. Reload and try again.' }
  }

  if (parsed.data.disabled && parsed.data.userId === actor.userId) {
    return { status: 'error', message: "You can't disable your own account." }
  }

  await setAccountDisabled(parsed.data.userId, parsed.data.disabled, actor.userId)
  revalidatePath(ROLES_PATH)

  return { status: 'done' }
}

/* ── Reset a staff member's password ───────────────────────────────────── */

const resetPasswordSchema = z.object({
  userId: z.uuid(),
  tempPassword: z.string().min(6, 'Use at least 6 characters.'),
})

export async function resetStaffPasswordAction(
  _previous: RoleAdminState,
  formData: FormData,
): Promise<RoleAdminState> {
  const actor = await requirePermission('config.manage')

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get('userId'),
    tempPassword: formData.get('tempPassword'),
  })

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsOf(parsed.error) }
  }

  await resetStaffPassword(parsed.data.userId, parsed.data.tempPassword, actor.userId)
  revalidatePath(ROLES_PATH)

  return { status: 'done' }
}
