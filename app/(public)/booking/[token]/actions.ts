'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import { clientIpFrom, hashPublicKey } from '@/lib/auth/access-token'
import {
  attachPublicDocument,
  notePublicAttempt,
  submitPublicTransfer,
} from '@/lib/db/public-bookings'
import {
  isDocumentKind,
  mayCustomerAttach,
  MAX_DOCUMENT_BYTES,
} from '@/lib/domain/document'
import {
  DAY_IN_SECONDS,
  HOUR_IN_SECONDS,
  isAccessToken,
  isTransferChoice,
  PUBLIC_LIMITS,
} from '@/lib/domain/public-booking'

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
  /**
   * Which of the two the customer sent. Defaulted rather than required, so a
   * booking with no choice to make — a day pass, or a stay quoting no deposit
   * — submits the same form without one.
   */
  choice: z
    .string()
    .default('deposit_only')
    .refine(isTransferChoice, 'Choose what you are transferring.'),
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

  const submitted = await submitPublicTransfer(parsed.data.token, parsed.data.choice)

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

/**
 * The guest sends us their slip or their IC (capabilities A6, A7).
 *
 * The fifth unauthenticated server action, and the first that stores a file.
 * architecture.md §4a lists what one of these has to carry, and this carries
 * four of the five:
 *
 *   - **Zod at the boundary**, on the token's shape and the kind.
 *   - **No honeypot**, for `submitTransferAction`'s stated reason one screen
 *     up: the link is the credential, and there is nothing here for a blind
 *     script to find. A honeypot defends a form somebody can reach by guessing
 *     a URL; this one needs 128 bits first.
 *   - **Request counters**, per address and per booking.
 *   - **Nothing submitted is trusted** — not the declared content type, which
 *     `checkUpload` overrules by reading the file's own header, and not the
 *     size, which `attach_document` re-reads from Storage after the upload.
 *
 * The fifth, re-deriving the price, has no analogue: nothing here is priced.
 *
 * ── Why the counters fail open ─────────────────────────────────────────────
 *
 * §4a's rule is that a counter fails open where a second control sits behind it
 * and closed where it is the only one. Here the second control is the access
 * token, so this is the ordinary case rather than the lookup's: a guest whose
 * upload is refused because the counter itself is broken is a guest sending
 * their IC over WhatsApp again, which is the problem A7 exists to solve.
 *
 * ── What it deliberately does not do ───────────────────────────────────────
 *
 * It never reports *why* a file was refused in terms of the booking's internals
 * — which row the slip was filed against, whether a member of staff had already
 * attached one — beyond the sentence `lib/db/documents.ts` writes for a person
 * to read. And it returns nothing that could be used to read a file back.
 */
export type UploadState =
  | { status: 'idle' }
  | { status: 'done'; kind: string }
  | { status: 'error'; message: string }

const uploadSchema = z.object({
  token: z.string().refine(isAccessToken, 'That link is not valid.'),
  kind: z
    .string()
    .refine((value) => isDocumentKind(value) && mayCustomerAttach(value), 'Unknown file.'),
})

export async function uploadDocumentAction(
  _previous: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const parsed = uploadSchema.safeParse({
    token: formData.get('token'),
    kind: formData.get('kind'),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'That link is not valid. Please open it again from the top.',
    }
  }

  const { token, kind } = parsed.data

  if (!isDocumentKind(kind) || !mayCustomerAttach(kind)) {
    // Unreachable past the schema, and narrows the type for the call below —
    // `refine` proves it to a reader and not to the compiler.
    return { status: 'error', message: 'Unknown file.' }
  }

  const requestHeaders = await headers()
  const ip = clientIpFrom(requestHeaders)

  if (ip) {
    const allowed = await notePublicAttempt({
      kind: 'upload:ip',
      keyHash: hashPublicKey(ip),
      windowSeconds: HOUR_IN_SECONDS,
      limit: PUBLIC_LIMITS.uploadsPerIpPerHour,
    })

    if (!allowed) {
      return { status: 'error', message: TOO_MANY }
    }
  }

  // Keyed on the token rather than the booking's id, which this action does not
  // know and should not have to look up to refuse a request. It is hashed like
  // every other key here, so the counter table never holds a live credential.
  const withinBooking = await notePublicAttempt({
    kind: 'upload:booking',
    keyHash: hashPublicKey(token),
    windowSeconds: DAY_IN_SECONDS,
    limit: PUBLIC_LIMITS.uploadsPerBookingPerDay,
  })

  if (!withinBooking) {
    return { status: 'error', message: TOO_MANY }
  }

  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a file to send.' }
  }

  // Refused before the bytes are read into memory. `checkUpload` bounds it
  // again from the buffer, and `attach_document` a third time from what
  // actually landed in Storage; this is the one that costs nothing.
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      status: 'error',
      message: 'That file is too large. A photograph taken on a phone is usually well under it.',
    }
  }

  const attached = await attachPublicDocument({
    token,
    kind,
    bytes: new Uint8Array(await file.arrayBuffer()),
    filename: file.name,
  })

  if (!attached.ok) {
    return { status: 'error', message: attached.error.message }
  }

  // The guest's own page, and every staff screen that says what is on file.
  // The payments queue is the one that matters: a slip arriving is the
  // difference between a clerk having evidence in front of them and not.
  revalidatePath(`/booking/${token}`)
  revalidatePath('/portal/payments')
  revalidatePath('/portal/bookings')
  revalidatePath('/portal/deposits')

  return { status: 'done', kind: attached.data.kind }
}

const TOO_MANY =
  'That is a lot of files in a short time. Please wait a little, or send it to us on WhatsApp.'
