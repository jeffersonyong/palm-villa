import { describe, expect, test } from 'vitest'

import { AVATAR_TONES, avatarTone, initials } from './avatar-identity'

describe('avatarTone', () => {
  test('gives the same person the same colour every time', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

    expect(avatarTone(id)).toBe(avatarTone(id))
  })

  test('always returns a tone from the set', () => {
    for (let index = 0; index < 500; index += 1) {
      expect(AVATAR_TONES).toContain(avatarTone(`account-${index}`))
    }
  })

  test('spreads a roster across the whole set rather than clustering', () => {
    // The reason this is not a char-code sum: UUIDs share an alphabet and a
    // length, so a sum lands most of a roster on two tones. Every hue should
    // be reachable from UUID-shaped input.
    const ids = Array.from(
      { length: 60 },
      (_, index) => `7c9e6679-7425-40de-944b-e07fc1f90a${index.toString(16).padStart(2, '0')}`,
    )
    const used = new Set(ids.map(avatarTone))

    expect(used.size).toBe(AVATAR_TONES.length)
  })

  test('an absent id still resolves, rather than rendering an unstyled circle', () => {
    expect(AVATAR_TONES).toContain(avatarTone(''))
  })
})

describe('initials', () => {
  test('takes the first and last name', () => {
    expect(initials('Nur Amalina')).toBe('NA')
    expect(initials('Pengiran Muhammad Vahid')).toBe('PV')
  })

  test('a lone name keeps its first two letters', () => {
    expect(initials('Amalina')).toBe('AM')
  })

  test('falls back rather than rendering an empty circle', () => {
    expect(initials('   ')).toBe('PV')
  })
})
