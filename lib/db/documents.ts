import { randomUUID } from 'node:crypto'

import {
  bucketFor,
  checkUpload,
  isExpired,
  sanitiseFilename,
  storageKeyFor,
  storagePrefixFor,
  BUCKET_FOR_KIND,
  DOCUMENT_KINDS,
  type DocumentKind,
} from '@/lib/domain/document'
import { dataClient } from '@/lib/supabase/data'

import { recordAuditEvent } from './audit'
import { currentPropertyId } from './property'

/**
 * Stored documents (capabilities B10, G2, G3, G4).
 *
 * architecture.md §2: all database access lives in `lib/db`. This module also
 * owns every Storage call in the product — uploading, signing, deleting — for
 * the same reason, and because the two have to move together: a document is a
 * row in Postgres AND an object in Storage, and nothing outside this file
 * should have to remember that.
 *
 * ── The order of operations, which is the whole design ────────────────────
 *
 * Storage and Postgres are two systems, so every write here has a crash in the
 * middle of it. The orders are chosen so that the state a crash leaves is
 * always the recoverable one:
 *
 * - **Attaching: upload, then insert.** A row pointing at nothing is a broken
 *   link on somebody's screen. An object with no row is invisible, and the
 *   nightly sweep collects it. `attach_document()` then reads
 *   `storage.objects` to confirm the upload landed, which closes the first case
 *   in the database rather than in this file.
 * - **Removing: tombstone, then delete.** From the instant the row is
 *   tombstoned nothing will sign a URL for it, so a crash before the object is
 *   deleted leaves a file nobody can reach and the job retries. The reverse
 *   order would leave a live row serving a link to a file that is gone.
 * - **Opening: log, then sign.** A signed URL that was never logged is an
 *   access G3 promised to record and did not. A logged view whose signing then
 *   failed is one line of over-recording, which is the safe direction.
 *
 * ── What this module does NOT do ──────────────────────────────────────────
 *
 * **It checks no permissions.** architecture.md §4 puts authorisation in the
 * server layer — `requirePermission()` at the top of every server action, and
 * `mayOpen()` in the route handler that serves a file. A permission check
 * buried in a query function is one a future caller can forget to trigger and
 * one no test of the screen can see.
 */

export interface Document {
  id: string
  kind: DocumentKind
  bookingId: string
  /** Set only on a slip. */
  paymentId: string | null
  /** Set only on an inspection photograph. */
  inspectionId: string | null
  /** Display text. Never part of the storage key — see `storageKeyFor`. */
  filename: string
  mimeType: string
  byteSize: number
  uploadedBy: string | null
  uploadedAt: string
  /** When this stops being kept (capability G4). */
  retainUntil: string
  /** True once `retainUntil` has passed, whether or not the job has run. */
  expired: boolean
}

interface DocumentRow {
  id: string
  kind: string
  booking_id: string
  payment_id: string | null
  inspection_id: string | null
  bucket_id: string
  storage_key: string
  original_filename: string
  mime_type: string
  byte_size: number
  uploaded_by: string | null
  uploaded_at: string
  retain_until: string
  deleted_at: string | null
}

const DOCUMENT_COLUMNS =
  'id, kind, booking_id, payment_id, inspection_id, bucket_id, storage_key, original_filename, mime_type, byte_size, uploaded_by, uploaded_at, retain_until, deleted_at'

function toDocument(row: DocumentRow, now: Date): Document {
  return {
    id: row.id,
    kind: row.kind as DocumentKind,
    bookingId: row.booking_id,
    paymentId: row.payment_id,
    inspectionId: row.inspection_id,
    filename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    retainUntil: row.retain_until,
    expired: isExpired(row.retain_until, now),
  }
}

export interface DocumentWriteError {
  code: string
  message: string
}

export type DocumentWriteResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: DocumentWriteError }

/* ── Reads ────────────────────────────────────────────────────────────────── */

/**
 * What is on file for a booking, oldest first.
 *
 * **Excludes anything expired as well as anything removed.** Retention is read
 * here as well as by the nightly job, so a document stops being offered the
 * moment it falls due rather than whenever the job next runs — otherwise a
 * screen would render an Open link that `issueDocumentUrl` then refuses, which
 * reads as a fault rather than as a policy.
 */
