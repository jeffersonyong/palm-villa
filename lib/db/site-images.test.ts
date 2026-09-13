import { randomUUID } from 'node:crypto'

import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import {
  facilities as landingFacilities,
  unitTypes as landingUnitTypes,
} from '@/app/(public)/_content/landing'
import {
  SITE_IMAGE_BUCKET,
  type SiteImageFocus,
  type SiteImagePlacement,
} from '@/lib/domain/site-image'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'
import {
  listCurrentSiteImages,
  placeSiteImage,
  removeSiteImage,
  sweepSiteImages,
  updateSiteImage,
} from './site-images'
import { TEST_PDF, givenStaffAccount } from './test/factory'
import { auditEventsFor } from './test/inspect'
import {
  TEST_JPEG,
  forgetLeftoverPhotoFacilities,
  forgetPhotoFacility,
  givenPhotoFacility,
  type PhotoFacility,
} from './test/photos'

/**
 * The site's photographs against the real stack — Postgres AND Storage
 * (capability F7).
 *
 * Not mocked, for the reason documents.test.ts gives: what these exist to prove
 * is that a row and an object stay consistent, and a mock of one would agree
 * with a mock of the other by construction.
 *
 * **Every photograph here goes on a facility the test creates.** The bucket is
 * never emptied between tests, and a photograph placed on the seeded pool or on
 * the hero would retire whatever somebody uploaded there by hand. The slot
 * pointer is covered by the constraint refusing bad rows, which writes nothing.
 */

const IN_TWO_HOURS = () => new Date(Date.now() + 2 * 60 * 60 * 1000)

let facility: PhotoFacility
let actorId: string
let propertyId: string

beforeAll(async () => {
  await forgetLeftoverPhotoFacilities()
  actorId = await givenStaffAccount()
})

beforeEach(async () => {
  propertyId = await currentPropertyId()
  facility = await givenPhotoFacility()
})

afterEach(async () => {
  await forgetPhotoFacility(facility.id)
})

function onTheFacility(): SiteImagePlacement {
  return { kind: 'facility', slug: facility.slug }
}

function place(
  input: {
    placement?: SiteImagePlacement
    bytes?: Uint8Array
    altText?: string
    focus?: SiteImageFocus
    expectedCurrentId?: string | null
  } = {},
) {
  return placeSiteImage({
    placement: input.placement ?? onTheFacility(),
    bytes: input.bytes ?? TEST_JPEG,
    altText: input.altText ?? 'The test facility in the afternoon',
    focus: input.focus ?? 'center',
    expectedCurrentId: input.expectedCurrentId ?? null,
    actorId,
  })
}

async function placed(
  input: Parameters<typeof place>[0] = {},
): Promise<{ imageId: string; storageKey: string }> {
  const result = await place(input)

  if (!result.ok) {
    throw new Error(`Expected the photograph to be placed, got ${result.error.code}`)
  }

  const row = await rowOf(result.imageId)

  return { imageId: result.imageId, storageKey: row!.storage_key }
}

interface SiteImageRow {
  storage_key: string
  byte_size: number
  alt_text: string
  focus: string
  retired_at: string | null
  retired_reason: string | null
  purged_at: string | null
}

