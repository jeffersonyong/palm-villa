import { SITE_IMAGE_BUCKET } from '@/lib/domain/site-image'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from '../property'

/**
 * Fixtures for the site's photographs (capability F7).
 *
 * Kept apart from factory.ts because they break that file's one rule on
 * purpose. Every other fixture goes through the write path the portal uses;
 * the facility below is inserted directly, because it is scaffolding rather
 * than the subject — and the alternative is worse. The `site-images` bucket is
 * never emptied between tests (setup.ts), so a test that put a photograph on
 * the seeded pool or on the hero would retire a photo somebody uploaded by hand
 * to look at the front page.
 */

/**
 * The smallest thing that is genuinely a JPEG: the start-of-image marker and a
 * JFIF header, so `sniffMimeType` recognises it and `checkSiteImageUpload`
 * accepts it. Bytes rather than a file on disk, for the reason TEST_PNG gives.
 */
export const TEST_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
])

/** Every fixture facility's slug starts with this, so a crashed run's leftovers can be found. */
const PHOTO_FACILITY_PREFIX = 'test-photos-'

export interface PhotoFacility {
  id: string
  slug: string
  name: string
}

/**
 * A facility that exists only for a test to put photographs on.
 *
 * Outside the day pass and sorted last, so /day-pass and the FAQ — which read
 * facilities live — never offer it, and it sits at the foot of Property
 * settings for the moment a test holds it.
 */
export async function givenPhotoFacility(): Promise<PhotoFacility> {
  const propertyId = await currentPropertyId()
  const suffix = crypto.randomUUID().slice(0, 8)

  const { data, error } = await dataClient()
    .from('facility')
    .insert({
      property_id: propertyId,
      slug: `${PHOTO_FACILITY_PREFIX}${suffix}`,
      name: `Test photos ${suffix}`,
      included_in_day_pass: false,
      sort_order: 999,
    })
    .select('id, slug, name')
    .single()

  if (error || !data) {
    throw new Error(`Test setup could not create a photo facility: ${error?.message}`)
  }

  return data as PhotoFacility
}

/**
 * Removes a fixture facility, the photographs on it and their files.
 *
 * The files first: deleting the facility cascades its `site_image` rows away,
 * and a file whose row is gone is one only the sweep's grace period would ever
 * collect. Tolerates a facility a test has already deleted.
 */
export async function forgetPhotoFacility(facilityId: string): Promise<void> {
  const db = dataClient()

  const { data, error } = await db
    .from('site_image')
    .select('storage_key')
    .eq('facility_id', facilityId)

  if (error) {
    throw new Error(`Could not read a photo facility's photographs: ${error.message}`)
  }

  const keys = (data as { storage_key: string }[]).map((row) => row.storage_key)

  if (keys.length > 0) {
    await db.storage.from(SITE_IMAGE_BUCKET).remove(keys)
  }

  const { error: deleteError } = await db.from('facility').delete().eq('id', facilityId)

  if (deleteError) {
    throw new Error(`Could not remove a photo facility: ${deleteError.message}`)
  }
}

/** Clears the fixture facilities a crashed run left behind. */
export async function forgetLeftoverPhotoFacilities(): Promise<void> {
  const { data, error } = await dataClient()
    .from('facility')
    .select('id')
    .like('slug', `${PHOTO_FACILITY_PREFIX}%`)

  if (error) {
    throw new Error(`Could not look for leftover photo facilities: ${error.message}`)
  }

  for (const row of data as { id: string }[]) {
    await forgetPhotoFacility(row.id)
  }
}
