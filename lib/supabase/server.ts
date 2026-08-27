import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

import { env } from '@/lib/env'

/**
 * The Supabase client for server components, server actions and route handlers.
 *
 * All database access lives on the server (architecture.md §2). Query code
 * belongs in `lib/db`, not in components — this factory is the only place a
 * data-access client is constructed.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a server component, where cookies are read-only. Safe to
          // ignore when middleware is refreshing the session; that lands with
          // the auth slice.
        }
      },
    },
  })
}
