import { describe, expect, it } from 'vitest'

import { composePhoneNumber, normalisePhoneForMatch, phonesMatch, splitPhoneNumber } from './phone'

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

/**
 * The dial codes the phone control offers. Written out rather than imported
 * from `countries.ts` so these tests pin the *splitting rule* — longest match
 * first, no country code invented — and do not quietly change meaning the day
 * a country is added to the list.
 */
const DIAL_CODES = ['1', '1868', '44', '60', '65', '673', '7', '86']

describe('splitPhoneNumber', () => {
  it('takes the country code off a number that carries one', () => {
    expect(splitPhoneNumber('+673 8959798', DIAL_CODES)).toEqual({
      dialCode: '673',
      nationalNumber: '8959798',
    })
  })

  /**
   * The case the whole picker exists for. A guest ringing from abroad picks
   * their country and the number keeps its own shape.
   */
  it('reads a foreign number as its own country', () => {
    expect(splitPhoneNumber('+65 9123 4567', DIAL_CODES)).toEqual({
      dialCode: '65',
      nationalNumber: '9123 4567',
    })
  })

  /**
   * Longest match, or every Caribbean number would come back as American with
   * three stray digits in front of it.
   */
  it('prefers the longest dial code that fits', () => {
    expect(splitPhoneNumber('+1868 291 1234', DIAL_CODES)).toEqual({
      dialCode: '1868',
      nationalNumber: '291 1234',
    })
    expect(splitPhoneNumber('+1 555 0100', DIAL_CODES)).toEqual({
      dialCode: '1',
      nationalNumber: '555 0100',
    })
  })

  it('unwraps the international prefix somebody dialled instead of a plus', () => {
    expect(splitPhoneNumber('00673 8959798', DIAL_CODES)).toEqual({
      dialCode: '673',
      nationalNumber: '8959798',
    })
  })

  it('keeps the spacing and punctuation the number was written with', () => {
    expect(splitPhoneNumber('+44 20 7946 0958', DIAL_CODES)).toEqual({
      dialCode: '44',
      nationalNumber: '20 7946 0958',
    })
    expect(splitPhoneNumber('+673-895-9798', DIAL_CODES)).toEqual({
      dialCode: '673',
      nationalNumber: '895-9798',
    })
  })

  /**
   * **The invariant prd.md §13 states in as many words**: the number is stored
   * exactly as typed and never rewritten. Every booking taken at the desk is a
   * bare `8959798`, and reading one back must not silently decide it is
   * Brunei's — the control shows a default beside it, and that guess stays in
   * the control until somebody edits the field.
   */
  it('never invents a country code for a number that has none', () => {
    expect(splitPhoneNumber('8959798', DIAL_CODES)).toEqual({
      dialCode: null,
      nationalNumber: '8959798',
    })
    expect(splitPhoneNumber('673 8959798', DIAL_CODES)).toEqual({
      dialCode: null,
      nationalNumber: '673 8959798',
    })
  })

  it('hands back an unrecognised country code untouched', () => {
    expect(splitPhoneNumber('+999 12345', DIAL_CODES)).toEqual({
      dialCode: null,
      nationalNumber: '+999 12345',
    })
  })

  it('survives an empty field', () => {
    expect(splitPhoneNumber('', DIAL_CODES)).toEqual({ dialCode: null, nationalNumber: '' })
    expect(splitPhoneNumber('   ', DIAL_CODES)).toEqual({ dialCode: null, nationalNumber: '' })
    expect(splitPhoneNumber('+', DIAL_CODES)).toEqual({ dialCode: null, nationalNumber: '+' })
  })
})

describe('composePhoneNumber', () => {
  it('writes the code and the number with one space between them', () => {
    expect(composePhoneNumber('673', '8959798')).toBe('+673 8959798')
    expect(composePhoneNumber('65', '  9123 4567  ')).toBe('+65 9123 4567')
  })

  /**
   * A bare `+673` would satisfy every length check on the way to the desk and
   * arrive as a number nobody can ring. An empty field has to stay empty.
   */
  it('is empty when no number was typed', () => {
    expect(composePhoneNumber('673', '')).toBe('')
    expect(composePhoneNumber('673', '   ')).toBe('')
  })
})

/**
 * The join between the new control and capability A9, and the reason the
 * picker is safe to add: a booking taken at the desk before this existed is
 * still found by a customer who picks Brunei and types their number.
 */
describe('the picker and the lookup agree', () => {
  it('finds a desk booking from a number composed by the control', () => {
    expect(phonesMatch(composePhoneNumber('673', '8959798'), '8959798')).toBe(true)
  })

  it('finds an online booking from a number typed bare at the desk', () => {
    expect(phonesMatch('8959798', composePhoneNumber('673', '895 9798'))).toBe(true)
  })

  it('still refuses a foreign number that ends the same way', () => {
    expect(phonesMatch(composePhoneNumber('1', '555 8959798'), '8959798')).toBe(false)
  })

  it('round-trips a number through the control unchanged', () => {
    const stored = '+65 9123 4567'
    const split = splitPhoneNumber(stored, DIAL_CODES)

    expect(composePhoneNumber(split.dialCode ?? '673', split.nationalNumber)).toBe(stored)
  })
})
