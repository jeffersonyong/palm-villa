import { NextResponse } from 'next/server'

import { getActor } from '@/lib/auth/require-permission'
import { getDocument, issueDocumentUrl } from '@/lib/db/documents'
import { mayOpen } from '@/lib/domain/document'

/**
 * Opening a stored file (capabilities B10, G2, G3).
 *
 * A route handler rather than a server action, and architecture.md §2 sanctions
 * exactly this — "route handlers only where a server action doesn't fit". A
 * server action cannot hand a browser a redirect into a new tab, and what a
 * staff member needs here is an ordinary link they can middle-click.
 *
 * It lives in the portal's URL space so `proxy.ts` (`/portal/:path*`) has
 * already refused anyone with no session by the time this runs. That gate
 * answers only "is anyone signed in"; the per-kind permission below is the
 * authorisation, and it is checked here even though every screen that renders a
 * link has already checked it — a URL is guessable in a way a button is not.
 *
 * ── Why the link is a plain anchor, and why this refuses HEAD ─────────────
 *
 * Every call writes an audit row: G3 promises "who viewed which document, and
 * when". That makes the handler's side effect the point of it, and two ordinary
 * conveniences would corrupt the record:
 *
 * - **`next/link` prefetches on viewport entry** in production. A history panel
 *   listing six documents would log six views nobody performed, the moment the
 *   page scrolled. Screens use `<a href target="_blank">` for this reason.
 * - **Next serves HEAD from GET** unless told otherwise, so a link checker or a
 *   preview fetcher would log a view too. HEAD is refused outright.
 *
 * `force-dynamic` and `no-store` say the same thing to the framework and to the
 * browser: there is nothing cacheable here, and a cached 302 would be a signed
 * URL handed out again without a second entry beside it.
 */

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const actor = await getActor()

  // `getActor` rather than `requirePermission`: this is a read, and the answer
  // to "you may not see this" is a status code, not an exception.
  if (!actor) {
    return deny(401, 'Sign in to open this document.')
  }

  const document = await getDocument(id)

  if (!document) {
    return deny(404, 'That document does not exist.')
  }

  // The one line this handler exists for. An identity document needs
  // `document.view_identity`; everything else needs `booking.view`. The table
  // is in lib/domain/document.ts so this and every screen read the same one.
  if (!mayOpen(document.kind, actor.permissions)) {
    return deny(403, 'You do not have access to this document.')
  }

  const issued = await issueDocumentUrl({ documentId: id, actorId: actor.userId })

  if (!issued.ok) {
    // Removed, or past its retention period. Both are 404 to the reader: the
    // document is not there, and which of the two it is is a fact about the
    // record rather than about this request.
    return deny(404, issued.error.message)
  }

  // 302 rather than proxying the bytes through this function. The signed URL
  // lasts sixty seconds (architecture.md §8), the file never passes through the
  // application, and a large photograph does not become a serverless function's
  // memory problem.
  const response = NextResponse.redirect(issued.url, 302)

  response.headers.set('Cache-Control', 'no-store, max-age=0')

  return response
}

/**
 * Refuses a HEAD, which Next would otherwise answer by running GET.
 *
 * A link checker, a chat client unfurling a pasted URL or a browser's
 * pre-connect would each write a `document.viewed` row for a view that never
 * happened. The audit trail is a control promised to the client, and a trail
 * with entries nobody made is worse than a slower one.
 */
export function HEAD(): NextResponse {
  return new NextResponse(null, { status: 405, headers: { Allow: 'GET' } })
}

function deny(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
