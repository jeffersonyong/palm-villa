import { randomUUID } from 'node:crypto'

import {
  SITE_IMAGE_BUCKET,
  checkAltText,
  checkSiteImageUpload,
  isSiteImageFocus,
  isSiteImageSlot,
  siteImageStorageKey,
  type SiteImageFocus,
  type SiteImagePlacement,
} from '@/lib/domain/site-image'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'
import { isNotFound, sweepUnclaimedObjects } from './storage'

/**
 * The photographs on the public site (capability F7, architecture.md §8).
 *
 * A photograph is a row in Postgres AND an object in the public `site-images`
 * bucket, and this module is the only thing that touches either — the
 * arrangement lib/db/documents.ts has for the private buckets, with the same
 * orders of operations for the same reason. Every write has a crash in the
 * middle of it, and the orders are chosen so that what a crash leaves is the
 * recoverable state:
 *
 * - **Placing: upload, then insert.** `place_site_image()` confirms the object
 *   landed, so a row can never point at nothing. An object whose insert was
 *   refused is discarded here, and one whose insert crashed is swept.
 * - **Replacing and removing: retire, then delete.** A public bucket serves
 *   whatever is in it to anyone holding the URL, so a photograph is off the
 *   site only once its file is gone. The file is deleted straight after the
 *   write; a deletion that fails leaves the row retired and unpurged, which is
 *   exactly the queue `sweepSiteImages()` works through each night.
 *
 * **It checks no permissions** (architecture.md §4). `requirePermission()` is
 * the first line of every server action that calls this.
 */

/**
 * How long Storage's CDN, Next's image optimiser and a browser may keep a
 * photograph, in seconds.
 *
 * A day, not a year, even though no key is ever reused. The optimiser keeps a
 * resized copy for the longer of its own floor and this header, and it cannot
 * be purged — so this is how long a *removed* photograph can still be fetched
 * by somebody holding its old address. A replacement is a new URL and shows at
 * once either way.
 */
const CACHE_SECONDS = '86400'

/** Enough for every retired photograph a property could accumulate between sweeps. */
const RETRY_LIMIT = 500

export interface SiteImage {
  id: string
  placement: SiteImagePlacement
  altText: string
  focus: SiteImageFocus
  mimeType: string
  byteSize: number
  uploadedBy: string
  uploadedAt: string
  /** Its public address. No network call makes it: the bucket is public and the key fixed. */
  url: string
}

interface SiteImageRow {
  id: string
  slot: string | null
  storage_key: string
  mime_type: string
  byte_size: number
  alt_text: string
  focus: string
  uploaded_by: string
  uploaded_at: string
  unit_type: { slug: string } | null
  facility: { slug: string } | null
}

const SITE_IMAGE_COLUMNS =
  'id, slot, storage_key, mime_type, byte_size, alt_text, focus, uploaded_by, uploaded_at, unit_type(slug), facility(slug)'

function placementOf(row: SiteImageRow): SiteImagePlacement | null {
  if (row.slot !== null) {
    return isSiteImageSlot(row.slot) ? { kind: 'slot', slot: row.slot } : null
  }

  if (row.unit_type) {
    return { kind: 'unit_type', slug: row.unit_type.slug }
  }

  if (row.facility) {
    return { kind: 'facility', slug: row.facility.slug }
  }

  return null
}

function publicUrlFor(storageKey: string): string {
  return dataClient().storage.from(SITE_IMAGE_BUCKET).getPublicUrl(storageKey).data.publicUrl
}

function toSiteImage(row: SiteImageRow): SiteImage | null {
  const placement = placementOf(row)

  // site_image_one_place makes a row with no place impossible. Were one to
  // appear, a photograph that belongs nowhere is left off rather than guessed at.
  if (!placement) {
    return null
  }

  return {
    id: row.id,
    placement,
    altText: row.alt_text,
    focus: isSiteImageFocus(row.focus) ? row.focus : 'center',
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    url: publicUrlFor(row.storage_key),
  }
}

/* ── Reading ──────────────────────────────────────────────────────────────── */

/**
 * The photographs on the site now, one per place.
 *
 * Unpaged on purpose: a partial unique index allows one current row per place,
 * and the landing page has a dozen places, so the read is bounded by the page
 * rather than by the history.
 */
export async function listCurrentSiteImages(): Promise<readonly SiteImage[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('site_image')
    .select(SITE_IMAGE_COLUMNS)
    .eq('property_id', propertyId)
    .is('retired_at', null)
    .order('uploaded_at', { ascending: true })

  if (error) {
    throw new Error(`Could not read the site's photographs: ${error.message}`)
  }

  return (data as unknown as SiteImageRow[])
    .map(toSiteImage)
    .filter((image): image is SiteImage => image !== null)
}

