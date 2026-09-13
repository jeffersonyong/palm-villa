import { describe, expect, test } from 'vitest'

import { facilities, unitTypes } from '@/app/(public)/_content/landing'
import type { SiteImage } from '@/lib/db/site-images'

import { photoSections } from './photo-sections'

/**
 * The photographs screen against the front page it manages (capability F7).
 */

const STAFF = new Map([['user-1', 'Jason']])
const nameFor = (userId: string) => STAFF.get(userId) ?? 'a former colleague'

function image(placement: SiteImage['placement']): SiteImage {
  return {
    id: `image-${JSON.stringify(placement)}`,
    placement,
    altText: 'A photograph',
    focus: 'top',
    mimeType: 'image/jpeg',
    byteSize: 1024,
    uploadedBy: 'user-1',
    uploadedAt: '2026-09-13T02:00:00Z',
    url: 'https://storage.test/photo.jpg',
  }
}

describe('photoSections', () => {
  test('mirrors the front page: its four sections, in its order, with every card it renders', () => {
    const sections = photoSections([], nameFor)

    expect(sections.map((section) => section.title)).toEqual([
      'Front page',
      'Day pass',
      'Short stays',
      'Follow along',
    ])
    expect(sections.flatMap((section) => section.slots)).toHaveLength(
      1 + facilities.length + unitTypes.length + 4,
    )
  })

  test('crops each preview to the shape the site shows it at', () => {
    const [front, dayPass, , follow] = photoSections([], nameFor)

    expect(front!.slots[0]!.aspect).toBe('photo')
    expect(dayPass!.slots.every((slot) => slot.aspect === 'photo')).toBe(true)
    expect(follow!.slots.every((slot) => slot.aspect === 'square')).toBe(true)
  })

  test('puts a current photograph on its card, naming who put it up', () => {
    const sections = photoSections([image({ kind: 'facility', slug: 'water-park' })], nameFor)
    const waterPark = sections[1]!.slots.find((slot) => slot.key === 'facility:water-park')

    expect(waterPark?.current).toMatchObject({ focus: 'top', uploadedBy: 'Jason' })
    expect(sections[0]!.slots[0]!.current).toBeNull()
  })

  test('numbers the "Follow along" tiles in order', () => {
    const follow = photoSections([], nameFor)[3]!

    expect(follow.slots.map((slot) => [slot.key, slot.name])).toEqual([
      ['feed-1', 'Tile 1'],
      ['feed-2', 'Tile 2'],
      ['feed-3', 'Tile 3'],
      ['feed-4', 'Tile 4'],
    ])
  })
})
