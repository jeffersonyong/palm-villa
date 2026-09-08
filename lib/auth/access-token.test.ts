import { describe, expect, test } from 'vitest'

import { isAccessToken } from '../domain/public-booking'
import { clientIpFrom, hashPublicKey, newAccessToken } from './access-token'

/**
 * The one string standing between one customer and another's booking.
 *
 * There is no session behind `/booking/[token]` — customers have no accounts
 * (architecture.md §3) — so the token is the whole control, and these tests
 * are about the two ways it could quietly stop being one: the wrong shape, or
 * not enough of it.
 */

describe('a booking access token', () => {
  test('is the shape the column and the domain both demand', () => {
    // Three properties in one assertion, deliberately: if this ever fails the
    // token stops being storable at all, because the same pattern is a CHECK
    // constraint on `booking.access_token`.
    for (let index = 0; index < 50; index += 1) {
      expect(isAccessToken(newAccessToken())).toBe(true)
    }
  })

  test('is URL-safe, so it survives being pasted and clicked', () => {
    // base64url rather than base64: no `+`, `/` or `=`, each of which either
    // changes meaning in a query string or gets stripped by a chat client that
    // thinks it has found the end of the link.
    for (let index = 0; index < 50; index += 1) {
      expect(newAccessToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  test('does not repeat', () => {
    // 128 bits, so a collision is not a thing that happens; what this actually
    // guards against is somebody swapping the source of randomness for
    // something seeded, which would show up here immediately.
    const tokens = new Set(Array.from({ length: 500 }, () => newAccessToken()))

    expect(tokens.size).toBe(500)
  })
})

describe('the key a rate-limit counter is filed under', () => {
  test('is a digest, never the value', () => {
    const phone = '+673 8959798'

    expect(hashPublicKey(phone)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashPublicKey(phone)).not.toContain('8959798')
  })

  test('is stable, or the counter would reset on every request', () => {
    expect(hashPublicKey('203.0.113.7')).toBe(hashPublicKey('203.0.113.7'))
  })

  test('ignores surrounding whitespace and case', () => {
    // The same address arriving with a trailing space would otherwise get its
    // own bucket, which is a rate limit that never fires.
    expect(hashPublicKey(' 203.0.113.7 ')).toBe(hashPublicKey('203.0.113.7'))
    expect(hashPublicKey('2001:DB8::1')).toBe(hashPublicKey('2001:db8::1'))
  })

  test('tells two callers apart', () => {
    expect(hashPublicKey('203.0.113.7')).not.toBe(hashPublicKey('203.0.113.8'))
  })
})

describe('the caller address', () => {
  test('takes the first hop, which is the client', () => {
    // Each proxy appends, so the client is at the front and everything after
    // it is infrastructure. Taking the last would key every visitor to the
    // same edge node and limit the whole world at once.
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })

    expect(clientIpFrom(headers)).toBe('203.0.113.7')
  })

  test('trims the spacing the header convention uses', () => {
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '  203.0.113.7  ' }))).toBe('203.0.113.7')
  })

  test('falls back to x-real-ip', () => {
    expect(clientIpFrom(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  test('is null when nothing says, rather than a shared bucket', () => {
    // A local run sets neither header. Returning a constant would put every
    // developer, and every request in a misconfigured deployment, into one
    // counter that trips after ten bookings and stays tripped.
    expect(clientIpFrom(new Headers())).toBeNull()
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '   ' }))).toBeNull()
  })
})
