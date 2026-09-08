import { createHash, randomBytes } from 'node:crypto'

/**
 * The randomness the public flow runs on.
 *
 * In `lib/auth` rather than `lib/domain` for one reason: `lib/domain` is pure
 * — no I/O, no clock, no entropy — and every module there is unit-testable by
 * inspection. A function that returns a different answer each time is none of
 * those things, so it lives beside the other things the server knows and the
 * browser must not (`lib/auth/cron.ts` is the neighbour, and the same shape:
 * a small module of server-only primitives).
 *
 * No dependency is added for any of this. `nanoid` is what architecture.md §7
 * names for the QR token and it is not installed; `node:crypto` produces the
 * same quality of randomness from the standard library, and CLAUDE.md's rule
 * about dependencies is not worth spending on 22 characters.
 */

/** 16 bytes — 128 bits — which is 22 characters in base64url. */
const TOKEN_BYTES = 16

/**
 * A customer's private link to their own booking.
 *
 * Base64url so it survives a URL, a WhatsApp message and a double-click
 * without escaping or breaking at a hyphen. `randomBytes` rather than
 * `Math.random`, obviously, but worth saying why it matters here: this string
 * is the only thing standing between one customer and another's booking, since
 * the page behind it is not gated by a session (architecture.md §3 — customers
 * have no accounts).
 */
export function newAccessToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/**
 * The key a rate-limit counter is filed under.
 *
 * Hashed because the two things being counted — an IP address and a phone
 * number — are both personal data under the PDPO (prd.md §13), and the counter
 * needs only to tell two callers apart. A digest does that and cannot be read
 * back into the person.
 *
 * Unsalted, deliberately: a salt would have to be stored, rotated, and shared
 * across serverless instances to keep the counter working at all, and the
 * threat it defends against — somebody with the database enumerating phone
 * numbers — already has the `guest` table, where the numbers are in plain text
 * because the business rings them.
 */
export function hashPublicKey(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

/**
 * The caller's address, as far as it can be known.
 *
 * `x-forwarded-for` is a list, appended to by each proxy, so the **first** hop
 * is the client and everything after it is infrastructure. It is also trivially
 * spoofable by the client, which is worth stating plainly: this is a counter
 * key, not an identity, and the defence it supports is one of three (the
 * honeypot and the open-holds cap are the others, and the cap is the one that
 * protects inventory).
 *
 * Null when there is no header — a local run, or a platform that does not set
 * one. The caller decides what that means; it does not silently become a
 * shared bucket that limits everybody at once.
 */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()

    if (first) {
      return first
    }
  }

  return headers.get('x-real-ip')?.trim() || null
}
