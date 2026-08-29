import { NextResponse, type NextRequest } from 'next/server'

import { safeNextPath } from '@/lib/auth/next-path'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * The gate on the operations surfaces (architecture.md §3): `(portal)` and
 * `(field)` require a signed-in staff member.
 *
 * This answers exactly one question — is anyone signed in. It never answers
 * "may they do this": authorisation is requirePermission() in the server
 * layer (architecture.md §4), called at the top of every server action and
 * again at render time for gated screens. Keeping the two apart means a
 * routing mistake here can leak a page shell, never a mutation or a row.
 */
export default async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const { pathname, search } = request.nextUrl

  if (pathname === '/login') {
    if (!user) {
      return response
    }

    // Already signed in — the login screen has nothing to offer, so honour
    // the (validated) next target. The refreshed session cookies move onto
    // the redirect, or the browser would keep the stale ones.
    const redirect = NextResponse.redirect(
      new URL(safeNextPath(request.nextUrl.searchParams.get('next')), request.url),
    )

    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie)
    }

    return redirect
  }

  if (!user) {
    // Send them to sign in, remembering where they were headed. No cookie
    // copying: there is no session to preserve.
    const login = new URL('/login', request.url)
    login.searchParams.set('next', pathname + search)

    return NextResponse.redirect(login)
  }

  return response
}

export const config = {
  // The real URL prefixes of the gated route groups (groups do not appear in
  // URLs), plus the login screen for the signed-in bounce. `:path*` matches
  // zero segments, so `/portal` itself is covered. Nothing else — the public
  // site, static assets and /c/{token} never enter the gate.
  matcher: ['/portal/:path*', '/field/:path*', '/login'],
}
