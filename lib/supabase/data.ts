import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

/**
 * The data-access Supabase client. Server-only.
 *
 * architecture.md §2 requires that all database access is server-side and that
 * "the browser never holds a Supabase client with data access". This module is
 * where that client is built, and `lib/db` is the only thing that imports it.
 *
 * ── Why this is separate from lib/supabase/server.ts ────────────────────────
 *
 * That factory is the *session* client: it reads and writes auth cookies via
 * `next/headers`, which ties it to a request. `lib/db` has to run in three
 * places — server components, server actions, and Vitest, where there is no
 * request and no cookie store — so the query layer cannot depend on it.
 *
 * ── Why the service-role key ───────────────────────────────────────────────
 *
 * Authorisation is enforced in the server layer, not by row filters:
 * architecture.md §4 is explicit that "the application does not rely on RLS for
 * business-level authorisation, because permission logic is richer than row
 * filters". Every mutation passes `requirePermission(...)` before it reaches
 * this client. RLS is enabled on every table as defence in depth, with no
 * policies — so a publishable-key client sees nothing, which is the point.
 *
 * That leaves the anon key unable to read anything server-side either, and
 * there are no sessions yet to write policies against. The service-role key is
 * therefore the data path, as .env.example already anticipated.
 *
 * The rule that makes this safe is absolute: this key is never prefixed
 * NEXT_PUBLIC_, never imported into a client component, and never returned to a
 * browser. The one-line guard below fails the build rather than trusting that.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/supabase/data.ts was imported in the browser. The data client holds the service-role key and is server-only (architecture.md §2).',
  )
}

let client: SupabaseClient | null = null

/**
 * The shared data client.
 *
 * Memoised per process: the client is stateless for our purposes — no session
 * to refresh, no cookies to carry — so rebuilding it per query would allocate a
 * new connection pool on every request for no benefit.
 */
export function dataClient(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        // No user session on this client. Persisting or refreshing one would be
        // meaningless server-side and would leak state between requests.
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return client
}
