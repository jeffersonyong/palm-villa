import { after } from 'next/server'

import { assembleAccountingPack } from '@/lib/db/packs'

/**
 * Assembles a booking's accounting pack once the response is on its way
 * (capability G5, architecture.md §8.2).
 *
 * Called by the four actions that verify money against a booking, after their
 * write has succeeded. `after()` runs the work once the action has responded,
 * so the clerk's click returns as fast as it did before and the pack exists a
 * second or two later. It has to be called inside the request — which is why
 * this lives in the app layer and not in lib/db — and from a module that is
 * NOT `'use server'`, since such a module may export only async actions and
 * this is a synchronous scheduling call.
 *
 * ── A failure here is not a failure ───────────────────────────────────────
 *
 * The nightly job rebuilds every pack that is missing or stale
 * (app/api/cron/accounting-packs), so an assembly that fails now is retried
 * tonight without anyone doing anything. The error is logged and not raised:
 * the payment IS verified, and telling the clerk otherwise because a PDF did
 * not render would be a lie about the thing they actually did. This is the
 * one `console.error` in the product, and architecture.md §10 names Vercel's
 * logs as where a server-side error is expected to announce itself.
 */
export function scheduleAccountingPack(bookingId: string): void {
  after(async () => {
    try {
      const result = await assembleAccountingPack({ bookingId })

      if (!result.ok && result.reason !== 'superseded_by_newer') {
        console.error(`Accounting pack not assembled for booking ${bookingId}: ${result.reason}`)
      }
    } catch (error) {
      console.error(
        `Accounting pack not assembled for booking ${bookingId}; the nightly job will retry.`,
        error,
      )
    }
  })
}
