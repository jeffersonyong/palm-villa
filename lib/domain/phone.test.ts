import { describe, expect, it } from 'vitest'

import { normalisePhoneForMatch, phonesMatch } from './phone'

/**
 * These pin the property capability A9 rests on: a customer who books online
 * as `+673 8959798` and a staff member who types `8959798` at the desk have
 * recorded one number, and either spelling has to find the booking the other
 * made. Get this wrong in the permissive direction and the lookup hands out a
 * link to somebody else's booking; get it wrong in the strict direction and
 * a guest who has lost their link is told their own number is not theirs.
 */

/** Every way one Brunei mobile number turns up in the wild. */
const ONE_NUMBER = [
  '8959798',
  '08959798',
  '673 8959798',
  '+673 8959798',
  '+6738959798',
  '673-895-9798',
  '(673) 8959798',
  '00673 8959798',
  '  +673 8959 798  ',
]

describe('normalisePhoneForMatch', () => {
  it.each(ONE_NUMBER)('reduces %j to the subscriber number', (spelling) => {
    expect(normalisePhoneForMatch(spelling)).toBe('8959798')
  })

  it('refuses a string with nothing number-like in it', () => {
    expect(normalisePhoneForMatch('')).toBeNull()
    expect(normalisePhoneForMatch('   ')).toBeNull()
    expect(normalisePhoneForMatch('abc')).toBeNull()
    expect(normalisePhoneForMatch('+')).toBeNull()
    expect(normalisePhoneForMatch('-- --')).toBeNull()
  })

  it('refuses zeros, which are padding rather than a number', () => {
    expect(normalisePhoneForMatch('0')).toBeNull()
    expect(normalisePhoneForMatch('000')).toBeNull()
  })

  it('refuses a bare country code, which names a country and not a person', () => {
    expect(normalisePhoneForMatch('+673')).toBeNull()
  })

  it('holds the floor where it is set', () => {
    expect(normalisePhoneForMatch('12345')).toBeNull()
    expect(normalisePhoneForMatch('123456')).toBe('123456')
  })

  /**
   * The country code comes off only when a whole number is left behind it.
   * `6731234` is seven digits — a number in its own right, not `673` and a
   * subscriber number — so stripping it would invent a four-digit number that
   * matches nothing.
   */
  it('leaves a seven-digit number starting 673 alone', () => {
    expect(normalisePhoneForMatch('6731234')).toBe('6731234')
  })

  /**
   * Only the local country code collapses, because only it appears in this
   * dataset spelled two ways. A foreign number still matches itself — which
   * is the whole requirement — without this module guessing where the caller
   * lives.
   */
  it('does not infer any other country code', () => {
    expect(normalisePhoneForMatch('+65 9123 4567')).toBe('6591234567')
    expect(normalisePhoneForMatch('6591234567')).toBe('6591234567')
  })
})

describe('phonesMatch', () => {
  it('matches every spelling of one number against every other', () => {
    for (const left of ONE_NUMBER) {
      for (const right of ONE_NUMBER) {
        expect(phonesMatch(left, right), `${left} vs ${right}`).toBe(true)
      }
    }
  })

  /**
   * The security property. `guest.phone` is non-null but the public forms
   * accept anything from five characters and the desk form has no floor at
   * all, so a booking recorded with junk is reachable — and if two
   * unnormalisable strings compared equal, anyone typing junk could open it.
   */
  it('refuses a pair where either side is not a number', () => {
    expect(phonesMatch('abc', 'abc')).toBe(false)
    expect(phonesMatch('--', '--')).toBe(false)
    expect(phonesMatch('', '')).toBe(false)
    expect(phonesMatch('8959798', '')).toBe(false)
    expect(phonesMatch('', '8959798')).toBe(false)
  })

  it('refuses two different numbers', () => {
    expect(phonesMatch('8959798', '8959799')).toBe(false)
    expect(phonesMatch('+673 8959798', '+673 7123456')).toBe(false)
  })

  /**
   * No suffix matching. A lookup that hands out a credential must not widen
   * its own guess space, and a foreign number ending in the same seven digits
   * is a different person.
   */
  it('refuses a number that merely ends the same way', () => {
    expect(phonesMatch('+1 555 8959798', '8959798')).toBe(false)
  })
})