export async function listDocumentsForBooking(
  bookingId: string,
  kind?: DocumentKind,
): Promise<readonly Document[]> {
  const propertyId = await currentPropertyId()
  const now = new Date()

  let query = dataClient()
    .from('document')
    .select(DOCUMENT_COLUMNS)
    .eq('property_id', propertyId)
    .eq('booking_id', bookingId)
    .is('deleted_at', null)
    .gt('retain_until', now.toISOString())
    .order('uploaded_at', { ascending: true })

  if (kind) {
    query = query.eq('kind', kind)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Could not read the documents for booking ${bookingId}: ${error.message}`)
  }

  return (data as unknown as DocumentRow[]).map((row) => toDocument(row, now))
}

/**
 * The id of every document this booking has ever carried, tombstones included.
 *
 * For the history panels, and the distinction from `listDocumentsForBooking` is
 * the point. That one lists what is *on file* — a deleted document is not — but
 * an audit trail that forgets a document the moment it is deleted would lose
 * the record of who opened it, which is capability G3's whole promise, and it
 * would lose it at exactly the moment somebody is asking. A tombstone is kept
 * so the trail stays resolvable; this is what resolves it.
 */
export async function listDocumentIdsForBooking(
  bookingId: string,
  kind?: DocumentKind,
): Promise<readonly string[]> {
  const propertyId = await currentPropertyId()

  let query = dataClient()
    .from('document')
    .select('id')
    .eq('property_id', propertyId)
    .eq('booking_id', bookingId)

  // A deposit's history wants the photographs alone, tombstones included —
  // the other kinds are labelled on the booking's own screen.
  if (kind) {
    query = query.eq('kind', kind)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Could not read the documents for booking ${bookingId}: ${error.message}`)
  }

  return (data as { id: string }[]).map((row) => row.id)
}

/** One document, live or not — the route handler decides what to do about it. */
export async function getDocument(documentId: string): Promise<Document | null> {
  const row = await readRow(documentId)

  return row ? toDocument(row, new Date()) : null
}

