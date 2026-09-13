import {
  carriesEmbeddedMetadata,
  extensionFor,
  sniffMimeType,
  type SniffedMimeType,
} from './file-signature'

/**
 * The photographs on the public site (capability F7, architecture.md §8).
 *
 * What the portal screen, the server actions and the landing page have to agree
 * on: where a photograph can go, what may be uploaded, how it is described and
 * how it is framed. Pure and I/O-free, so every rule is tested without a
 * database or a browser.
 *
 * ── Why this is not a document kind ───────────────────────────────────────
 *
 * architecture.md §8 names `site-images` as the one bucket that inverts every
 * rule the four private ones run on: public, cached, served to anonymous
 * visitors, with no signed URL, no access log and never a retention period —
 * the retention job that protects a guest's IC would otherwise delete the front
 * page. A `kind` on `document` would inherit all of those rules and have to
 * switch each one off, so this is its own module over its own table, and
 * lib/domain/document.ts learns nothing about it. The two share only what a
 * file's header looks like (lib/domain/file-signature.ts).
 */

/** The public bucket. Created by migration 20260923000100. */
export const SITE_IMAGE_BUCKET = 'site-images'

/* ── Where a photograph belongs ───────────────────────────────────────────── */

/**
 * The places on the landing page that hang off no row: the hero, and the four
 * "Follow along" tiles.
 *
 * A unit type and a facility are not slots. Each is already a row, and a
 * photograph is attached to it by the slug a rename never moves
 * (architecture.md §5.1). Mirrored by the CHECK on `site_image.slot`.
 */
export const SITE_IMAGE_SLOTS = ['hero', 'feed-1', 'feed-2', 'feed-3', 'feed-4'] as const

export type SiteImageSlot = (typeof SITE_IMAGE_SLOTS)[number]

export function isSiteImageSlot(value: string): value is SiteImageSlot {
  return (SITE_IMAGE_SLOTS as readonly string[]).includes(value)
}

/**
 * A slot in words.
 *
 * Said again in SQL by `site_image_name()`, which writes it into each audit
 * event so the trail can still name a photograph after its row is gone.
 */
export function slotLabel(slot: SiteImageSlot): string {
  return slot === 'hero' ? 'Front page' : `Follow along — tile ${slot.slice('feed-'.length)}`
}

export type SiteImagePlacement =
  | { kind: 'slot'; slot: SiteImageSlot }
  | { kind: 'unit_type'; slug: string }
  | { kind: 'facility'; slug: string }

/** The pattern `facility.slug` is checked against (migration 20260912000100). */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const UNIT_TYPE_PREFIX = 'unit-type:'
const FACILITY_PREFIX = 'facility:'

/**
 * A placement as one string — a form field, a map key, a React key.
 *
 * `hero`, `feed-2`, `unit-type:two-bedroom`, `facility:water-park`.
 */
export function placementKey(placement: SiteImagePlacement): string {
  switch (placement.kind) {
    case 'slot':
      return placement.slot
    case 'unit_type':
      return `${UNIT_TYPE_PREFIX}${placement.slug}`
    case 'facility':
      return `${FACILITY_PREFIX}${placement.slug}`
  }
}

/**
 * The reverse, refusing anything that is not a placement.
 *
 * A key arrives from a form, so it is a claim: a slug that does not look like a
 * slug is refused here rather than handed to a query.
 */
export function parsePlacementKey(key: string): SiteImagePlacement | null {
  if (isSiteImageSlot(key)) {
    return { kind: 'slot', slot: key }
  }

  if (key.startsWith(UNIT_TYPE_PREFIX)) {
    const slug = key.slice(UNIT_TYPE_PREFIX.length)

    return SLUG_PATTERN.test(slug) ? { kind: 'unit_type', slug } : null
  }

  if (key.startsWith(FACILITY_PREFIX)) {
    const slug = key.slice(FACILITY_PREFIX.length)

    return SLUG_PATTERN.test(slug) ? { kind: 'facility', slug } : null
  }

  return null
}

/**
 * The shape a placement is cropped to on the site, in `MediaPlaceholder`'s own
 * words: `photo` is 4:3 and `square` is 1:1. The portal previews every photograph
 * at this shape, so what staff see is what a visitor sees.
 */
