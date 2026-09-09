import { isAccessToken } from './public-booking'

/**
 * Where this deployment thinks it lives, and the one link an email carries
 * (capability A8).
 *
 * ── Why the origin is configured and never inferred ────────────────────────
 *
 * The obvious implementation reads the request's `Host` header, and it is a
 * hole: the public booking form is reachable by anybody, so an email whose
 * link is built from a header is an email an attacker points wherever they
 * like by sending one crafted POST. The guest then receives a real Palm Villa
 * confirmation, about a real booking they made, linking to somebody else's
 * page. `SITE_ORIGIN` is therefore configuration, and this module never sees
 * a request.
 *
 * Pure, so it is tested by inspection rather than by setting environment
 * variables in a test — `lib/env.ts` reads the variable and hands the string
 * here.
 */

/**
 * An origin with no trailing slash, or null if the string is not one.
 *
 * Refuses anything carrying a path, a query or a fragment: `SITE_ORIGIN` is a
 * scheme and a host, and a value like `https://palmvilla.bn/booking` would
 * silently produce `/booking/booking/{token}`. Failing here means the misread
 * variable is noticed at the first send rather than by a guest.
 */
export function normaliseOrigin(raw: string): string | null {
  const trimmed = raw.trim()

  if (trimmed === '') {
    return null
  }

  let url: URL

  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }

  // `new URL('https://x')` normalises the path to '/', which is the only path
  // an origin may carry. Anything else was written by somebody who meant a
  // page rather than a host.
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return null
  }

  return url.origin
}

/**
 * A customer's private link to their own booking.
 *
 * The token is re-checked here rather than trusted, for the reason the public
 * actions re-check it before redirecting: a booking made at the desk has no
 * token at all, and interpolating whatever was passed would produce
 * `/booking/null` in an email somebody would then have to explain.
 */
export function bookingUrl(origin: string, token: string | null): string | null {
  if (token === null || !isAccessToken(token)) {
    return null
  }

  const base = normaliseOrigin(origin)

  return base === null ? null : `${base}/booking/${token}`
}