/* ── Writing ──────────────────────────────────────────────────────────────── */

export interface SiteImageWriteError {
  code: string
  message: string
}

export type SiteImageWriteResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: SiteImageWriteError }

interface RpcRefusal {
  ok: false
  error: string
}

export interface PlaceSiteImageInput {
  placement: SiteImagePlacement
  bytes: Uint8Array
  altText: string
  focus: SiteImageFocus
  /** The photograph the dialog was opened on, or null for an empty place. */
  expectedCurrentId: string | null
  actorId: string
}

/**
 * Puts a photograph on the site, replacing whatever was there.
 *
 * The bytes and the description are checked before anything is sent to
 * Storage, so a refusal a person can fix never leaves a file behind. The uuid
 * is minted here because the storage key is derived from it, and the key has
 * to exist before the bytes can go anywhere.
 */
export async function placeSiteImage(
  input: PlaceSiteImageInput,
): Promise<SiteImageWriteResult<{ imageId: string }>> {
  const altText = checkAltText(input.altText)

  if (!altText.ok) {
    return { ok: false, error: { code: 'alt_text_invalid', message: altText.message } }
  }

  const checked = checkSiteImageUpload(input.bytes)

  if (!checked.ok) {
    return { ok: false, error: checked.error }
  }

  const propertyId = await currentPropertyId()
  const imageId = randomUUID()
  const storageKey = siteImageStorageKey({ propertyId, imageId, extension: checked.extension })
  const db = dataClient()

  const uploaded = await db.storage.from(SITE_IMAGE_BUCKET).upload(storageKey, input.bytes, {
    contentType: checked.mimeType,
    cacheControl: CACHE_SECONDS,
    upsert: false,
  })

  if (uploaded.error) {
    throw new Error(`Could not store the photo: ${uploaded.error.message}`)
  }

  const { data, error } = await db.rpc('place_site_image', {
    p_property_id: propertyId,
    p_image_id: imageId,
    ...targetOf(input.placement),
    p_expected_current_id: input.expectedCurrentId,
    p_storage_key: storageKey,
    p_mime_type: checked.mimeType,
    p_byte_size: input.bytes.length,
    p_alt_text: altText.value,
    p_focus: input.focus,
    p_actor_id: input.actorId,
  })

  if (error) {
    // An error from the client is not proof the transaction failed: a dropped
    // connection after the commit looks the same from here, and discarding the
    // object then would leave the front page pointing at nothing. So the row is
    // looked for first, and the object goes only when the database has no
    // record of it. If that read fails too, nothing is discarded — an orphan is
    // what the sweep exists for, and it is the recoverable side to err on.
    const landed = await imageRowExists(imageId).catch(() => true)

    if (!landed) {
      await discard(storageKey)
    }

    throw new Error(`Could not record the photo: ${error.message}`)
  }

  const result = data as
    { ok: true; retired: { id: string; storage_key: string } | null } | RpcRefusal

  if (!result.ok) {
    await discard(storageKey)

    return { ok: false, error: describeSiteImageFailure(result.error) }
  }

  if (result.retired) {
    await purgeSiteImage(result.retired.id, result.retired.storage_key)
  }

  return { ok: true, imageId }
}

/** The pair of arguments `place_site_image()` takes for where a photograph goes. */
function targetOf(placement: SiteImagePlacement): { p_target: string; p_slug: string } {
  switch (placement.kind) {
    case 'slot':
      return { p_target: 'slot', p_slug: placement.slot }
    case 'unit_type':
      return { p_target: 'unit_type', p_slug: placement.slug }
    case 'facility':
      return { p_target: 'facility', p_slug: placement.slug }
  }
}

/**
 * Changes a photograph's description and framing.
 *
 * `changed: false` when the save matched what was already there — the database
 * writes nothing and records nothing in that case, which is the backstop for a
 * dirty-gated Save button.
 */
export async function updateSiteImage(input: {
  imageId: string
  altText: string
  focus: SiteImageFocus
  actorId: string
}): Promise<SiteImageWriteResult<{ changed: boolean }>> {
  const altText = checkAltText(input.altText)

  if (!altText.ok) {
    return { ok: false, error: { code: 'alt_text_invalid', message: altText.message } }
  }

  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('update_site_image', {
    p_property_id: propertyId,
    p_image_id: input.imageId,
    p_alt_text: altText.value,
    p_focus: input.focus,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not save the photo: ${error.message}`)
  }

  const result = data as { ok: true; changed: boolean } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeSiteImageFailure(result.error) }
  }

  return { ok: true, changed: result.changed }
}

/**
 * Takes a photograph off the site and deletes its file.
 *
 * Retire, then delete — see the module header. The place goes back to its
 * placeholder on the next render.
 */
export async function removeSiteImage(input: {
  imageId: string
  actorId: string
}): Promise<SiteImageWriteResult> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('remove_site_image', {
    p_property_id: propertyId,
    p_image_id: input.imageId,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not remove the photo: ${error.message}`)
  }

  const result = data as { ok: true; storage_key: string } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeSiteImageFailure(result.error) }
  }

  await purgeSiteImage(input.imageId, result.storage_key)

  return { ok: true }
}

