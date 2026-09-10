'use server'

import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { headers } from 'next/headers'
import { z } from 'zod'

import { clientIpFrom, hashPublicKey } from '@/lib/auth/access-token'
import { findBookingLink, notePublicAttempt } from '@/lib/db/public-bookings'
import { normalisePublicReference } from '@/lib/domain/booking-reference'
import { DAY_IN_SECONDS, HOUR_IN_SECONDS, PUBLIC_LIMITS } from '@/lib/domain/public-booking'

/**
 * Finding your own booking again (capability A9).
 *
 * The fourth server action on this surface with no session behind it, and the
 * first that is a **read**. architecture.md §4a's gate applies unchanged —
 * Zod at the boundary, a honeypot refused silently, fixed-window counters —
 * with one deliberate inversion explained under `checkLookupLimits`.
 *
 * **Two things this screen refuses to tell anyone.**
 *
 * The first is which half was wrong. A reference that turns red on the phone
 * field alone has confirmed that the booking exists, which is the only fact
 * worth extracting from here, so all four failures — a reference that was
 * never a reference, one nobody was issued, a number that does not match, and
 * a reference that has been guessed at all day — render one sentence. It is
 * architecture.md §3's rule for the token page ("a malformed token and an
 * unknown one render the same 404 so a guesser learns nothing from the
 * difference") applied a rung out to a weaker credential.
 *
 * The second is anything at all, until both halves match. On success the
 * customer is redirected to `/booking/{token}` rather than shown a summary
 * here, so this action holds no booking data and renders none: the page that
 * already knows how to talk to a customer about their booking keeps that job,
 * and there is one screen to maintain rather than two that can drift.
 */

const lookupSchema = z.object({
  reference: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(1).max(40),
  /** The honeypot. A real customer never sees it, so a value means a script. */
  website: z.string().default(''),
})

export interface LookupState {
  status: 'idle' | 'error'
  message?: string
  /** What they typed, so a refusal does not empty the form they retyped. */
  submitted?: { reference: string; phone: string }
}

/**
 * One sentence for every way this can fail to find a booking.
 *
 * The tail matters as much as the refusal: prd.md §2 makes the phone the way
 * this business already answers, so a customer the system cannot help is
 * handed to a person rather than left at a dead end.
 */
const NOT_FOUND =
  'We could not find a booking with those details. Check the reference and the number you booked with, or call us and we will find it for you.'

export async function findBookingAction(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const parsed = lookupSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return { status: 'error', message: NOT_FOUND }
  }

  const input = parsed.data
  const submitted = { reference: input.reference, phone: input.phone }

  // Silently, and in the same words the booking forms use. Naming the failed
  // check tells a script what to change.
  if (input.website.trim() !== '') {
    return { status: 'error', message: 'Something went wrong. Please try again.', submitted }
  }

  const refusal = await checkLookupLimits(input.reference)

  if (refusal) {
    return { status: 'error', message: refusal, submitted }
  }

  const found = await findBookingLink({ reference: input.reference, phone: input.phone })

  if (!found.ok) {
    return { status: 'error', message: NOT_FOUND, submitted }
  }

  redirect(`/booking/${found.data.token}` as Route)
}

/**
 * The two counters, and why they fail **closed**.
 *
 * `notePublicAttempt` fails open by default and says why: a rate limit is not
 * an authorisation check, and the controls that actually protect inventory
 * live inside the write transaction where a hiccup cannot skip them. **There
 * is no second control here.** This action hands out a permanent link to
 * somebody's booking, the key space is a sequential reference and a
 * seven-digit number, and the counters are the entire distance between a
 * script and that link. So they take the carve-out the email counter already
 * has, for the same reason it has it: this is the limit that protects the
 * customer whose booking would be handed over, not the property's bandwidth.
 *
 * The cost of failing closed is near zero besides — the counter and the
 * lookup run against the same database, so a fault that breaks one has
 * already broken the other.
 *
 * **The two refusals are not worded alike, and that is deliberate.** The
 * address counter tells a caller something about *themselves*, which gives a
 * guesser nothing. The reference counter would tell them that the reference
 * they are guessing at is real and under attack, so it refuses in the same
 * words as a lookup that simply found nothing.
 */
async function checkLookupLimits(reference: string): Promise<string | null> {
  const requestHeaders = await headers()
  const ip = clientIpFrom(requestHeaders)

  if (ip) {
    const allowed = await notePublicAttempt({
      kind: 'lookup:ip',
      keyHash: hashPublicKey(ip),
      windowSeconds: HOUR_IN_SECONDS,
      limit: PUBLIC_LIMITS.lookupsPerIpPerHour,
      onError: 'deny',
    })

    if (!allowed) {
      return 'That is a lot of attempts from this device. Please wait a little, or call us and we will find your booking.'
    }
  }

  // Only once there is a reference to key on: a string that was never a
  // reference has nothing to count against, and counting the raw text would
  // let a script spend somebody else's allowance by typing near-misses.
  const normalised = normalisePublicReference(reference)

  if (normalised === null) {
    return null
  }

  const allowedForReference = await notePublicAttempt({
    kind: 'lookup:reference',
    keyHash: hashPublicKey(normalised),
    windowSeconds: DAY_IN_SECONDS,
    limit: PUBLIC_LIMITS.lookupsPerReferencePerDay,
    onError: 'deny',
  })

  return allowedForReference ? null : NOT_FOUND
}
