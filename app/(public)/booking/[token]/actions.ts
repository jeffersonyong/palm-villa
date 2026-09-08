'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import { clientIpFrom, hashPublicKey } from '@/lib/auth/access-token'
import { notePublicAttempt, submitPublicTransfer } from '@/lib/db/public-bookings'
import { HOUR_IN_SECONDS, isAccessToken, PUBLIC_LIMITS } from '@/lib/domain/public-booking'

/**
 * "I have made the transfer" (prd.md §10.3, step 3).
 *
 * The moment the wait in the staff verification queue starts, which is what
 * `payment.created_at`'s own comment predicted a slice before this existed:
 * the clock measures how long a customer has been left hanging, not how long
 * they spent on the form.
 *
 * Unauthenticated like its sibling in `../stay/actions.ts`, and gated the same
 * way minus the honeypot — this form has one hidden field and no visible ones,
 * so a honeypot would be the only thing in it. The limit here is deliberately
 * loose: pressing the button writes no inventory, and a customer refreshing a
 * page they are anxious about is the ordinary case rather than an attack.
 *
 * What it raises — a pending deposit for a stay, a pending payment otherwise —
 * is decided in the database from the booking's own stream and quote. A caller
 * that could choose would be a caller that could ask for a BND 100 deposit
 * against a day pass.
 */

const submitSchema = z.object({
  token: z.string().refine(isAccessToken, 'That link is not valid.'),
})

export interface SubmitTransferState {
  status: 'idle' | 'error'
  message?: string
}

export async function submitTransferAction(
  _previous: SubmitTransferState,
  formData: FormData,
): Promise<SubmitTransferState> {
  const parsed = submitSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'That link is not valid. Please open it again from the top.',
    }
  }

  const requestHeaders = await headers()
  const ip = clientIpFrom(requestHeaders)

  if (ip) {
    const allowed = await notePublicAttempt({
      kind: 'submit:ip',
      keyHash: hashPublicKey(ip),
      windowSeconds: HOUR_IN_SECONDS,
      limit: PUBLIC_LIMITS.submitsPerIpPerHour,
    })

    if (!allowed) {
      return {
        status: 'error',
        message: 'Please wait a moment and try again, or call us and we will sort it out.',
      }
    }
  }

  const submitted = await submitPublicTransfer(parsed.data.token)

  if (!submitted.ok) {
    return { status: 'error', message: submitted.error.message }
  }

  // The queue is where somebody now has work to do, and the dashboard's
  // "awaiting payment" tile counts it.
  revalidatePath('/portal/payments')
  revalidatePath('/portal/bookings')
  revalidatePath('/portal')
  revalidatePath(`/booking/${parsed.data.token}`)

  return { status: 'idle' }
}
