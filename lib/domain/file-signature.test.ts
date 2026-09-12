import { describe, expect, test } from 'vitest'

import { extensionFor, sniffMimeType } from './file-signature'

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
