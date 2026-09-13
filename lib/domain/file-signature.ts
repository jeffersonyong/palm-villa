/**
 * What a file's bytes actually are (architecture.md §8.1).
 *
 * Moved out of lib/domain/document.ts with capability F7, because the product
 * now stores two things and only one of them is a document. The site's
 * photographs live in a public bucket with their own table, and architecture.md
 * §8 is explicit that the document module must not learn about them. What a
 * JPEG looks like is a fact about JPEGs rather than about identity documents,
 * so it lives here and both writers import it.
 *
 * Nothing in this module decides what may be stored where. A document kind
 * narrows these types to its own list, a site photograph to the three image
 * types, and each refuses in its own words.
 */

/** Every type this product can recognise from a file's header. */
export const SNIFFABLE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export type SniffedMimeType = (typeof SNIFFABLE_MIME_TYPES)[number]

/**
 * What the bytes actually are.
 *
 * The browser's declared content type is a claim by whoever is uploading, and a
 * bucket's `allowed_mime_types` checks that same claim — so neither is a
 * control. This reads the file's own header, and it is the only thing a stored
 * `mime_type` is ever set from.
 *
 * Four signatures, matching SNIFFABLE_MIME_TYPES. Anything else returns null
 * and is refused: a permissive sniffer that guessed at unknown bytes would be
 * storing arbitrary content behind a check that promises a photograph or a PDF.
 */
export function sniffMimeType(bytes: Uint8Array): SniffedMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg'
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }

  // RIFF....WEBP — the four bytes between the two markers are the length of the
  // file itself and carry no signature, so both ends are checked and the middle
  // is skipped.
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    matchesAt(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'image/webp'
  }

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'application/pdf'
  }

  return null
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return matchesAt(bytes, 0, signature)
}

function matchesAt(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (bytes.length < offset + signature.length) {
    return false
  }

  return signature.every((byte, index) => bytes[offset + index] === byte)
}

/**
 * The extension a stored object is given.
 *
 * Derived from the sniffed type, never from the uploaded filename: the name is
 * whatever the uploader's phone called it, and it is display text from the
 * moment it arrives. `.jpg` rather than `.jpeg` because that is what a browser
 * and an operating system both offer when the file is saved again.
 */
export const EXTENSION_FOR_MIME: Readonly<Record<SniffedMimeType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export function extensionFor(mimeType: SniffedMimeType): string {
  return EXTENSION_FOR_MIME[mimeType]
}

/* ── What an image says about where it was taken ──────────────────────────── */

/**
 * Whether an image still carries camera metadata: EXIF, which is where a phone
 * writes the GPS position a photograph was taken at, or XMP, which can repeat
 * it.
 *
 * Asked of a photograph about to go on the public site (capability F7). The
 * upload dialog re-encodes every photo on a canvas, which keeps none of this,
 * so only a request that skipped the dialog can arrive carrying it — and
 * refusing that request is what makes "no location data on the website" a
 * control rather than the habit of one screen.
 *
 * It walks each format's own container rather than searching the bytes for
 * "Exif", because compressed image data can hold any byte sequence at all. A
 * JPEG's metadata segments all come before its image data; a PNG's chunks and a
 * WebP's RIFF chunks are each named. A structure it cannot follow to the end —
 * a truncated file — is answered from what was read, never by reading past it.
 */
export function carriesEmbeddedMetadata(bytes: Uint8Array): boolean {
  switch (sniffMimeType(bytes)) {
    case 'image/jpeg':
      return jpegCarriesMetadata(bytes)
    case 'image/png':
      return pngCarriesMetadata(bytes)
    case 'image/webp':
      return webpCarriesMetadata(bytes)
    default:
      return false
  }
}

const EXIF_HEADER = [...asciiBytes('Exif'), 0x00, 0x00]
const XMP_JPEG_HEADER = asciiBytes('http://ns.adobe.com/xap/1.0/')
const XMP_PNG_KEYWORD = asciiBytes('XML:com.adobe.xmp')

/** The JPEG markers this reads: the EXIF/XMP segment, and the two that end the headers. */
const APP1 = 0xe1
const START_OF_SCAN = 0xda
const END_OF_IMAGE = 0xd9

function jpegCarriesMetadata(bytes: Uint8Array): boolean {
  // After the two-byte start-of-image marker, every header segment is 0xFF, a
  // marker byte, and a two-byte length that counts itself.
  let offset = 2

  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]

    if (marker === 0xff) {
      // A fill byte before the real marker.
      offset += 1
      continue
    }

    if (marker === START_OF_SCAN || marker === END_OF_IMAGE) {
      return false
    }

    if (
      marker === APP1 &&
      (matchesAt(bytes, offset + 4, EXIF_HEADER) || matchesAt(bytes, offset + 4, XMP_JPEG_HEADER))
    ) {
      return true
    }

    const length = readUint16BE(bytes, offset + 2)

    if (length < 2) {
      return false
    }

    offset += 2 + length
  }

  return false
}

function pngCarriesMetadata(bytes: Uint8Array): boolean {
  // After the eight-byte signature: length, type, data and CRC, repeated to IEND.
  let offset = 8

  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset)
    const type = asciiAt(bytes, offset + 4, 4)

    if (type === 'eXIf') {
      return true
    }

    if (type === 'iTXt' && matchesAt(bytes, offset + 8, XMP_PNG_KEYWORD)) {
      return true
    }

    if (type === 'IEND') {
      return false
    }

    offset += 12 + length
  }

  return false
}

function webpCarriesMetadata(bytes: Uint8Array): boolean {
  // After "RIFF", the file size and "WEBP": a fourcc, a little-endian size, and
  // the data padded to an even length.
  let offset = 12

  while (offset + 8 <= bytes.length) {
    const fourcc = asciiAt(bytes, offset, 4)

    if (fourcc === 'EXIF' || fourcc === 'XMP ') {
      return true
    }

    const size = readUint32LE(bytes, offset + 4)

    offset += 8 + size + (size % 2)
  }

  return false
}

function asciiBytes(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0))
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function byteAt(bytes: Uint8Array, offset: number): number {
  return bytes[offset] ?? 0
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return byteAt(bytes, offset) * 0x100 + byteAt(bytes, offset + 1)
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    byteAt(bytes, offset) * 0x1000000 +
    byteAt(bytes, offset + 1) * 0x10000 +
    byteAt(bytes, offset + 2) * 0x100 +
    byteAt(bytes, offset + 3)
  )
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    byteAt(bytes, offset) +
    byteAt(bytes, offset + 1) * 0x100 +
    byteAt(bytes, offset + 2) * 0x10000 +
    byteAt(bytes, offset + 3) * 0x1000000
  )
}
