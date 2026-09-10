/**
 * The booking reference, as a customer types it back.
 *
 * `PV-4821` is generated in SQL (`next_booking_reference()`) and printed on a
 * bank transfer, which is the whole point of it — prd.md §10.2 calls it "the
 * highest-leverage detail in the payment design". Capability A9 gives it a
 * second job: half of what a customer needs to find their own booking again.
 *
 * The two jobs want different things. A reference the system generates is
 * exactly one string; a reference a customer reads off a bank statement at
 * arm's length and types into a phone is `4821`, `pv 4821`, `PV4821` or
 * `pv-4821` about as often as it is the real thing. `getBookingByReference`
 * already upper-cases and trims, but it will not add a prefix that isn't
 * there, so this is where the difference is absorbed — once, before the
 * reference reaches a query.
 *
 * **The digits are not padded and not capped.** architecture.md §6.1 fixed the
 * format as `PV-` plus a number that is zero-padded to four *only while it
 * fits*: `booking_reference_for()` emits `PV-10432` unchanged past 9999, and
 * anything reading a reference has to accept `PV-\d{4,}`. Padding here would
 * turn a real five-digit reference into a four-digit one that matches nothing.
 */

/** What every reference starts with, and the one prefix this will strip. */
const REFERENCE_PREFIX = 'PV'

/**
 * A reference as the database stores it, or `null` where there were no digits
 * to build one from.
 *
 * `null` means "this cannot be a reference", not "this reference is unknown" —
 * and both refusals have to look identical to the customer, so the caller
 * renders one message for the pair. See `findBookingLink`.
 */
export function normalisePublicReference(raw: string): string | null {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, '')

  // The prefix comes off with whatever separator was typed in place of the
  // hyphen — or none at all, which is how `PV4821` gets in.
  const withoutPrefix = compact.startsWith(REFERENCE_PREFIX)
    ? compact.slice(REFERENCE_PREFIX.length).replace(/^[^0-9A-Z]+/, '')
    : compact

  // Digits only, so a trailing character picked up from a bank statement does
  // not turn a good reference into a miss. Anything else in the string means
  // this was never a reference, which is what the emptiness test catches.
  return /^\d+$/.test(withoutPrefix) ? `${REFERENCE_PREFIX}-${withoutPrefix}` : null
}
