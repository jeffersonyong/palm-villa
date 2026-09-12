import { NextResponse } from 'next/server'

import { isAuthorisedCron } from '@/lib/auth/cron'
import { runRetention } from '@/lib/db/documents'
import { sweepSiteImages } from '@/lib/db/site-images'

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
 * ── It also tidies the site's photographs (capability F7) ─────────────────
 *
 * The public `site-images` bucket needs a nightly pass too: a photograph whose
 * file could not be deleted when it was taken off the site, and the file of one
 * whose facility was deleted in Property settings. It rides on this job rather
 * than a third schedule because the Hobby plan's cron budget is two and both
 * are spent (architecture.md §10). It runs after the retention run and apart
 * from it: G4's deletions are a data-protection commitment and the photo sweep
 * is housekeeping, so a failure in the second must never read as a failure of
 * the first.
 *
 * ── What a run reports ────────────────────────────────────────────────────
 *
 * Counts, not identifiers. A cron log is not an access-controlled surface, and
 * naming the guests whose identity documents were destroyed last night in it
 * would be a small version of the problem this slice exists to solve. The
 * `document.expired` audit rows are the record, and they are behind the portal.
 */

export const dynamic = 'force-dynamic'

/**
 * Both passes are a handful of reads and Storage calls, capped per run (200
 * expiries, 500 retries), so a night's work fits well inside a minute — the
 * figure the accounting-pack job declares for the same reason.
 */
export const maxDuration = 60

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorisedCron(request)) {
    // No detail: a caller that got the secret wrong learns only that it was
    // wrong, and one that guessed the path learns nothing about what is here.
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const run = await runRetention()

  // Logged rather than thrown, for the reason in the header. Vercel's function
  // logs are where a failed night announces itself (architecture.md §10), and
  // the retention counts above are still reported either way.
  const siteImages = await sweepSiteImages().catch((error: unknown) => {
    console.error('Site photo sweep failed.', error)

    return { error: 'sweep_failed' as const }
  })

  return NextResponse.json(
    { ok: true, ...run, siteImages },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
