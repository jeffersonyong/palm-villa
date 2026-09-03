'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getBookingById } from '@/lib/db/bookings'
import { attachDocument, getDocument, removeDocument } from '@/lib/db/documents'
import {
  ATTACH_PERMISSION,
  DOCUMENT_KIND_LABELS,
  isDocumentKind,
  MAX_DOCUMENT_BYTES,
  type DocumentKind,
} from '@/lib/domain/document'

/**
 * Attaching and removing a stored file (capabilities B10, B4, C2).
 *
 * One pair of actions for all three kinds, because the act is the same one
 * three times — the differences are which permission gates it, what the file
 * hangs off, and which screens have to be revalidated afterwards, and all three
 * are data rather than control flow.
 *
 * ── One file per call, and that is the platform's decision ────────────────
 *
 * Vercel caps a function's request body at 4.5 MB, so several photographs in
 * one submission would fail on the fourth one with a message from the
 * infrastructure rather than from this product. The photographs dialog calls
 * this once per selected file and reports each result separately, which also
 * means one bad file among five does not lose the other four.
 *
 * ── The permission is the kind's, not this file's ─────────────────────────
 *
 * architecture.md §4 requires `requirePermission(...)` at the top of every
 * mutation, and the string comes from ATTACH_PERMISSION in lib/domain — the
 * same table the screens read to decide whether to draw the control. A kind
 * nobody may attach (the accounting pack, written by capability G5) has a null
 * there and is refused before any permission is consulted, because there is no
 * permission that would satisfy it.
 */

export interface DocumentActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
}

const attachSchema = z.object({
  kind: z.string().refine(isDocumentKind, 'That is not a kind of document.'),
  bookingId: z.string().uuid(),
  paymentId: z.string().uuid().optional(),
  inspectionId: z.string().uuid().optional(),
})

const removeSchema = z.object({
  documentId: z.string().uuid(),
})

export async function attachDocumentAction(
  _previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const raw = Object.fromEntries(formData)
  const parsed = attachSchema.safeParse({
    kind: raw.kind,
    bookingId: raw.bookingId,
    // An empty string is what an unset hidden input submits, and `uuid()`
    // refuses one — so absence has to be expressed as absence.
    paymentId: raw.paymentId || undefined,
    inspectionId: raw.inspectionId || undefined,
  })

  if (!parsed.success) {
    return { status: 'error', message: 'That document could not be attached.' }
  }

  const kind = parsed.data.kind as DocumentKind
  const permission = ATTACH_PERMISSION[kind]

  if (permission === null) {
    // The accounting pack. Nothing attaches one by hand, so there is no
    // permission to check and no honest way to allow it.
    return { status: 'error', message: 'That kind of document is generated, not uploaded.' }
  }

  const actor = await requirePermission(permission)

  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return {
      status: 'error',
      fieldErrors: { file: 'Choose a file to attach.' },
    }
  }

  // Checked here as well as in `checkUpload`, because reading a 40 MB file into
  // memory to then refuse it is work worth skipping — and because a body this
  // large will have been refused by the platform before it arrives anyway.
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      status: 'error',
      fieldErrors: {
        file: `That file is larger than ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB. A photograph taken on a phone is usually well under it.`,
      },
    }
  }

  const result = await attachDocument({
    kind,
    bookingId: parsed.data.bookingId,
    paymentId: parsed.data.paymentId ?? null,
    inspectionId: parsed.data.inspectionId ?? null,
    bytes: new Uint8Array(await file.arrayBuffer()),
    filename: file.name,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', fieldErrors: { file: result.error.message } }
  }

  await revalidateDocumentScreens(parsed.data.bookingId)

  return {
    status: 'done',
    message: `${DOCUMENT_KIND_LABELS[kind]} attached.`,
  }
}

export async function removeDocumentAction(
  _previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const parsed = removeSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return { status: 'error', message: 'That document could not be removed.' }
  }

  // Read before the permission check, because which permission applies depends
  // on what kind of document it is. The read discloses nothing — it does not
  // sign a URL and it writes no audit row.
  const document = await getDocument(parsed.data.documentId)

  if (!document) {
    return { status: 'error', message: 'That document no longer exists.' }
  }

  const permission = ATTACH_PERMISSION[document.kind]

  if (permission === null) {
    return { status: 'error', message: 'That kind of document cannot be removed by hand.' }
  }

  const actor = await requirePermission(permission)

  const result = await removeDocument({
    documentId: parsed.data.documentId,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  await revalidateDocumentScreens(document.bookingId)

  return { status: 'done', message: `${DOCUMENT_KIND_LABELS[document.kind]} removed.` }
}

/**
 * Every screen a document appears on.
 *
 * Four of them, because one file can be read from four places: the booking's
 * own record, the verification queue (a slip changes the "on file" cell), the
 * deposit screen (photographs sit under the inspection) and the deposits
 * ledger. The booking reference is looked up rather than passed in, so a caller
 * cannot revalidate the wrong record by sending a stale one.
 */
async function revalidateDocumentScreens(bookingId: string): Promise<void> {
  const booking = await getBookingById(bookingId)

  revalidatePath('/portal/payments')

  if (!booking) {
    return
  }

  revalidatePath(`/portal/bookings/${booking.reference}`)
  revalidatePath(`/portal/deposits/${booking.reference}`)
  revalidatePath('/portal/deposits')
}