async function readRow(documentId: string): Promise<DocumentRow | null> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('document')
    .select(DOCUMENT_COLUMNS)
    .eq('property_id', propertyId)
    .eq('id', documentId)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read document ${documentId}: ${error.message}`)
  }

  return (data as unknown as DocumentRow | null) ?? null
}

/* ── Attaching ────────────────────────────────────────────────────────────── */

export interface AttachDocumentInput {
  kind: DocumentKind
  bookingId: string
  /** Required for a slip, refused otherwise. */
  paymentId?: string | null
  /** Required for a photograph, refused otherwise. */
  inspectionId?: string | null
  bytes: Uint8Array
  /** Whatever the browser called it. Sanitised here. */
  filename: string
  actorId: string | null
  /**
   * For an accounting pack only: the instant its facts were read, as an ISO
   * string. Refused on every other kind. See `assembleAccountingPack` in
   * ./packs.ts for why it is captured before the reads and not after.
   */
  assembledFrom?: string
}

/** A pack this one replaced, whose object is now the caller's to delete. */
export interface SupersededObject {
  id: string
  bucketId: string
  storageKey: string
}

export interface AttachedDocument {
  documentId: string
  retainUntil: string
  /** Empty for every kind but a pack. */
  superseded: readonly SupersededObject[]
}

/**
 * Stores a file and records it.
 *
 * Upload first, then insert — see the module header. The uuid is minted here
 * rather than by the database because the storage key is derived from it, and
 * the key has to exist before the bytes can be sent anywhere.
 *
 * A refusal from the database leaves an object nothing points at, so the object
 * is removed on the way out. That cleanup is best-effort on purpose: if it
 * fails, the sweep collects it, and reporting a storage error over the top of
 * the refusal the clerk actually needs to read would be the wrong trade.
 */
export async function attachDocument(
  input: AttachDocumentInput,
): Promise<DocumentWriteResult<AttachedDocument>> {
  const checked = checkUpload(input.kind, input.bytes)

  if (!checked.ok) {
    return { ok: false, error: checked.error }
  }

  const propertyId = await currentPropertyId()
  const documentId = randomUUID()
  const bucket = bucketFor(input.kind)
  const storageKey = storageKeyFor({ propertyId, documentId, extension: checked.extension })
  const db = dataClient()

  const uploaded = await db.storage.from(bucket).upload(storageKey, input.bytes, {
    contentType: checked.mimeType,
    upsert: false,
  })

  if (uploaded.error) {
    throw new Error(`Could not store the file: ${uploaded.error.message}`)
  }

  const { data, error } = await db.rpc('attach_document', {
    p_property_id: propertyId,
    p_document_id: documentId,
    p_kind: input.kind,
    p_booking_id: input.bookingId,
    p_payment_id: input.paymentId ?? null,
    p_inspection_id: input.inspectionId ?? null,
    p_bucket_id: bucket,
    p_storage_key: storageKey,
    p_original_filename: sanitiseFilename(input.filename, input.kind),
    p_mime_type: checked.mimeType,
    p_byte_size: input.bytes.length,
    p_actor_id: input.actorId,
    p_assembled_from: input.assembledFrom ?? null,
  })

  if (error) {
    // An error from the client is not proof the transaction failed: a dropped
    // connection after the commit looks the same from here. Discarding the
    // object on that evidence alone would leave a live row pointing at
    // nothing — and for an accounting pack, whose predecessor was tombstoned
    // in that same transaction, it would leave the booking with no pack at
    // all and nothing due to rebuild it. So the row is looked for first, and
    // the object is removed only when the database has no record of it. If
    // the re-read fails too, nothing is discarded: an orphaned object is what
    // the nightly sweep exists for, and it is the recoverable side to err on.
    const landed = await readRow(documentId).catch(() => null)

    if (!landed) {
      await discard(bucket, storageKey)
    }

    throw new Error(`Could not record the document: ${error.message}`)
  }

  const result = data as
    | {
        ok: true
        retain_until: string
        superseded: readonly { id: string; bucket_id: string; storage_key: string }[]
      }
    | RpcRefusal

  if (!result.ok) {
    await discard(bucket, storageKey)

    return { ok: false, error: describeAttachFailure(result) }
  }

  return {
    ok: true,
    documentId,
    retainUntil: result.retain_until,
    superseded: result.superseded.map((row) => ({
      id: row.id,
      bucketId: row.bucket_id,
      storageKey: row.storage_key,
    })),
  }
}

/** Best-effort cleanup of an object no row will ever point at. */
async function discard(bucket: string, storageKey: string): Promise<void> {
  await dataClient().storage.from(bucket).remove([storageKey])
}

interface RpcRefusal {
  ok: false
  error: string
  [key: string]: unknown
}

function describeAttachFailure(result: RpcRefusal): DocumentWriteError {
  switch (result.error) {
    case 'not_on_this_booking':
      return {
        code: result.error,
        message: 'That payment or inspection belongs to a different booking.',
      }
    case 'not_a_transfer':
      return {
        code: result.error,
        message: 'A slip belongs to a bank transfer. Cash was counted at the desk.',
      }
    case 'slip_already_attached':
      return {
        code: result.error,
        message: 'This payment already has a slip on file. Remove it before attaching another.',
      }
    case 'pointer_missing':
      return { code: result.error, message: 'There is nothing to attach this to.' }
    case 'pointer_not_allowed':
      return { code: result.error, message: 'That kind of document is attached to the booking.' }
    case 'object_missing':
    case 'object_empty':
      return {
        code: result.error,
        message: 'The file did not arrive in one piece. Try attaching it again.',
      }
    case 'retention_unconfigured':
      return {
        code: result.error,
        message:
          'No retention period is set for this kind of document, so it cannot be stored yet.',
      }
    case 'filename_required':
      return { code: result.error, message: 'That file has no usable name.' }
    case 'superseded_by_newer':
      return {
        code: result.error,
        message: 'A newer pack was assembled while this one was being built.',
      }
    case 'assembled_from_required':
    case 'assembled_from_not_allowed':
      return { code: result.error, message: 'That kind of document cannot be filed that way.' }
    case 'invalid_kind':
    case 'invalid_mime_type':
      return { code: result.error, message: 'That file cannot be stored.' }
    default:
      return { code: result.error, message: 'That booking no longer exists.' }
  }
}

/* ── Removing ─────────────────────────────────────────────────────────────── */

/**
 * Takes a document out of use and deletes the file behind it.
 *
 * Tombstone, then delete — see the module header. A failed deletion leaves the
 * row tombstoned with no `purged_at`, which is exactly the queue
 * `purgeTombstoned()` works through, so the file is removed on the next nightly
 * run rather than left forever.
 */
export async function removeDocument(input: {
  documentId: string
  actorId: string | null
}): Promise<DocumentWriteResult> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('remove_document', {
    p_property_id: propertyId,
    p_document_id: input.documentId,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not remove the document: ${error.message}`)
  }

  const result = data as { ok: true; bucket_id: string; storage_key: string } | RpcRefusal

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === 'already_removed'
          ? { code: result.error, message: 'That document has already been removed.' }
          : { code: result.error, message: 'That document no longer exists.' },
    }
  }

  await purge(input.documentId, result.bucket_id, result.storage_key)

  return { ok: true }
}