export type SiteImageAspect = 'photo' | 'square'

export function aspectFor(placement: SiteImagePlacement): SiteImageAspect {
  return placement.kind === 'slot' && placement.slot !== 'hero' ? 'square' : 'photo'
}

/* ── Framing ──────────────────────────────────────────────────────────────── */

/**
 * Which part of a photograph stays in view when the site crops it to its slot.
 *
 * A three-by-three choice rather than a point, because it is a question a
 * person can answer at a glance — "keep the top in view" — and it is keyboard
 * operable as nine radio buttons. Mirrored by the CHECK on `site_image.focus`.
 */
export const SITE_IMAGE_FOCUS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const

export type SiteImageFocus = (typeof SITE_IMAGE_FOCUS)[number]

export const DEFAULT_FOCUS: SiteImageFocus = 'center'

export function isSiteImageFocus(value: string): value is SiteImageFocus {
  return (SITE_IMAGE_FOCUS as readonly string[]).includes(value)
}

/** Each position's name, for the picker read aloud and the audit trail. */
export const FOCUS_LABELS: Readonly<Record<SiteImageFocus, string>> = {
  'top-left': 'Top left',
  top: 'Top',
  'top-right': 'Top right',
  left: 'Left',
  center: 'Centre',
  right: 'Right',
  'bottom-left': 'Bottom left',
  bottom: 'Bottom',
  'bottom-right': 'Bottom right',
}

const OBJECT_POSITION: Readonly<Record<SiteImageFocus, string>> = {
  'top-left': 'left top',
  top: 'center top',
  'top-right': 'right top',
  left: 'left center',
  center: 'center center',
  right: 'right center',
  'bottom-left': 'left bottom',
  bottom: 'center bottom',
  'bottom-right': 'right bottom',
}

/**
 * The CSS `object-position` that keeps that part in view.
 *
 * Applied as an inline style rather than a class, because a class name built
 * at runtime is one Tailwind never sees.
 */
export function objectPositionFor(focus: SiteImageFocus): string {
  return OBJECT_POSITION[focus]
}

/* ── What may be uploaded ─────────────────────────────────────────────────── */

/**
 * The ceiling on one stored photograph, in bytes.
 *
 * The number is Vercel's rather than a preference: a server action's request
 * body is capped at 4.5 MB in front of the function (architecture.md §8.1). It
 * applies to what is sent, not to what was chosen — the browser shrinks a
 * camera original before sending it, so a 12 MB photograph arrives well under.
 */
export const MAX_SITE_IMAGE_BYTES = 4 * 1024 * 1024

/**
 * A photograph and nothing else. Mirrored by the bucket's `allowed_mime_types`
 * and the CHECK on `site_image.mime_type`.
 */
export const SITE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const satisfies readonly SniffedMimeType[]

export type SiteImageMimeType = (typeof SITE_IMAGE_MIME_TYPES)[number]

/**
 * The file picker's `accept` list — explicit, never a wildcard. iOS converts a
 * HEIC capture to JPEG only when the list excludes HEIC (design.md, File fields).
 */
export const SITE_IMAGE_ACCEPT = SITE_IMAGE_MIME_TYPES.join(',')

function isSiteImageMimeType(mimeType: SniffedMimeType): mimeType is SiteImageMimeType {
  return (SITE_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)
}

export type SiteImageUploadErrorCode = 'empty' | 'too_large' | 'not_an_image' | 'carries_metadata'

export interface SiteImageUploadError {
  code: SiteImageUploadErrorCode
  message: string
}

export type SiteImageUploadCheck =
  | { ok: true; mimeType: SiteImageMimeType; extension: string }
  | { ok: false; error: SiteImageUploadError }

/**
 * Whether these bytes may be stored as a photograph on the site.
 *
 * Size before content, as `checkUpload` orders it for documents: an oversized
 * file has a different answer for the person holding it than an unreadable
 * one. The type is read from the header, never from the name or the browser's
 * claim — the bucket's own type list checks only that claim.
 */
