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
