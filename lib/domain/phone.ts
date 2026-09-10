/**
 * Phone numbers, compared rather than stored.
 *
 * Capability A9 lets a customer find their own booking with the reference on
 * their transfer and the number they booked with. That makes the phone number
 * half of a credential, and a credential has to survive the fact that nobody
 * writes a Brunei number the same way twice: `+673 8959798` at the booking
 * form, `8959798` typed at the desk, `673-895-9798` off a WhatsApp contact
 * card. All three are one number and one guest.
 *
 * **This knowingly departs from `normaliseVehicleRegistration`.** That module
 * decides a plate's shape once, on the way in, and says why in as many words:
 * "never at the point of comparison, where a second copy of these rules would
 * drift from this one." The same move is not open here. `guest.phone` is
 * `text not null` holding exactly what somebody typed, prd.md §2 and §13 make
 * it a number the business *rings*, and rewriting it on the way in would be a
 * migration, a backfill of every existing booking, and a change to two forms —
 * a different slice, and one that loses the number as the guest gave it.
 *
 * So this normalises at the point of comparison, on **both** sides, and
 * `ForMatch` in the name is what says it is not a storage rule. Nothing writes
 * its output to a column.
 *
 * What it deliberately does NOT do is validate a Brunei format — the same
 * argument vehicle.ts makes about plates. prd.md states no phone format, the
 * column checks nothing beyond non-null, and a pattern that refuses a
 * legitimate number at a lookup form is worse than a permissive one.
 */

/**
 * Brunei's country code, and the only one that collapses.
 *
 * Local numbers appear in the same dataset spelled both ways, so the two
 * spellings have to meet. No other country code is inferred: `+65 9123 4567`
 * normalises to `6591234567` on both sides and therefore matches itself
 * without this module imposing an assumption about where the caller lives.
 */
const LOCAL_COUNTRY_CODE = '673'

/**
 * The length of a Brunei subscriber number, which is what makes the country
 * code safe to drop.
 *
 * `6731234` is seven digits and is a number in its own right, not `673`
 * followed by a subscriber number — so the prefix comes off only when there is
 * more than a whole number left behind it.
 */
const LOCAL_NUMBER_LENGTH = 7

/**
 * Below this, there is not enough of a number to be worth comparing.
 *
 * A floor rather than a format. The public booking forms accept anything from
 * five characters and the desk form has no floor at all, so a booking whose
 * phone is `--` or `+` is reachable — and two of those must never compare
 * equal to each other. Callers rely on this returning `null` for them.
 */
const MIN_COMPARABLE_DIGITS = 6

/**
 * The digits two people mean when they write the same number differently, or
 * `null` where there is not enough of a number to compare.
 *
 * **`null` is never equal to `null`.** Every caller has to refuse the pair
 * rather than pass it on, because a booking recorded with a junk phone number
 * would otherwise be openable by anyone typing junk. See `phonesMatch`, which
 * is the safe way to ask.
 */
export function normalisePhoneForMatch(raw: string): string | null {
  const digits = raw.trim().replace(/\D/g, '')

  // Leading zeros first, so `00673 8959798` reaches the country-code test as
  // `6738959798` rather than keeping an international prefix nobody dialled.
  const unpadded = stripLeadingZeros(digits)

  const local =
    unpadded.startsWith(LOCAL_COUNTRY_CODE) && unpadded.length > LOCAL_NUMBER_LENGTH
      ? stripLeadingZeros(unpadded.slice(LOCAL_COUNTRY_CODE.length))
      : unpadded

  return local.length >= MIN_COMPARABLE_DIGITS ? local : null
}

/**
 * Whether two numbers, however they are written, are the same number.
 *
 * The only sanctioned way to compare them. Deliberately not a suffix or
 * "close enough" match: a lookup that hands out a link to somebody's booking
 * must not widen its own guess space, and `+1 555 8959798` is not `8959798`.
 */
export function phonesMatch(a: string, b: string): boolean {
  const left = normalisePhoneForMatch(a)
  const right = normalisePhoneForMatch(b)

  return left !== null && right !== null && left === right
}

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, '')
}