export function checkSiteImageUpload(bytes: Uint8Array): SiteImageUploadCheck {
  if (bytes.length === 0) {
    return {
      ok: false,
      error: { code: 'empty', message: 'That file is empty. Choose the photo again.' },
    }
  }

  if (bytes.length > MAX_SITE_IMAGE_BYTES) {
    return {
      ok: false,
      error: {
        code: 'too_large',
        message: 'That photo is still larger than 4 MB after resizing. Try a smaller one.',
      },
    }
  }

  const mimeType = sniffMimeType(bytes)

  if (!mimeType || !isSiteImageMimeType(mimeType)) {
    return {
      ok: false,
      error: {
        code: 'not_an_image',
        message: 'That is not a JPEG, PNG or WebP photo. Choose a photograph.',
      },
    }
  }

  // A photograph on the public site must not say where it was taken. The
  // upload dialog's re-encode removes all of that, so this refuses only a
  // request that skipped the dialog — see `carriesEmbeddedMetadata`.
  if (carriesEmbeddedMetadata(bytes)) {
    return {
      ok: false,
      error: {
        code: 'carries_metadata',
        message:
          'That photo still carries camera data, such as where it was taken. Add it through the photo dialog, which removes it.',
      },
    }
  }

  return { ok: true, mimeType, extension: extensionFor(mimeType) }
}

/* ── Describing the photograph ────────────────────────────────────────────── */

/**
 * The longest description kept. One sentence, which is what a screen reader
 * wants and what a search engine reads. Mirrored by the CHECK on
 * `site_image.alt_text`.
 */
export const MAX_ALT_TEXT_LENGTH = 200

export type AltTextCheck = { ok: true; value: string } | { ok: false; message: string }

/**
 * A description, tidied and checked.
 *
 * Line breaks and runs of spaces fold into one space: the text is read aloud as
 * one sentence, so it is stored as one. `place_site_image()` folds it the same
 * way, so a write from anywhere else is held to the same shape.
 */
export function checkAltText(raw: string): AltTextCheck {
  const value = raw.replace(/\s+/g, ' ').trim()

  if (value === '') {
    return {
      ok: false,
      message: 'Describe what the photo shows, for someone who cannot see it.',
    }
  }

  if (value.length > MAX_ALT_TEXT_LENGTH) {
    return {
      ok: false,
      message: `Keep the description to ${MAX_ALT_TEXT_LENGTH} characters — one sentence is enough.`,
    }
  }

  return { ok: true, value }
}

/* ── Storage ──────────────────────────────────────────────────────────────── */

/**
 * Where the object lives in the bucket.
 *
 * `{propertyId}/{imageId}.{ext}` — flat under the property for the reason
 * `storageKeyFor` gives for documents: Storage's `list()` does not recurse, and
 * the sweep has to enumerate the bucket. Named by a fresh uuid every upload and
 * **never overwritten**, so a replaced photograph is a new URL and no cache
 * between here and a visitor can serve the old one in its place.
 */
export function siteImageStorageKey(input: {
  propertyId: string
  imageId: string
  extension: string
}): string {
  return `${input.propertyId}/${input.imageId}.${input.extension}`
}

/* ── The shrink in the browser ────────────────────────────────────────────── */

/**
 * The longest edge a photograph is stored at.
 *
 * The widest slot on the site is the hero, a little over 540px across on a
 * desktop and full width on a phone — 2400 covers either at three times the
 * pixel density, and a JPEG that size sits comfortably under the 4 MB ceiling.
 */
export const SHRINK_LONG_EDGE = 2400

/**
 * The size a photograph is shrunk to: its own shape, with the long edge no
 * longer than the ceiling, and never enlarged.
 *
 * Null for an image with no usable size, which is a decode that failed rather
 * than a photograph.
 */
export function fitWithin(
  width: number,
  height: number,
  maxLongEdge: number = SHRINK_LONG_EDGE,
): { width: number; height: number } | null {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) {
    return null
  }

  const scale = Math.min(1, maxLongEdge / Math.max(width, height))

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Below this on the long edge, a photograph looks soft across the hero on a
 * large screen. A note, never a refusal: a soft photograph of the real pool is
 * still better than a placeholder.
 */
export const SOFT_PHOTO_LONG_EDGE = 1200

export function isSoftPhoto(width: number, height: number): boolean {
  return Math.max(width, height) < SOFT_PHOTO_LONG_EDGE
}
