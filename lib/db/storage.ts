import { dataClient } from '@/lib/supabase/data'

/**
 * Storage mechanics shared by every table that owns files (architecture.md §8.1).
 *
 * Two tables claim objects by `storage_key` now — `document`, across the four
 * private buckets, and `site_image`, in the public one (capability F7) — and
 * both need the same two things from Storage: to tell a deletion that found
 * nothing from one that failed, and to sweep up objects no row claims. Neither
 * is about what a file is for, so they are written once, here, rather than
 * copied into each module and left to drift apart.
 */

/** The tables whose rows claim an object by `storage_key` under a property. */
export type ObjectOwnerTable = 'document' | 'site_image'

/**
 * Did Storage say the object is not there?
 *
 * Read from the status rather than the sentence. Matching on the message meant
 * any future wording carrying "not found" — a missing *bucket*, say — counted
 * as a successful delete, which would mark a row purged whose file is still
 * sitting in a bucket. A status is the machine-readable half, and it is what
 * the rest of this layer already keys on.
 */
export function isNotFound(error: { status?: number; statusCode?: string }): boolean {
  return error.status === 404 || error.statusCode === '404'
}

/**
 * How old an unclaimed object must be before a sweep takes it.
 *
 * An hour rather than a minute because the cost of waiting is a file sitting in
 * a bucket, and the cost of being wrong is deleting somebody's upload between
 * the moment it landed and the moment its row was written.
 */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000

/** Objects per Storage listing request, and keys per claim lookup. */
const STORAGE_PAGE = 1000
const CLAIM_BATCH = 200

/**
 * Deletes the objects in one bucket, under one property, that no row claims.
 *
 * Two things produce one: an upload that succeeded and whose insert was then
 * refused or crashed, and a row deleted by a cascade — a booking for a
 * document, a facility for a photograph — which takes the row and leaves the
 * file. Neither is reachable through a screen, and an orphan is invisible,
 * which is precisely why something has to look.
 *
 * Keys are `{propertyId}/{id}.{ext}` for every owner, flat under the property,
 * so one listing of the property's prefix is the whole bucket's share. The
 * one-hour floor is what keeps this from racing an upload in flight.
 */
export async function sweepUnclaimedObjects(input: {
  bucket: string
  table: ObjectOwnerTable
  propertyId: string
  now: Date
}): Promise<number> {
  const cutoff = new Date(input.now.getTime() - ORPHAN_GRACE_MS)
  const db = dataClient()
  const prefix = input.propertyId
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
    const listed = await db.storage.from(input.bucket).list(prefix, {
      limit: STORAGE_PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (listed.error || !listed.data || listed.data.length === 0) {
      break
    }

    for (const object of listed.data) {
      if (new Date(object.created_at ?? input.now.toISOString()) < cutoff) {
        candidates.push(`${prefix}/${object.name}`)
      }
    }

    if (listed.data.length < STORAGE_PAGE) {
      break
    }
  }

  return removeUnclaimed(input.bucket, input.table, input.propertyId, candidates)
}

/**
 * Of these keys, deletes the ones no row in `table` claims.
 *
 * Asked in batches because PostgREST sends `in` as a query string: a thousand
 * 45-character keys in one filter is a URL long enough for a proxy to refuse,
 * which would abort the sweep for that bucket rather than skip a file.
 */
async function removeUnclaimed(
  bucket: string,
  table: ObjectOwnerTable,
  propertyId: string,
  keys: readonly string[],
): Promise<number> {
  const db = dataClient()
  let swept = 0

  for (let from = 0; from < keys.length; from += CLAIM_BATCH) {
    const batch = keys.slice(from, from + CLAIM_BATCH)

    const { data, error } = await db
      .from(table)
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
