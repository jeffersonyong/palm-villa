import { objectPositionFor, type SiteImageFocus, type SiteImagePlacement } from './site-image'

/**
 * The landing page's photographs, arranged the way its sections ask for them
 * (capability F7).
 *
 * The database hands back a flat list of what is on the site; the hero wants
 * one photograph, the day-pass and stays grids want one per card by slug, and
 * the "Follow along" strip wants four in order with gaps where a tile is
 * empty. Pure, so the arrangement is tested without a page or a database.
 */

/** What this needs from a stored photograph. `SiteImage` in lib/db satisfies it. */
export interface PlacedImage {
  placement: SiteImagePlacement
  url: string
  altText: string
  focus: SiteImageFocus
}

/** One photograph as a section renders it. */
export interface LandingImage {
  src: string
  alt: string
  /** CSS `object-position` — which part stays in view when the slot crops it. */
  objectPosition: string
}

export interface LandingImages {
  hero: LandingImage | null
  /** By `facility.slug`. A card with no entry shows its placeholder. */
  facilities: Readonly<Record<string, LandingImage>>
  /** By `unit_type.slug`. */
  unitTypes: Readonly<Record<string, LandingImage>>
  /** The four "Follow along" tiles in order, null where a tile has no photograph. */
  feed: readonly (LandingImage | null)[]
}

const FEED_SLOTS = ['feed-1', 'feed-2', 'feed-3', 'feed-4'] as const

/** Every place empty: what the page renders when no photograph could be read. */
export const NO_LANDING_IMAGES: LandingImages = {
  hero: null,
  facilities: {},
  unitTypes: {},
  feed: FEED_SLOTS.map(() => null),
}

function toLandingImage(image: PlacedImage): LandingImage {
  return {
    src: image.url,
    alt: image.altText,
    objectPosition: objectPositionFor(image.focus),
  }
}

function inSlot(images: readonly PlacedImage[], slot: string): LandingImage | null {
  const found = images.find(
    (image) => image.placement.kind === 'slot' && image.placement.slot === slot,
  )

  return found ? toLandingImage(found) : null
}

function bySlug(
  images: readonly PlacedImage[],
  kind: 'facility' | 'unit_type',
): Readonly<Record<string, LandingImage>> {
  return Object.fromEntries(
    images.flatMap((image) =>
      image.placement.kind === kind ? [[image.placement.slug, toLandingImage(image)]] : [],
    ),
  )
}

export function landingImagesFrom(images: readonly PlacedImage[]): LandingImages {
  return {
    hero: inSlot(images, 'hero'),
    facilities: bySlug(images, 'facility'),
    unitTypes: bySlug(images, 'unit_type'),
    feed: FEED_SLOTS.map((slot) => inSlot(images, slot)),
  }
}
