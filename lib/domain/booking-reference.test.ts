import { describe, expect, it } from 'vitest'

import { normalisePublicReference } from './booking-reference'

/**
 * A customer reading `PV-4821` off a bank statement types it back about four
 * ways, and capability A9 has to find the booking for all of them. The one
 * thing this must not do is invent a reference: anything that is not a
 * reference comes back null and is refused in the same words as one that
 * simply does not exist.
 */
describe('normalisePublicReference', () => {
  it.each(['PV-4821', 'pv-4821', 'PV4821', 'pv4821', 'PV 4821', 'pv 4821', '  pv-4821  ', '4821'])(
    'reads %j as PV-4821',
    (typed) => {
      expect(normalisePublicReference(typed)).toBe('PV-4821')
    },
  )

  /**
   * architecture.md §6.1: `booking_reference_for()` stops padding past 9999,
   * so anything reading a reference has to accept `PV-\d{4,}`. Padding or
   * truncating here would turn a real reference into one that matches nothing.
   */
  it('leaves a reference past 9999 at its own length', () => {
    expect(normalisePublicReference('PV-10432')).toBe('PV-10432')
    expect(normalisePublicReference('10432')).toBe('PV-10432')
  })

  it('does not pad a short number into a reference nobody was issued', () => {
    expect(normalisePublicReference('821')).toBe('PV-821')
  })

  it('refuses anything with no digits to build a reference from', () => {
    expect(normalisePublicReference('PV-')).toBeNull()
    expect(normalisePublicReference('PV')).toBeNull()
    expect(normalisePublicReference('')).toBeNull()
    expect(normalisePublicReference('   ')).toBeNull()
    expect(normalisePublicReference('abc')).toBeNull()
  })

  it('refuses a reference with anything else in it', () => {
    expect(normalisePublicReference('PV-4821X')).toBeNull()
    expect(normalisePublicReference('PV-48/21')).toBeNull()
  })
})
