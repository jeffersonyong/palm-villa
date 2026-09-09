import { after } from 'next/server'

import { deliverBookingEmail } from '@/lib/db/booking-emails'
import type { BookingEmailKind } from '@/lib/domain/booking-email'

/**
 * Sends a customer their booking email once the response is on its way
 * (capability A8, architecture.md §9).
 *
 * `app/(portal)/portal/schedule-accounting-pack.ts`'s shape exactly, and for
 * the same reasons: `after()` has to be called inside a request, which is why
 * this is in the app layer rather than lib/db, and from a module that is NOT
 * `'use server'`, since such a module may export only async functions and
 * these are synchronous scheduling calls. It sits at the app root rather than
 * under a route group because both groups call it — the public forms create
 * bookings, and the portal confirms them.
 *
 * Only a booking id is passed. Everything the email says is re-read inside
 * `after()`, so all four combinations go through one code path and each of the
 * six call sites is a single line — and what is described is what is
 * committed, which is why `buildBookingEmail` refuses a booking that has moved
 * on in the intervening second.
 *
 * ── A failure here is not a failure ───────────────────────────────────────
 *
 * The booking was made, or the payment was verified. Raising because a mail
 * service was unreachable would be a lie about the thing the person actually
 * did, so the error is logged and swallowed — the same judgement the pack's
 * scheduler makes, and the second `console.error` in the product.
 *
 * Unlike the pack there is **no nightly job to retry it**: vercel.json holds
 * two crons and two is the Hobby plan's ceiling (architecture.md §10). What
 * stands in for one is a bounded retry inside the send itself, and the
 * `email.failed` row on the booking's own history — which is what the desk
 * reads before falling back to WhatsApp, as architecture.md §9 has always
 * said it would.
 *
 * Nothing here logs a recipient, a reference or a body. A Vercel log is not an
 * access-controlled surface (lib/db/packs.ts), and an address is worse than a
 * reference.
 */
export function scheduleBookingCreatedEmail(bookingId: string): void {
  schedule('booking_created', bookingId)
}

export function scheduleBookingConfirmedEmail(bookingId: string): void {
  schedule('booking_confirmed', bookingId)
}

function schedule(kind: BookingEmailKind, bookingId: string): void {
  after(async () => {
    try {
      const outcome = await deliverBookingEmail({ kind, bookingId })

      if (outcome.status === 'failed') {
        console.error(`Email ${kind} not sent for booking ${bookingId}: ${outcome.failure}`)
      }
    } catch (error) {
      console.error(`Email ${kind} not sent for booking ${bookingId}.`, error)
    }
  })
}
