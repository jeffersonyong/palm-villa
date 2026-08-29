/**
 * Environment access, validated at the boundary.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only for literal
 * property access, so each variable is read literally here rather than through
 * a dynamic key.
 */
function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    )
  }

  return value
}

export const env = {
  get supabaseUrl(): string {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
  },
  get supabaseAnonKey(): string {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  },
  /**
   * Server-only. Bypasses RLS, so it is never prefixed `NEXT_PUBLIC_` and never
   * reaches a client component — see lib/supabase/data.ts for why the query
   * layer uses it and what keeps that safe.
   */
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
  },
}
