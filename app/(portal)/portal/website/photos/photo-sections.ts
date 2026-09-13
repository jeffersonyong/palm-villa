import { facilities, unitTypes } from '@/app/(public)/_content/landing'
import type { SiteImage } from '@/lib/db/site-images'
import {
  SITE_IMAGE_SLOTS,
  aspectFor,
  placementKey,
  type SiteImageAspect,
  type SiteImageFocus,
  type SiteImagePlacement,
} from '@/lib/domain/site-image'

/**
 * The photographs screen, laid out the way the front page is (capability F7).
 *
 * Four sections in the landing page's own order, and within each exactly the
 * cards the page renders — read from the landing page's own lists, so a card
 * added there appears here too and the screen never offers a place the site
 * does not show. Pure, so the arrangement is tested without a page.
 */

export interface CurrentPhotoView {
  id: string
  url: string
  altText: string
  focus: SiteImageFocus
  uploadedAt: string
  /** Who put it up, as a name. */
  uploadedBy: string
}

export interface PhotoSlotView {
  /** The placement key the actions are sent (`hero`, `facility:water-park`, …). */
  key: string
  /** What the place is called on the site. */
  name: string
  aspect: SiteImageAspect
  current: CurrentPhotoView | null
}

export interface PhotoSectionView {
  id: string
  title: string
  hint: string
  slots: readonly PhotoSlotView[]
}

const FEED_SLOTS = SITE_IMAGE_SLOTS.filter((slot) => slot !== 'hero')

export function photoSections(
  images: readonly SiteImage[],
  nameFor: (userId: string) => string,
): readonly PhotoSectionView[] {
  const byKey = new Map(images.map((image) => [placementKey(image.placement), image]))

  function slotView(placement: SiteImagePlacement, name: string): PhotoSlotView {
    const key = placementKey(placement)
    const image = byKey.get(key)

    return {
      key,
      name,
      aspect: aspectFor(placement),
      current: image
        ? {
            id: image.id,
            url: image.url,
            altText: image.altText,
            focus: image.focus,
            uploadedAt: image.uploadedAt,
            uploadedBy: nameFor(image.uploadedBy),
          }
        : null,
    }
  }

  return [
    {
      id: 'front-page',
      title: 'Front page',
      hint: 'The photograph beside the headline at the top of the front page — the first thing a visitor sees.',
      slots: [slotView({ kind: 'slot', slot: 'hero' }, 'Front page')],
    },
    {
      id: 'day-pass',
      title: 'Day pass',
      hint: 'One photograph for each facility card in the day-pass section.',
      slots: facilities.map((facility) =>
        slotView({ kind: 'facility', slug: facility.slug }, facility.name),
      ),
    },
    {
      id: 'short-stays',
      title: 'Short stays',
      hint: 'One photograph for each unit type in the stays section.',
      slots: unitTypes.map((unit) => slotView({ kind: 'unit_type', slug: unit.slug }, unit.name)),
    },
    {
      id: 'follow-along',
      title: 'Follow along',
      hint: 'The four square tiles above the Instagram and TikTok links, in order.',
      slots: FEED_SLOTS.map((slot, index) => slotView({ kind: 'slot', slot }, `Tile ${index + 1}`)),
    },
  ]
}
