import { describe, expect, test } from 'vitest'

import { parsePlacementKey } from '@/lib/domain/site-image'

import { facilities, unitTypes } from './landing'

/**
 * The landing page's cards against the photographs that can hang off them
 * (capability F7).
 *
 * A photograph is found by the slug of the row it belongs to, so a card whose
 * slug is malformed or shared with another card would silently never show one.
 * That each slug also exists in the database is lib/db/site-images.test.ts's
 * job, because only a database can say.
 */
describe('the landing cards', () => {
  test.each(facilities)('the $name card can carry a photograph', ({ slug }) => {
    expect(parsePlacementKey(`facility:${slug}`)).toEqual({ kind: 'facility', slug })
  })

  test.each(unitTypes)('the $name card can carry a photograph', ({ slug }) => {
    expect(parsePlacementKey(`unit-type:${slug}`)).toEqual({ kind: 'unit_type', slug })
  })

  test('no two cards share a slug, so no two share a photograph', () => {
    expect(new Set(facilities.map((facility) => facility.slug)).size).toBe(facilities.length)
    expect(new Set(unitTypes.map((unit) => unit.slug)).size).toBe(unitTypes.length)
  })
})
