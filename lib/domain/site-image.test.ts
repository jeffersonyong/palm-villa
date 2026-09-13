import { describe, expect, test } from 'vitest'

import {
  DEFAULT_FOCUS,
  FOCUS_LABELS,
  MAX_ALT_TEXT_LENGTH,
  MAX_SITE_IMAGE_BYTES,
  SITE_IMAGE_ACCEPT,
  SITE_IMAGE_BUCKET,
  SITE_IMAGE_FOCUS,
  SITE_IMAGE_SLOTS,
  aspectFor,
  checkAltText,
  checkSiteImageUpload,
  fitWithin,
  isSiteImageFocus,
  isSoftPhoto,
  objectPositionFor,
  parsePlacementKey,
  placementKey,
  siteImageStorageKey,
  slotLabel,
} from './site-image'

/**
 * The site's photographs (capability F7).
 *
 * Everything here is a rule a screen and a server action have to agree on —
 * which slots exist, how a photo is framed, what may be uploaded and how it is
 * described — so it is tested once, here, without a database or a browser.
 */

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const HEIC = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
])

const PROPERTY_ID = '6f1c9f7e-2b1d-4c1e-9d0a-1a2b3c4d5e6f'
const IMAGE_ID = '0b7d4a3c-8e2f-4a61-b5c9-7d8e9f0a1b2c'

/* ── Where a photograph belongs ───────────────────────────────────────────── */

describe('the slots', () => {
  test('are the hero and the four "Follow along" tiles, and nothing else', () => {
    // Mirrored by the CHECK on site_image.slot. Unit types and facilities are
    // not slots: they are rows, addressed by the slug that never moves.
    expect(SITE_IMAGE_SLOTS).toEqual(['hero', 'feed-1', 'feed-2', 'feed-3', 'feed-4'])
  })

  test('each has a name a person would use', () => {
    expect(slotLabel('hero')).toBe('Front page')
    expect(slotLabel('feed-3')).toBe('Follow along — tile 3')
  })

  test('the public bucket is the one architecture.md §8 names', () => {
    expect(SITE_IMAGE_BUCKET).toBe('site-images')
  })
})

describe('placement keys', () => {
  test.each([
    ['hero', { kind: 'slot', slot: 'hero' }],
    ['feed-2', { kind: 'slot', slot: 'feed-2' }],
    ['unit-type:two-bedroom', { kind: 'unit_type', slug: 'two-bedroom' }],
    [
      'facility:indoor-childrens-playground',
      { kind: 'facility', slug: 'indoor-childrens-playground' },
    ],
  ] as const)('%s round-trips', (key, placement) => {
    expect(parsePlacementKey(key)).toEqual(placement)
    expect(placementKey(placement)).toBe(key)
  })

  test.each([
    '',
    'banner',
    'feed-5',
    'unit-type:',
    'unit-type:Two Bedroom',
    'facility:../identity-docs',
    'facility:swimming-pool:extra',
  ])('refuses %j rather than guessing at it', (key) => {
    expect(parsePlacementKey(key)).toBeNull()
  })
})

describe('the shape a slot is cropped to', () => {
  test('the "Follow along" tiles are square and everything else is 4:3', () => {
    expect(aspectFor({ kind: 'slot', slot: 'feed-1' })).toBe('square')
    expect(aspectFor({ kind: 'slot', slot: 'hero' })).toBe('photo')
    expect(aspectFor({ kind: 'unit_type', slug: 'semi-detached' })).toBe('photo')
    expect(aspectFor({ kind: 'facility', slug: 'water-park' })).toBe('photo')
  })
})

/* ── Framing ──────────────────────────────────────────────────────────────── */

describe('framing', () => {
  test('is a three-by-three choice that starts in the centre', () => {
    expect(SITE_IMAGE_FOCUS).toHaveLength(9)
    expect(DEFAULT_FOCUS).toBe('center')
  })

  test('every position has a name, for the picker read aloud', () => {
    for (const focus of SITE_IMAGE_FOCUS) {
      expect(FOCUS_LABELS[focus]).toBeTruthy()
    }
  })

  test('each position is the CSS object-position that keeps that part in view', () => {
    expect(objectPositionFor('top-left')).toBe('left top')
    expect(objectPositionFor('top')).toBe('center top')
    expect(objectPositionFor('center')).toBe('center center')
    expect(objectPositionFor('right')).toBe('right center')
    expect(objectPositionFor('bottom-right')).toBe('right bottom')
  })

  test('anything else is refused rather than coerced', () => {
    expect(isSiteImageFocus('middle')).toBe(false)
    expect(isSiteImageFocus('Center')).toBe(false)
    expect(isSiteImageFocus('bottom-left')).toBe(true)
  })
})

/* ── What may be uploaded ─────────────────────────────────────────────────── */

