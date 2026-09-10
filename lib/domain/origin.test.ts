import { describe, expect, test } from 'vitest'

import { bookingUrl, findBookingUrl, normaliseOrigin } from './origin'

/**
 * The link an email carries.
 *
 * Worth testing for one reason: everything here fails silently. A trailing
 * slash produces a double slash a guest may still be able to open, a path in
 * the variable produces a 404 nobody sees, and a missing token produces
 * `/booking/null`. None of it throws, and all of it reaches a customer.
 */

const TOKEN = 'Ab3xY9-_ZqRs7TuVwX2Kd0'

describe('normaliseOrigin', () => {
  test('keeps a plain origin as it is', () => {
    expect(normaliseOrigin('https://palmvilla.bn')).toBe('https://palmvilla.bn')
  })

  test('strips a trailing slash', () => {
    expect(normaliseOrigin('https://palmvilla.bn/')).toBe('https://palmvilla.bn')
  })

  test('keeps a port, which is how localhost is written', () => {
    expect(normaliseOrigin('http://localhost:3000')).toBe('http://localhost:3000')
  })

  test('trims surrounding whitespace, which a pasted variable carries', () => {
    expect(normaliseOrigin('  https://palmvilla.bn  ')).toBe('https://palmvilla.bn')
  })

  test('refuses a value carrying a path', () => {
    expect(normaliseOrigin('https://palmvilla.bn/booking')).toBeNull()
  })

  test('refuses a value carrying a query or a fragment', () => {
    expect(normaliseOrigin('https://palmvilla.bn?utm=1')).toBeNull()
    expect(normaliseOrigin('https://palmvilla.bn#top')).toBeNull()
  })

  test('refuses a host with no scheme', () => {
    expect(normaliseOrigin('palmvilla.bn')).toBeNull()
  })

  test('refuses a scheme that is not http or https', () => {
    expect(normaliseOrigin('javascript:alert(1)')).toBeNull()
    expect(normaliseOrigin('ftp://palmvilla.bn')).toBeNull()
  })

  test('refuses an empty string, which is an unset variable', () => {
    expect(normaliseOrigin('')).toBeNull()
    expect(normaliseOrigin('   ')).toBeNull()
  })
})

describe('bookingUrl', () => {
  test('joins an origin and a token', () => {
    expect(bookingUrl('https://palmvilla.bn', TOKEN)).toBe(`https://palmvilla.bn/booking/${TOKEN}`)
  })

  test('normalises the origin on the way through', () => {
    expect(bookingUrl('https://palmvilla.bn/', TOKEN)).toBe(`https://palmvilla.bn/booking/${TOKEN}`)
  })

  test('returns null for a booking with no token, rather than /booking/null', () => {
    expect(bookingUrl('https://palmvilla.bn', null)).toBeNull()
  })

  test('returns null for a token of the wrong shape', () => {
    expect(bookingUrl('https://palmvilla.bn', 'too-short')).toBeNull()
    expect(bookingUrl('https://palmvilla.bn', `${TOKEN}extra`)).toBeNull()
  })

  test('returns null when the origin is unusable', () => {
    expect(bookingUrl('palmvilla.bn', TOKEN)).toBeNull()
  })
})

describe('findBookingUrl', () => {
  test('points at the public lookup page', () => {
    expect(findBookingUrl('https://palmvilla.bn')).toBe('https://palmvilla.bn/find-booking')
  })

  test('normalises the origin on the way through', () => {
    expect(findBookingUrl('https://palmvilla.bn/')).toBe('https://palmvilla.bn/find-booking')
  })

  /**
   * The difference from `bookingUrl`, and the whole point of carrying both:
   * this one needs no token, so it is present on the email for a booking
   * taken at the desk — which is exactly the booking with no link.
   */
  test('needs no token, so a desk booking still gets a way back', () => {
    expect(findBookingUrl('https://palmvilla.bn')).not.toBeNull()
  })

  test('returns null when the origin is unusable', () => {
    expect(findBookingUrl('palmvilla.bn')).toBeNull()
    expect(findBookingUrl('')).toBeNull()
  })
})