/**
 * Deletes the object and records that it is gone.
 *
 * A 404 from Storage counts as success: the file is not there, which is the
 * outcome asked for, and treating it as a failure would leave the row in the
 * retry queue forever.
 *
 * Exported for ./packs.ts, whose superseded packs are tombstoned by the
 * database and purged by this — the same two-step as a removal, so the same
 * retry queue catches a deletion that did not finish.
 */
export async function purge(
  documentId: string,
  bucket: string,
  storageKey: string,
): Promise<boolean> {
  const db = dataClient()
  const removed = await db.storage.from(bucket).remove([storageKey])

  if (removed.error && !isNotFound(removed.error)) {
    return false
  }

  const { error } = await db
    .from('document')
    .update({ purged_at: new Date().toISOString() })
    .eq('id', documentId)

  if (error) {
    throw new Error(`Could not record that document ${documentId} was deleted: ${error.message}`)
  }

  return true
}

/**
 * Did Storage say the object is not there?
 *
 * Read from the status rather than the sentence. Matching on the message meant
 * any future wording carrying "not found" — a missing *bucket*, say — counted
 * as a successful delete, which would mark a row purged whose file is still
 * sitting in a private bucket. A status is the machine-readable half, and it is
 * what the rest of this layer already keys on.
 */
function isNotFound(error: { status?: number; statusCode?: string }): boolean {
  return error.status === 404 || error.statusCode === '404'
}

/* ── Reading the bytes ────────────────────────────────────────────────────── */

/**
 * The file itself, for the server to work on.
 *
 * The one read of an object that is not a signed URL, and it exists for the
 * accounting pack: copying a slip into the pack means having its bytes here.
 * It is deliberately NOT a `document.viewed` event. That verb records a link
 * issued to a person (capability G3), and the only kind read this way is a
 * slip — the pack references an identity document and never opens one (see
 * lib/domain/pack.ts), so the promise G3 makes about ICs is untouched. Were a
 * pack ever to copy an IC in, this is where the audit row would have to go.
 *
 * Refuses the same facts `issueDocumentUrl` refuses: a tombstoned row and one
 * past its retention date. Null rather than an error, because a slip removed
 * between the listing and the read is an ordinary race, and the pack goes on
 * without it.
 */
export async function readDocumentBytes(documentId: string): Promise<Uint8Array | null> {
  const row = await readRow(documentId)

  if (!row || row.deleted_at || isExpired(row.retain_until)) {
    return null
  }

  const { data, error } = await dataClient().storage.from(row.bucket_id).download(row.storage_key)

  if (error || !data) {
    throw new Error(`Could not read document ${documentId}: ${error?.message ?? 'no data'}`)
  }

  return new Uint8Array(await data.arrayBuffer())
}

/* ── Opening ──────────────────────────────────────────────────────────────── */

export type DocumentUrlResult =
  { ok: true; url: string; document: Document } | { ok: false; error: DocumentWriteError }

