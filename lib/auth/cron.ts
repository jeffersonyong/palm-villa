import { timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/**
 * Whether a request to a scheduled route came from the scheduler.
 *
 * The cron routes under `app/api/cron` sit outside `proxy.ts`'s session gate
 * — it matches `/portal` and `/field`, and a scheduled caller has no cookies,
 * so redirecting it to a sign-in page would silently stop the job. **The
 * shared secret is therefore the whole of the authorisation**, and it is
 * compared in constant time: a byte-by-byte comparison that returns early
 * tells an attacker how much of a guess was right.
 *
 * Written once here rather than in each route, so a second job cannot arrive
 * with a slightly different comparison. Vercel sends the secret as
 * `Authorization: Bearer <CRON_SECRET>` for every cron in vercel.json.
 */
export function isAuthorisedCron(request: Request): boolean {
  const header = request.headers.get('authorization')

  if (!header?.startsWith('Bearer ')) {
    return false
  }

  return matches(header.slice('Bearer '.length), env.cronSecret)
}

/**
 * Compares two secrets without leaking where they diverge.
 *
 * `timingSafeEqual` throws when the buffers differ in length, which is itself a
 * disclosure — so the lengths are checked first and a mismatch returns the same
 * answer a wrong value of the right length does. Hashing both sides would be
 * the alternative; a length check plus a constant-time compare is the smaller
 * thing that does the same job here.
 */
function matches(offered: string, expected: string): boolean {
  const a = Buffer.from(offered)
  const b = Buffer.from(expected)

  return a.length === b.length && timingSafeEqual(a, b)
}
