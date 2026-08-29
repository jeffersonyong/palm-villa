import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'

import { env } from '@/lib/env'

/**
 * Session refresh for the request pipeline (proxy.ts).
 *
 * Server components cannot write cookies, so a session whose access token has
 * expired can only be refreshed here — this is the counterpart to the
 * "middleware is refreshing the session" note in lib/supabase/server.ts. The
 * refreshed cookies are written to both the forwarded request (so this
 * render sees them) and the response (so the browser keeps them).
 *
 * `getUser()` and not `getSession()`: getSession reads the cookie's claims
 * without verifying them, which is fine for rendering hints but not for a
 * gate. getUser round-trips to the auth server and is the only call the
 * gate may trust.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }

        response = NextResponse.next({ request })

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { response, user }
}