async function rowOf(imageId: string): Promise<SiteImageRow | null> {
  const { data, error } = await dataClient()
    .from('site_image')
    .select('storage_key, byte_size, alt_text, focus, retired_at, retired_reason, purged_at')
    .eq('id', imageId)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read site_image ${imageId}: ${error.message}`)
  }

  return data as SiteImageRow | null
}

/** Every object under the property, for "nothing was left behind" assertions. */
async function objectKeys(): Promise<Set<string>> {
  const { data, error } = await dataClient()
    .storage.from(SITE_IMAGE_BUCKET)
    .list(propertyId, { limit: 1000 })

  if (error) {
    throw new Error(`Could not list the site-images bucket: ${error.message}`)
  }

  return new Set((data ?? []).map((object) => `${propertyId}/${object.name}`))
}

/* ── Placing ──────────────────────────────────────────────────────────────── */

describe('placing a photograph', () => {
  test('stores the file, records the row and lists it with a public URL', async () => {
    const { imageId, storageKey } = await placed({ altText: 'The pool at dusk', focus: 'top' })

    const current = await listCurrentSiteImages()
    const mine = current.find((image) => image.id === imageId)

    expect(mine).toMatchObject({
      placement: onTheFacility(),
      altText: 'The pool at dusk',
      focus: 'top',
      mimeType: 'image/jpeg',
    })
    expect(mine!.url).toContain(`/storage/v1/object/public/${SITE_IMAGE_BUCKET}/${storageKey}`)
    expect(await objectKeys()).toContain(storageKey)
  })

  test('takes the size from Storage rather than believing the caller', async () => {
    const { imageId } = await placed()

    expect((await rowOf(imageId))!.byte_size).toBe(TEST_JPEG.length)
  })

  test('records who put it on the site, naming the place', async () => {
    const { imageId } = await placed()

    const events = await auditEventsFor(imageId)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      action: 'site_image.added',
      actorId,
      after: { name: facility.name, focus: 'center' },
    })
  })

  test('the audit trail names the photograph by its place', async () => {
    const { imageId } = await placed()

    const { data, error } = await dataClient()
      .from('audit_event_summary')
      .select('subject_label')
      .eq('entity_id', imageId)

    expect(error).toBeNull()
    expect(data).toEqual([{ subject_label: facility.name }])
  })

  test('folds a description onto one line', async () => {
    const { imageId } = await placed({ altText: '  The pool\n\nat   dusk ' })

    expect((await rowOf(imageId))!.alt_text).toBe('The pool at dusk')
  })
})

describe('what placing refuses', () => {
  test('a PDF, before anything reaches Storage', async () => {
    const before = await objectKeys()

    const result = await place({ bytes: TEST_PDF })

    expect(result).toMatchObject({ ok: false, error: { code: 'not_an_image' } })
    expect(await objectKeys()).toEqual(before)
  })

  test('a blank description, before anything reaches Storage', async () => {
    const before = await objectKeys()

    const result = await place({ altText: '   ' })

    expect(result).toMatchObject({ ok: false, error: { code: 'alt_text_invalid' } })
    expect(await objectKeys()).toEqual(before)
  })

  test('a place that does not exist, discarding the upload', async () => {
    const before = await objectKeys()

    const result = await place({ placement: { kind: 'facility', slug: 'no-such-facility' } })

    expect(result).toMatchObject({ ok: false, error: { code: 'not_found' } })
    expect(await objectKeys()).toEqual(before)
  })

  test('a row in two places at once, or in none', async () => {
    const shared = {
      property_id: propertyId,
      mime_type: 'image/jpeg',
      byte_size: TEST_JPEG.length,
      alt_text: 'Nowhere in particular',
      uploaded_by: actorId,
    }

    const twoPlaces = await dataClient()
      .from('site_image')
      .insert({
        ...shared,
        storage_key: `${propertyId}/${randomUUID()}.jpg`,
        slot: 'hero',
        facility_id: facility.id,
      })
    const noPlace = await dataClient()
      .from('site_image')
      .insert({ ...shared, storage_key: `${propertyId}/${randomUUID()}.jpg` })

    expect(twoPlaces.error).not.toBeNull()
    expect(noPlace.error).not.toBeNull()
  })
})

/* ── Replacing ────────────────────────────────────────────────────────────── */

describe('replacing a photograph', () => {
  test('retires the old one, deletes its file and lists only the new one', async () => {
    const first = await placed()

    const second = await placed({ expectedCurrentId: first.imageId })

    const current = (await listCurrentSiteImages()).filter(
      (image) => image.placement.kind === 'facility' && image.placement.slug === facility.slug,
    )

    expect(current.map((image) => image.id)).toEqual([second.imageId])
    expect(await rowOf(first.imageId)).toMatchObject({ retired_reason: 'replaced' })
    expect((await rowOf(first.imageId))!.purged_at).not.toBeNull()
    expect(await objectKeys()).not.toContain(first.storageKey)
    expect(await objectKeys()).toContain(second.storageKey)
  })

  test('records the replacement against the new photograph, pointing at the old', async () => {
    const first = await placed()
    const second = await placed({ expectedCurrentId: first.imageId })

    const events = await auditEventsFor(second.imageId)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      action: 'site_image.replaced',
      before: { image_id: first.imageId, name: facility.name },
    })
  })

  test('refuses a dialog opened on an empty place that is no longer empty', async () => {
    const first = await placed()
    const before = await objectKeys()

    const result = await place({ expectedCurrentId: null })

    expect(result).toMatchObject({ ok: false, error: { code: 'stale' } })
    // The refused upload's file is discarded, and the photograph on the site is untouched.
    expect(await objectKeys()).toEqual(before)
    expect((await rowOf(first.imageId))!.retired_at).toBeNull()
  })

  test('refuses a dialog opened on a photograph somebody has since replaced', async () => {
    const first = await placed()
    await placed({ expectedCurrentId: first.imageId })

    const result = await place({ expectedCurrentId: first.imageId })

    expect(result).toMatchObject({ ok: false, error: { code: 'stale' } })
  })

  test('two first uploads at once leave exactly one photograph on the site', async () => {
    const results = await Promise.all([place(), place()])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.find((result) => !result.ok)).toMatchObject({ error: { code: 'stale' } })

    const current = (await listCurrentSiteImages()).filter(
      (image) => image.placement.kind === 'facility' && image.placement.slug === facility.slug,
    )

    expect(current).toHaveLength(1)
  })
})

/* ── Editing ──────────────────────────────────────────────────────────────── */

describe('editing a photograph', () => {
  test('changes the framing and records only what changed', async () => {
    const { imageId } = await placed({ altText: 'The pool', focus: 'center' })

    const result = await updateSiteImage({ imageId, altText: 'The pool', focus: 'top', actorId })

    expect(result).toEqual({ ok: true, changed: true })
    expect(await rowOf(imageId)).toMatchObject({ focus: 'top', alt_text: 'The pool' })

    const updated = (await auditEventsFor(imageId)).filter(
      (event) => event.action === 'site_image.updated',
    )

    expect(updated).toHaveLength(1)
    expect(updated[0]!.after).toEqual({ name: facility.name, focus: 'top' })
    expect(updated[0]!.before).toEqual({ name: facility.name, focus: 'center' })
  })

  test('a save that changed nothing writes nothing', async () => {
    const { imageId } = await placed({ altText: 'The pool', focus: 'center' })

    const result = await updateSiteImage({
      imageId,
      altText: ' The pool ',
      focus: 'center',
      actorId,
    })

    expect(result).toEqual({ ok: true, changed: false })
    expect((await auditEventsFor(imageId)).map((event) => event.action)).toEqual([
      'site_image.added',
    ])
  })

  test('a photograph replaced while the dialog was open cannot be edited', async () => {
    const first = await placed()
    await placed({ expectedCurrentId: first.imageId })

    const result = await updateSiteImage({
      imageId: first.imageId,
      altText: 'Too late',
      focus: 'center',
      actorId,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'stale' } })
  })
})

/* ── Removing ─────────────────────────────────────────────────────────────── */

describe('removing a photograph', () => {
  test('takes it off the site and deletes its file', async () => {
    const { imageId, storageKey } = await placed()

    const result = await removeSiteImage({ imageId, actorId })

    expect(result).toEqual({ ok: true })
    expect((await listCurrentSiteImages()).map((image) => image.id)).not.toContain(imageId)
    expect(await rowOf(imageId)).toMatchObject({ retired_reason: 'removed' })
    expect((await rowOf(imageId))!.purged_at).not.toBeNull()
    expect(await objectKeys()).not.toContain(storageKey)
    expect((await auditEventsFor(imageId)).map((event) => event.action)).toEqual([
      'site_image.added',
      'site_image.removed',
    ])
  })

  test('a second removal is refused rather than repeated', async () => {
    const { imageId } = await placed()
    await removeSiteImage({ imageId, actorId })

    const result = await removeSiteImage({ imageId, actorId })

    expect(result).toMatchObject({ ok: false, error: { code: 'already_removed' } })
  })
})

/* ── The sweep ────────────────────────────────────────────────────────────── */

describe('sweeping the bucket', () => {
  test('deletes an object no row claims, and leaves a photograph on the site alone', async () => {
    const orphan = `${propertyId}/${randomUUID()}.jpg`
    await dataClient()
      .storage.from(SITE_IMAGE_BUCKET)
      .upload(orphan, TEST_JPEG, { contentType: 'image/jpeg' })
    const { storageKey } = await placed()

    await sweepSiteImages({ now: IN_TWO_HOURS() })

    const keys = await objectKeys()

    expect(keys).not.toContain(orphan)
    expect(keys).toContain(storageKey)
  })

  test('does not take an object uploaded moments ago', async () => {
    const fresh = `${propertyId}/${randomUUID()}.jpg`
    await dataClient()
      .storage.from(SITE_IMAGE_BUCKET)
      .upload(fresh, TEST_JPEG, { contentType: 'image/jpeg' })

    await sweepSiteImages()

    expect(await objectKeys()).toContain(fresh)

    await dataClient().storage.from(SITE_IMAGE_BUCKET).remove([fresh])
  })

  test('finishes a deletion that did not complete', async () => {
    const { imageId, storageKey } = await placed()

    // A removal whose Storage call failed: retired, never purged, file still there.
    await dataClient()
      .from('site_image')
      .update({
        retired_at: new Date().toISOString(),
        retired_reason: 'removed',
        retired_by: actorId,
      })
      .eq('id', imageId)

    await sweepSiteImages()

    expect((await rowOf(imageId))!.purged_at).not.toBeNull()
    expect(await objectKeys()).not.toContain(storageKey)
  })

  test('a facility deleted in Property settings takes its photograph, and the sweep takes the file', async () => {
    const { imageId, storageKey } = await placed()

    await dataClient().from('facility').delete().eq('id', facility.id)

    expect(await rowOf(imageId)).toBeNull()

    await sweepSiteImages({ now: IN_TWO_HOURS() })

    expect(await objectKeys()).not.toContain(storageKey)
  })
})

/* ── The landing page ─────────────────────────────────────────────────────── */

describe('the landing page against the database', () => {
  test('every card on the landing page has a row to hang a photograph on', async () => {
    const [facilityRows, unitTypeRows] = await Promise.all([
      dataClient().from('facility').select('slug').eq('property_id', propertyId),
      dataClient().from('unit_type').select('slug').eq('property_id', propertyId),
    ])

    const facilitySlugs = new Set((facilityRows.data ?? []).map((row) => row.slug as string))
    const unitTypeSlugs = new Set((unitTypeRows.data ?? []).map((row) => row.slug as string))

    expect(
      landingFacilities.map((card) => card.slug).filter((slug) => !facilitySlugs.has(slug)),
    ).toEqual([])
    expect(
      landingUnitTypes.map((card) => card.slug).filter((slug) => !unitTypeSlugs.has(slug)),
    ).toEqual([])
  })
})