describe('checkSiteImageUpload', () => {
  test.each([
    [JPEG, 'image/jpeg', 'jpg'],
    [PNG, 'image/png', 'png'],
    [WEBP, 'image/webp', 'webp'],
  ] as const)('accepts a photograph', (bytes, mimeType, extension) => {
    expect(checkSiteImageUpload(bytes)).toEqual({ ok: true, mimeType, extension })
  })

  test('the file picker offers exactly those three, and no wildcard', () => {
    // A wildcard is what lets iOS hand over a HEIC the check then refuses.
    expect(SITE_IMAGE_ACCEPT).toBe('image/jpeg,image/png,image/webp')
  })

  test('refuses a PDF, however it was named', () => {
    const result = checkSiteImageUpload(PDF)

    expect(result).toMatchObject({ ok: false, error: { code: 'not_an_image' } })
  })

  test('refuses a photo that still carries camera data, such as where it was taken', () => {
    // The dialog's re-encode never keeps EXIF, so only a request that skipped
    // it can reach this — and that is exactly the request that would publish a
    // GPS position to a public bucket.
    const withExif = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xda,
    ])

    expect(checkSiteImageUpload(withExif)).toMatchObject({
      ok: false,
      error: { code: 'carries_metadata' },
    })
  })

  test('refuses a HEIC the browser did not convert', () => {
    expect(checkSiteImageUpload(HEIC)).toMatchObject({ ok: false, error: { code: 'not_an_image' } })
  })

  test('refuses an empty file', () => {
    expect(checkSiteImageUpload(new Uint8Array())).toMatchObject({
      ok: false,
      error: { code: 'empty' },
    })
  })

  test('refuses a file over the ceiling before reading what it is', () => {
    const oversized = new Uint8Array(MAX_SITE_IMAGE_BYTES + 1)
    oversized.set(PDF)

    // Size first: a PDF that is also too large is answered as too large,
    // because "send a smaller photo" is the sentence the person can act on.
    expect(checkSiteImageUpload(oversized)).toMatchObject({
      ok: false,
      error: { code: 'too_large' },
    })
  })

  test('accepts a photograph exactly at the ceiling', () => {
    const exact = new Uint8Array(MAX_SITE_IMAGE_BYTES)
    exact.set(JPEG)

    expect(checkSiteImageUpload(exact)).toMatchObject({ ok: true })
  })

  test('the ceiling is Vercel’s request body, not a preference', () => {
    expect(MAX_SITE_IMAGE_BYTES).toBe(4 * 1024 * 1024)
  })
})

/* ── Describing the photograph ────────────────────────────────────────────── */

describe('checkAltText', () => {
  test('keeps an ordinary description, trimmed', () => {
    expect(checkAltText('  The outdoor pool with loungers  ')).toEqual({
      ok: true,
      value: 'The outdoor pool with loungers',
    })
  })

  test('folds line breaks and runs of spaces into one space', () => {
    // A screen reader reads it as one sentence, so it is stored as one.
    expect(checkAltText('The pool\n\nat   dusk')).toEqual({ ok: true, value: 'The pool at dusk' })
  })

  test('refuses a blank description', () => {
    expect(checkAltText('   ')).toMatchObject({ ok: false })
  })

  test('accepts exactly the limit and refuses one more', () => {
    expect(checkAltText('a'.repeat(MAX_ALT_TEXT_LENGTH))).toMatchObject({ ok: true })
    expect(checkAltText('a'.repeat(MAX_ALT_TEXT_LENGTH + 1))).toMatchObject({ ok: false })
  })
})

/* ── Storage ──────────────────────────────────────────────────────────────── */

describe('siteImageStorageKey', () => {
  test('is flat under the property and named by the image, never the filename', () => {
    expect(
      siteImageStorageKey({ propertyId: PROPERTY_ID, imageId: IMAGE_ID, extension: 'jpg' }),
    ).toBe(`${PROPERTY_ID}/${IMAGE_ID}.jpg`)
  })
})

/* ── The shrink in the browser ────────────────────────────────────────────── */

describe('fitWithin', () => {
  test('scales a phone photograph down to 2400 on its long edge, keeping its shape', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2400, height: 1800 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1800, height: 2400 })
  })

  test('never enlarges a photograph that is already small enough', () => {
    expect(fitWithin(1600, 1200)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(2400, 2400)).toEqual({ width: 2400, height: 2400 })
  })

  test('never rounds a thin edge away to nothing', () => {
    expect(fitWithin(10_000, 3)).toEqual({ width: 2400, height: 1 })
  })

  test('has no answer for an image with no size', () => {
    expect(fitWithin(0, 1200)).toBeNull()
    expect(fitWithin(Number.NaN, 1200)).toBeNull()
  })
})

describe('isSoftPhoto', () => {
  test('a photograph under 1200 on its long edge will look soft across the hero', () => {
    expect(isSoftPhoto(1199, 800)).toBe(true)
    expect(isSoftPhoto(1200, 900)).toBe(false)
    expect(isSoftPhoto(900, 1200)).toBe(false)
  })
})
