import { NextResponse } from 'next/server'

import { isAuthorisedCron } from '@/lib/auth/cron'
import { runRetention } from '@/lib/db/documents'

/**
 * The nightly deletion of documents past their retention period (capability
 * G4, architecture.md §8).
 *
 * scope-of-capabilities.md G4: "Documents are kept under a configurable
 * retention policy and deleted automatically when it expires — replacing
 * indefinite accumulation, in line with Brunei's Personal Data Protection Order
 * 2025." prd.md §2 names the practice this ends: identity documents
 * accumulating indefinitely in a folder with no retention.
 *
 * Declared in vercel.json at 19:00 UTC, which is 03:00 in Brunei — after the
 * last check-in of one day and before the first of the next.
 *
 * ── The first route handler in the product outside the portal ─────────────
 *
 * `proxy.ts` matches `/portal` and `/field`, so this path is not behind the
 * session gate — deliberately, because a scheduled caller has no cookies and
 * redirecting a cron job to a sign-in page would silently stop the deletions.
 * **The shared secret is therefore the whole of the authorisation**; the
 * comparison lives in lib/auth/cron.ts, shared with the accounting-pack job.
 *
 * ── Why this is a route and not a database job ────────────────────────────
 *
 * Deleting the row is a Postgres act and could be a `pg_cron` schedule.
 * Deleting the FILE is a Storage API call, which Postgres cannot make — and a
 * retention policy that expires rows while leaving the objects behind would
 * satisfy nothing G4 promises. The work has to run somewhere that can reach
 * both, which is here.
 *
 * ── What a run reports ────────────────────────────────────────────────────
 *
 * Counts, not identifiers. A cron log is not an access-controlled surface, and
 * naming the guests whose identity documents were destroyed last night in it
 * would be a small version of the problem this slice exists to solve. The
 * `document.expired` audit rows are the record, and they are behind the portal.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorisedCron(request)) {
    // No detail: a caller that got the secret wrong learns only that it was
    // wrong, and one that guessed the path learns nothing about what is here.
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const run = await runRetention()

  return NextResponse.json({ ok: true, ...run }, { headers: { 'Cache-Control': 'no-store' } })
}
