import { cache } from 'react'

import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * The signed-in staff member, as the UI needs them.
 *
 * Display name lives in `auth.users.user_metadata.display_name`, written when
 * an Admin creates the account — there is no staff profile table, because
 * nothing beyond a name is stored about staff (architecture.md §3, recorded
 * there as an assumption).
 */
export interface AuthenticatedUser {
  id: string
  email: string
  displayName: string
}

/**
 * Reads the authenticated user from the request's session cookies.
 *
 * `getUser()` verifies the JWT against the auth server rather than trusting
 * the cookie's claims, and `cache()` memoises per request — a layout, a page
 * and several permission checks in one render share a single lookup.
 *
 * Null means no valid session. Middleware keeps unauthenticated requests out
 * of the gated surfaces, so a null here inside them is a race (signed out in
 * another tab), and callers treat it as signed out rather than an error.
 */
export const getAuthenticatedUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return null
  }

  const { user } = data
  const email = user.email ?? ''
  const metadataName = user.user_metadata?.display_name

  return {
    id: user.id,
    email,
    displayName:
      typeof metadataName === 'string' && metadataName.trim() !== '' ? metadataName : email,
  }
})
