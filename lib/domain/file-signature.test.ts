import { describe, expect, test } from 'vitest'

import { carriesEmbeddedMetadata, extensionFor, sniffMimeType } from './file-signature'

/**
 * Reading what a file is from its own bytes (architecture.md §8.1).
 *
 * Two writers depend on this — stored documents and the site's photographs
 * (capability F7) — so a signature that stopped matching refuses every upload
 * in the product, and one that matched too loosely stores whatever it is
 * handed. Moved here from document.test.ts with the function itself.
 */

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

/** The shortest byte sequences each sniffable format can be recognised from. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

/** A real capture from an iPhone, which this product does not store. */
const HEIC = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
])

/** Byte helpers for the metadata fixtures, which are containers built by hand. */
const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0))
const START_OF_IMAGE = [0xff, 0xd8]
const START_OF_SCAN = [0xff, 0xda]
const EXIF_HEADER = [...ascii('Exif'), 0x00, 0x00]
const XMP_HEADER = ascii('http://ns.adobe.com/xap/1.0/')

/** A JPEG segment: marker, two-byte length that counts itself, payload. */
function segment(marker: number, payload: readonly number[]): number[] {
  const length = payload.length + 2

  return [0xff, marker, length >> 8, length & 0xff, ...payload]
}

/** The JFIF header every canvas-encoded JPEG opens with, and nothing else. */
const JFIF = segment(0xe0, [
  ...ascii('JFIF'),
  0x00,
  0x01,
  0x01,
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
  0x00,
  0x00,
])

/** A PNG chunk: four-byte big-endian length, type, data, four CRC bytes (not checked). */
function chunk(type: string, data: readonly number[]): number[] {
  const length = data.length

  return [
    length >>> 24,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
    ...ascii(type),
    ...data,
    0,
    0,
    0,
    0,
  ]
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const IHDR = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])
const IEND = chunk('IEND', [])

/** A RIFF chunk: fourcc, four-byte little-endian size, data padded to even. */
function riff(fourcc: string, data: readonly number[]): number[] {
  const size = data.length

  return [
    ...ascii(fourcc),
    size & 0xff,
    (size >> 8) & 0xff,
    (size >> 16) & 0xff,
    size >>> 24,
    ...data,
    ...(size % 2 ? [0] : []),
  ]
}

const WEBP_HEADER = [...ascii('RIFF'), 0x24, 0x00, 0x00, 0x00, ...ascii('WEBP')]

/* ── Reading the bytes ────────────────────────────────────────────────────── */

describe('sniffMimeType', () => {
  test('recognises the four types this product stores', () => {
    expect(sniffMimeType(JPEG)).toBe('image/jpeg')
    expect(sniffMimeType(PNG)).toBe('image/png')
    expect(sniffMimeType(WEBP)).toBe('image/webp')
    expect(sniffMimeType(PDF)).toBe('application/pdf')
  })

  test('refuses what it cannot recognise rather than guessing', () => {
    expect(sniffMimeType(HEIC)).toBeNull()
    expect(sniffMimeType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull()
    expect(sniffMimeType(new Uint8Array())).toBeNull()
  })

  test('a truncated signature is not a match', () => {
    // Two of JPEG's three marker bytes. A prefix check that read past the end
    // of a short buffer would either throw or match on undefined.
    expect(sniffMimeType(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(sniffMimeType(PNG.slice(0, 4))).toBeNull()
  })

  test('RIFF alone is not WebP', () => {
    // A WAV file opens with RIFF too. The second marker is what separates them.
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ])

    expect(sniffMimeType(wav)).toBeNull()
  })
})

/* ── Naming the stored object ─────────────────────────────────────────────── */

describe('extensionFor', () => {
  test('every recognised type has an extension', () => {
    // `.jpg` rather than `.jpeg`, because that is what a browser and an
    // operating system both offer when the file is saved again.
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/webp')).toBe('webp')
    expect(extensionFor('application/pdf')).toBe('pdf')
  })
})

/* ── What an image says about where it was taken ──────────────────────────── */

describe('carriesEmbeddedMetadata', () => {
  test('finds EXIF in a JPEG — where a phone writes the GPS position', () => {
    const jpeg = new Uint8Array([
      ...START_OF_IMAGE,
      ...segment(0xe1, EXIF_HEADER),
      ...START_OF_SCAN,
    ])

    expect(carriesEmbeddedMetadata(jpeg)).toBe(true)
  })

  test('finds EXIF that follows a JFIF header', () => {
    const jpeg = new Uint8Array([
      ...START_OF_IMAGE,
      ...JFIF,
      ...segment(0xe1, EXIF_HEADER),
      ...START_OF_SCAN,
    ])

    expect(carriesEmbeddedMetadata(jpeg)).toBe(true)
  })

  test('finds XMP in a JPEG', () => {
    const jpeg = new Uint8Array([...START_OF_IMAGE, ...segment(0xe1, XMP_HEADER), ...START_OF_SCAN])

    expect(carriesEmbeddedMetadata(jpeg)).toBe(true)
  })

  test('a JPEG straight from a canvas carries none', () => {
    const jpeg = new Uint8Array([...START_OF_IMAGE, ...JFIF, ...START_OF_SCAN, 0x00, 0x3f])

    expect(carriesEmbeddedMetadata(jpeg)).toBe(false)
  })

  test('stops at the image data, where compressed bytes can look like anything', () => {
    const jpeg = new Uint8Array([
      ...START_OF_IMAGE,
      ...START_OF_SCAN,
      ...segment(0xe1, EXIF_HEADER),
    ])

    expect(carriesEmbeddedMetadata(jpeg)).toBe(false)
  })

  test('reads a truncated JPEG without running off its end', () => {
    expect(carriesEmbeddedMetadata(JPEG)).toBe(false)
  })

  test('finds an eXIf chunk in a PNG', () => {
    const png = new Uint8Array([...PNG_SIGNATURE, ...IHDR, ...chunk('eXIf', [0x4d, 0x4d]), ...IEND])

    expect(carriesEmbeddedMetadata(png)).toBe(true)
  })

  test('finds XMP in a PNG text chunk', () => {
    const png = new Uint8Array([
      ...PNG_SIGNATURE,
      ...IHDR,
      ...chunk('iTXt', [...ascii('XML:com.adobe.xmp'), 0x00]),
      ...IEND,
    ])

    expect(carriesEmbeddedMetadata(png)).toBe(true)
  })

  test('a PNG with only its image chunks carries none', () => {
    const png = new Uint8Array([...PNG_SIGNATURE, ...IHDR, ...chunk('IDAT', [0x78, 0x9c]), ...IEND])

    expect(carriesEmbeddedMetadata(png)).toBe(false)
  })

  test('finds EXIF and XMP chunks in a WebP', () => {
    const vp8x = riff('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0])

    expect(
      carriesEmbeddedMetadata(new Uint8Array([...WEBP_HEADER, ...vp8x, ...riff('EXIF', [0x4d])])),
    ).toBe(true)
    expect(
      carriesEmbeddedMetadata(new Uint8Array([...WEBP_HEADER, ...vp8x, ...riff('XMP ', [0x3c])])),
    ).toBe(true)
  })

  test('a simple WebP carries none', () => {
    const webp = new Uint8Array([...WEBP_HEADER, ...riff('VP8 ', [0x9d, 0x01, 0x2a, 0x00])])

    expect(carriesEmbeddedMetadata(webp)).toBe(false)
  })

  test('a PDF is not an image, and says nothing here', () => {
    expect(carriesEmbeddedMetadata(PDF)).toBe(false)
  })
})
