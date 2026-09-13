import { describe, expect, test } from 'vitest'

import { NO_LANDING_IMAGES, landingImagesFrom, type PlacedImage } from './landing-images'

/**
 * The landing page's photographs, arranged for its sections (capability F7).
 */

function photo(placement: PlacedImage['placement'], name: string): PlacedImage {
  return { placement, url: `https://storage.test/${name}.jpg`, altText: name, focus: 'center' }
}

describe('landingImagesFrom', () => {
  test('with nothing on the site, every place shows its placeholder', () => {
    expect(landingImagesFrom([])).toEqual(NO_LANDING_IMAGES)
    expect(NO_LANDING_IMAGES.feed).toEqual([null, null, null, null])
  })

  test('puts each photograph where it belongs', () => {
    const images = landingImagesFrom([
      photo({ kind: 'slot', slot: 'hero' }, 'pool'),
      photo({ kind: 'facility', slug: 'water-park' }, 'slides'),
      photo({ kind: 'unit_type', slug: 'semi-detached' }, 'house'),
    ])

    expect(images.hero).toEqual({
      src: 'https://storage.test/pool.jpg',
      alt: 'pool',
      objectPosition: 'center center',
    })
    expect(images.facilities['water-park']?.alt).toBe('slides')
    expect(images.unitTypes['semi-detached']?.alt).toBe('house')
  })

  test('keeps the "Follow along" tiles in order, with gaps where a tile is empty', () => {
    const images = landingImagesFrom([
      photo({ kind: 'slot', slot: 'feed-3' }, 'third'),
      photo({ kind: 'slot', slot: 'feed-1' }, 'first'),
    ])

    expect(images.feed.map((tile) => tile?.alt ?? null)).toEqual(['first', null, 'third', null])
  })

  test('carries the framing as the object-position that keeps it in view', () => {
    const images = landingImagesFrom([
      { ...photo({ kind: 'slot', slot: 'hero' }, 'pool'), focus: 'bottom-left' },
    ])

    expect(images.hero?.objectPosition).toBe('left bottom')
  })
})
