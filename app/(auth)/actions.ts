'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { getAuthenticatedUser } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Session actions shared by the portal and field surfaces: leaving, and
 * changing your own password. Both need only authentication, not a
 * permission — every staff member holds their own session.
 */

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()

  await supabase.auth.signOut()
  redirect('/login')
}

const changePasswordSchema = z
  .object({
    // Mirrors supabase/config.toml minimum_password_length.
    password: z.string().min(6, 'Use at least 6 characters.'),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    path: ['confirm'],
    message: 'The passwords do not match.',
  })

export interface ChangePasswordState {
  status: 'idle' | 'error' | 'updated'
  message?: string
  fieldErrors?: Record<string, string>
}

/**
 * Provisioning hands staff a temporary password out-of-band
 * (architecture.md §3), so changing it yourself is part of the auth flow, not
 * a nicety. Re-entering the current password first is deliberately skipped in
 * v1: the session proves possession, and a forgotten current password is
 * exactly the situation this flow exists to end.
 */
export async function changeOwnPasswordAction(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect('/login')
  }

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}

    for (const issue of parsed.error.issues) {
      const field = issue.path[0]

      if (typeof field === 'string' && !fieldErrors[field]) {
        fieldErrors[field] = issue.message
      }
    }

    return { status: 'error', fieldErrors }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    // GoTrue's messages here are already user-facing ("New password should be
    // different from the old password.") and carry nothing sensitive.
    return { status: 'error', message: error.message }
  }

  return { status: 'updated' }
}
