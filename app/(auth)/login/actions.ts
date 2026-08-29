'use server'

import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { safeNextPath } from '@/lib/auth/next-path'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Staff sign-in (architecture.md §3: Supabase Auth, email + password).
 *
 * The one deliberately unauthenticated server action in the codebase — it is
 * how a session comes to exist, so requirePermission() has nothing to check
 * yet. Everything else follows the standard convention and gates first.
 */

const signInSchema = z.object({
  email: z.email('Enter your email address.'),
  // Only presence — the password policy applies when a password is set, not
  // when one is tried; a length hint here would leak the policy to a guesser.
  password: z.string().min(1, 'Enter your password.'),
  next: z.string().optional(),
})

export interface SignInState {
  status: 'idle' | 'error'
  message?: string
  fieldErrors?: Record<string, string>
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData))

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
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    // One message for every failure — wrong email, wrong password, banned
    // account. Distinguishing them tells a guesser which emails exist.
    return { status: 'error', message: 'Email or password is incorrect.' }
  }

  // Typed routes cannot see through safeNextPath's runtime validation — the
  // helper guarantees an in-app operations path, so the assertion is sound.
  redirect(safeNextPath(parsed.data.next) as Route)
}