/**
 * A short-lived link to the file, and the log entry that G3 promises.
 *
 * Sixty seconds, per architecture.md §8. Long enough for a browser to follow a
 * redirect and start rendering, short enough that a URL copied out of a history
 * panel is dead before it can be pasted anywhere.
 *
 * **The audit row is written before the URL is signed.** G3 is "every access to
 * an identity document is logged", and the failure mode that breaks it is a URL
 * that exists with no record of who asked for it. Doing it in this order can
 * over-record — a logged view whose signing then failed — and that is the side
 * to err on.
 *
 * The permission check is the caller's (architecture.md §4). This refuses only
 * on the facts it owns: a document that was removed, and one whose retention
 * has run out.
 */
export async function issueDocumentUrl(input: {
  documentId: string
  actorId: string | null
}): Promise<DocumentUrlResult> {
  const row = await readRow(input.documentId)

  if (!row) {
    return { ok: false, error: { code: 'not_found', message: 'That document no longer exists.' } }
  }

  if (row.deleted_at) {
    return { ok: false, error: { code: 'removed', message: 'That document has been deleted.' } }
  }

  const document = toDocument(row, new Date())

  if (document.expired) {
    return {
      ok: false,
      error: {
        code: 'expired',
        message: 'That document has passed its retention period and is being deleted.',
      },
    }
  }

  await recordAuditEvent({
    actorId: input.actorId,
    action: 'document.viewed',
    entityType: 'document',
    entityId: document.id,
    after: {
      kind: document.kind,
      booking_id: document.bookingId,
      filename: document.filename,
    },
  })

  const { data, error } = await dataClient()
    .storage.from(row.bucket_id)
    .createSignedUrl(row.storage_key, SIGNED_URL_SECONDS)

  if (error || !data) {
    throw new Error(`Could not open the document: ${error?.message ?? 'no URL was returned'}`)
  }

  return { ok: true, url: data.signedUrl, document }
}

/** architecture.md §8: "short-lived signed URLs (60 s)". */
const SIGNED_URL_SECONDS = 60

/* ── Retention (capability G4) ────────────────────────────────────────────── */

export interface RetentionRun {
  /** Rows tombstoned because their retention period ran out. */
  expired: number
  /** Objects deleted from Storage, across both the expiries and the retries. */
  purged: number
  /** Objects deleted because no row claimed them. */
  sweptOrphans: number
  /** Rows whose object could not be deleted this time. They are tried again. */
  failed: number
}

/**
 * The nightly job, in three passes (architecture.md §8).
 *
 * Everything here is per-row failure-tolerant: one object Storage will not
 * delete must not stop the rest of a night's work, so a failure is counted and
 * the row stays in the retry queue.
 */
export async function runRetention(
  options: { now?: Date; limit?: number } = {},
): Promise<RetentionRun> {
  const propertyId = await currentPropertyId()
  const now = options.now ?? new Date()

  const { data, error } = await dataClient().rpc('expire_due_documents', {
    p_property_id: propertyId,
    p_now: now.toISOString(),
    p_limit: options.limit ?? 200,
  })

  if (error) {
    throw new Error(`Could not expire due documents: ${error.message}`)
  }

  const result = data as {
    ok: true
    documents: readonly { id: string; bucket_id: string; storage_key: string }[]
  }

  const attempted: string[] = []
  let purged = 0
  let failed = 0

  for (const document of result.documents) {
    attempted.push(document.id)

    if (await purge(document.id, document.bucket_id, document.storage_key)) {
      purged += 1
    } else {
      failed += 1
    }
  }

  // The rows just tombstoned are excluded from the retry pass. Without that
  // they are still tombstoned-and-unpurged, so the pass below picks up every
  // one that just failed, tries it a second time in the same run, and counts it
  // twice — and `failed` is the figure the job reports for a deletion nobody
  // else is watching.
  const retried = await purgeTombstoned({ skip: attempted })
  const sweptOrphans = await sweepOrphanObjects({ now })

  return {
    expired: result.documents.length,
    purged: purged + retried.purged,
    sweptOrphans,
    failed: failed + retried.failed,
  }
}

/**
 * Deletes the objects behind rows that were tombstoned but never purged.
 *
 * The retry queue for both halves of the two-step delete: a removal whose
 * Storage call failed, and an expiry interrupted mid-run.
 */
