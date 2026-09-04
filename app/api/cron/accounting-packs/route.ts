import { NextResponse } from 'next/server'

import { isAuthorisedCron } from '@/lib/auth/cron'
import { runPackAssembly } from '@/lib/db/packs'

/**
 * The nightly assembly of accounting packs (capability G5, architecture.md
 * §8.2).
 *
 * scope-of-capabilities.md G5: "the accounting record pack … is generated
 * automatically per booking — no more manual PDF assembly." A pack is first
 * assembled the moment a payment is verified (see
 * app/(portal)/portal/schedule-accounting-pack.ts); this is the other half:
 * every night, every booking whose pack is missing or older than what it
 * records gets a fresh one. That covers the slip attached a day after the
 * transfer, the IC collected at check-in, the amendment, the check-out — and
 * any assembly that failed on the day.
 *
 * Declared in vercel.json at 18:00 UTC, which is 02:00 in Brunei — an hour
 * before the retention job, in a different hour so the two keep their order
 * on a scheduler that promises the hour and not the minute.
 *
 * The secret is the whole of the authorisation; see lib/auth/cron.ts. Counts
 * only in the response, for the reason the retention route gives: a cron log
 * is not an access-controlled surface, and a booking reference names a guest.
 */

export const dynamic = 'force-dynamic'

/**
 * A pack is a few reads, a render and an upload — a second or two each — and
 * a night's list is capped at 25 by `runPackAssembly`, so a run fits well
 * inside a minute. On the first night after this ships every settled booking
 * is due at once; the cap means the backlog is worked off over a few nights
 * rather than in one run that the platform cuts short.
 */
export const maxDuration = 60

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const run = await runPackAssembly()

  return NextResponse.json({ ok: true, ...run }, { headers: { 'Cache-Control': 'no-store' } })
}
