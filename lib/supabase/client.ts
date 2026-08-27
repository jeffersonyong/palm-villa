'use client'

import { createBrowserClient } from '@supabase/ssr'

import { env } from '@/lib/env'

/**
 * Browser Supabase client — **auth session handling only**.
 *
 * The browser never holds a client used for data access (architecture.md §2):
 * reads happen in server components and writes go through server actions gated
 * by `requirePermission(...)`. Anything that queries a table from here is a bug.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey)
}