export async function purgeTombstoned(
  options: { skip?: readonly string[] } = {},
): Promise<{ purged: number; failed: number }> {
  const propertyId = await currentPropertyId()
  const skip = new Set(options.skip ?? [])

  const { data, error } = await dataClient()
    .from('document')
    .select('id, bucket_id, storage_key')
    .eq('property_id', propertyId)
    .not('deleted_at', 'is', null)
    .is('purged_at', null)
    .limit(500)

  if (error) {
    throw new Error(`Could not read the documents awaiting deletion: ${error.message}`)
  }

  const rows = (data as unknown as { id: string; bucket_id: string; storage_key: string }[]).filter(
    (row) => !skip.has(row.id),
  )
  let purged = 0
  let failed = 0

  for (const row of rows) {
    if (await purge(row.id, row.bucket_id, row.storage_key)) {
      purged += 1
    } else {
      failed += 1
    }
  }

  return { purged, failed }
}

/**
 * Deletes objects no document row claims.
 *
 * Two things produce one: an upload that succeeded and whose insert was then
 * refused or crashed, and a booking deleted outright, which cascades its rows
 * away and leaves the files behind. Neither is reachable through a screen, and
 * an orphan is invisible — which is precisely why something has to look.
 *
 * The one-hour floor is what keeps this from racing an upload in flight: an
 * object written a second ago may be seconds away from its insert.
 */
export async function sweepOrphanObjects(options: { now?: Date } = {}): Promise<number> {
  const propertyId = await currentPropertyId()
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - ORPHAN_GRACE_MS)
  const db = dataClient()
  const prefix = storagePrefixFor(propertyId)

  let swept = 0

  for (const kind of DOCUMENT_KINDS) {
    const bucket = BUCKET_FOR_KIND[kind]
    const candidates: string[] = []

    // Storage lists a page at a time, so the sweep pages too. A single request
    // would examine the first thousand objects for the life of the property and
    // silently never look past them — which is the same class of quiet failure
    // the sweep exists to catch.
    //
    // Every page is listed BEFORE anything is deleted. Removing objects while
    // paging shifts each later page's offset by however many went, so the sweep
    // would step over the files that moved up into the gap.
    for (let offset = 0; ; offset += STORAGE_PAGE) {
      const listed = await db.storage.from(bucket).list(prefix, {
        limit: STORAGE_PAGE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })

      if (listed.error || !listed.data || listed.data.length === 0) {
        break
      }

      for (const object of listed.data) {
        if (new Date(object.created_at ?? now.toISOString()) < cutoff) {
          candidates.push(`${prefix}/${object.name}`)
        }
      }

      if (listed.data.length < STORAGE_PAGE) {
        break
      }
    }

    swept += await removeUnclaimed(bucket, propertyId, candidates)
  }

  return swept
}

/**
 * Of these keys, deletes the ones no document row claims.
 *
 * Asked in batches because PostgREST sends `in` as a query string: a thousand
 * 45-character keys in one filter is a URL long enough for a proxy to refuse,
 * which would abort the sweep for that bucket rather than skip a file.
 */
async function removeUnclaimed(
  bucket: string,
  propertyId: string,
  keys: readonly string[],
): Promise<number> {
  const db = dataClient()
  let swept = 0

  for (let from = 0; from < keys.length; from += CLAIM_BATCH) {
    const batch = keys.slice(from, from + CLAIM_BATCH)

    const { data, error } = await db
      .from('document')
      .select('storage_key')
      .eq('property_id', propertyId)
      .in('storage_key', batch)

    if (error) {
      throw new Error(`Could not check for orphaned files: ${error.message}`)
    }

    const known = new Set((data as { storage_key: string }[]).map((row) => row.storage_key))
    const orphans = batch.filter((key) => !known.has(key))

    if (orphans.length === 0) {
      continue
    }

    const removed = await db.storage.from(bucket).remove(orphans)

    if (!removed.error) {
      swept += orphans.length
    }
  }

  return swept
}

/** Objects per Storage listing request, and keys per claim lookup. */
const STORAGE_PAGE = 1000
const CLAIM_BATCH = 200

/**
 * How old an unclaimed object must be before the sweep takes it.
 *
 * An hour rather than a minute because the cost of waiting is a file sitting in
 * a private bucket, and the cost of being wrong is deleting somebody's upload
 * between the moment it landed and the moment its row was written.
 */
const ORPHAN_GRACE_MS = 60 * 60 * 1000