/** The database's refusals, as sentences a person at the screen can act on. */
function describeSiteImageFailure(code: string): SiteImageWriteError {
  switch (code) {
    case 'stale':
      return {
        code,
        message:
          'Someone changed this photo while you had it open. Close this and look again before saving.',
      }
    case 'not_found':
      return { code, message: 'That photo, or the place it belongs to, is no longer on the site.' }
    case 'already_removed':
      return { code, message: 'That photo has already been taken off the site.' }
    case 'object_missing':
    case 'object_empty':
      return { code, message: 'The photo did not arrive in one piece. Try uploading it again.' }
    case 'too_large':
      return {
        code,
        message: 'That photo is still larger than 4 MB after resizing. Try a smaller one.',
      }
    case 'not_an_image':
      return { code, message: 'That is not a JPEG, PNG or WebP photo. Choose a photograph.' }
    case 'alt_text_invalid':
      return { code, message: 'Describe what the photo shows, in no more than 200 characters.' }
    case 'focus_invalid':
      return { code, message: 'Choose which part of the photo to keep in view.' }
    default:
      return { code, message: 'That photo could not be saved.' }
  }
}

/* ── Deleting files ───────────────────────────────────────────────────────── */

async function imageRowExists(imageId: string): Promise<boolean> {
  const { data, error } = await dataClient()
    .from('site_image')
    .select('id')
    .eq('id', imageId)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read site photo ${imageId}: ${error.message}`)
  }

  return data !== null
}

/** Best-effort cleanup of an object no row will ever point at. The sweep catches a miss. */
async function discard(storageKey: string): Promise<void> {
  await dataClient().storage.from(SITE_IMAGE_BUCKET).remove([storageKey])
}

/**
 * Deletes a retired photograph's file and records that it is gone.
 *
 * A 404 counts as success: the file is not there, which is the outcome asked
 * for. A failed deletion returns false and leaves the row in the retry queue.
 */
async function purgeSiteImage(imageId: string, storageKey: string): Promise<boolean> {
  const db = dataClient()
  const removed = await db.storage.from(SITE_IMAGE_BUCKET).remove([storageKey])

  if (removed.error && !isNotFound(removed.error)) {
    return false
  }

  const { error } = await db
    .from('site_image')
    .update({ purged_at: new Date().toISOString() })
    .eq('id', imageId)

  if (error) {
    throw new Error(`Could not record that site photo ${imageId} was deleted: ${error.message}`)
  }

  return true
}

export interface SiteImageSweep {
  /** Files of retired photographs deleted on this run. */
  purged: number
  /** Retired photographs whose file could not be deleted this time. Tried again next run. */
  failed: number
  /** Files deleted because no row claimed them. */
  sweptOrphans: number
}

/**
 * The nightly tidy of the public bucket, run by the document-retention job.
 *
 * Two passes. First the retry queue: photographs retired but whose file was
 * never confirmed gone. Then the orphans: files no row claims — an upload whose
 * insert crashed, or a photograph whose facility was deleted in Property
 * settings and took the row with it.
 */
export async function sweepSiteImages(options: { now?: Date } = {}): Promise<SiteImageSweep> {
  const propertyId = await currentPropertyId()
  const now = options.now ?? new Date()

  const { data, error } = await dataClient()
    .from('site_image')
    .select('id, storage_key')
    .eq('property_id', propertyId)
    .not('retired_at', 'is', null)
    .is('purged_at', null)
    .limit(RETRY_LIMIT)

  if (error) {
    throw new Error(`Could not read the site photos awaiting deletion: ${error.message}`)
  }

  let purged = 0
  let failed = 0

  for (const row of data as { id: string; storage_key: string }[]) {
    if (await purgeSiteImage(row.id, row.storage_key)) {
      purged += 1
    } else {
      failed += 1
    }
  }

  const sweptOrphans = await sweepUnclaimedObjects({
    bucket: SITE_IMAGE_BUCKET,
    table: 'site_image',
    propertyId,
    now,
  })

  return { purged, failed, sweptOrphans }
}
