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

/**
 * A number split into the country code somebody chose and the rest they typed.
 *
 * `dialCode` is `null` where the number carries no country code at all, which
 * is most of the existing data: a walk-in taken at the desk is `8959798`, and
 * that is a Brunei number the moment you know where you are standing. The
 * caller decides what to show for it — the phone control shows Brunei — and
 * this module refuses to make that assumption on its behalf, for the same
 * reason `normalisePhoneForMatch` assumes no country code but the local one.
 */
export interface SplitPhone {
  /** The dial code without its `+`, or `null` where the number carried none. */
  dialCode: string | null
  /** Everything after the country code, exactly as it was written. */
  nationalNumber: string
}

/**
 * The international prefix dialled instead of a `+`, and the only one that is
 * unambiguous enough to unwrap. `00673 8959798` is `+673 8959798` written by
 * somebody's phone rather than a national number beginning with two zeros.
 */
const INTERNATIONAL_PREFIX = '00'

/** The longest dial code in the list, which bounds the search below. */
const MAX_DIAL_CODE_LENGTH = 4

/**
 * Reads a stored number back into the two halves a phone control shows.
 *
 * The inverse of `composePhoneNumber` for anything this product wrote, and a
 * best effort for everything else — which is the whole existing table, typed
 * by hand into a plain field for as long as there has been one. It never
 * *invents* a country code: a number with no `+` comes back with `dialCode:
 * null` and the digits untouched, so a control can show Brunei beside it
 * without that guess being written down anywhere.
 */
export function splitPhoneNumber(raw: string, dialCodes: Iterable<string>): SplitPhone {
  const trimmed = raw.trim()

  const international = trimmed.startsWith('+')
    ? trimmed.slice(1)
    : trimmed.startsWith(INTERNATIONAL_PREFIX)
      ? trimmed.slice(INTERNATIONAL_PREFIX.length)
      : null

  if (international === null) return { dialCode: null, nationalNumber: trimmed }

  const known = new Set(dialCodes)
  const digits = international.replace(/\D/g, '')

  // Longest first: `+1868` is Trinidad, not the United States followed by a
  // subscriber number starting 868.
  for (let length = MAX_DIAL_CODE_LENGTH; length >= 1; length -= 1) {
    const candidate = digits.slice(0, length)

    if (!known.has(candidate)) continue

    return {
      dialCode: candidate,
      nationalNumber: remainderAfterDialCode(international, candidate),
    }
  }

  return { dialCode: null, nationalNumber: trimmed }
}

/**
 * The number as it will be stored: the chosen code, a space, and what was
 * typed beside it.
 *
 * **An empty national number composes to an empty string, never to a bare
 * `+673`.** A country code on its own is not a phone number, and a field left
 * blank has to reach the server blank so the schema that requires it can say
 * so — a `+673` would pass every length check and reach the desk as a number
 * nobody can ring.
 */
export function composePhoneNumber(dialCode: string, nationalNumber: string): string {
  const national = nationalNumber.trim()

  return national.length === 0 ? '' : `+${dialCode} ${national}`
}

/**
 * Walks the original string — spacing and punctuation intact — past however
 * many digits the dial code took, so `+44 20 7946 0958` keeps its `20 7946
 * 0958` rather than coming back as `2079460958`.
 *
 * The separator *between* the two halves goes with the code, though. It was
 * punctuation joining them, and `+673-895-9798` split down the middle leaves a
 * national number of `-895-9798` — which recomposes to `+673 -895-9798` and
 * reads, correctly, as broken.
 */
function remainderAfterDialCode(international: string, dialCode: string): string {
  let seen = 0

  for (let index = 0; index < international.length; index += 1) {
    if (seen === dialCode.length) return stripLeadingSeparators(international.slice(index))
    if (/\d/.test(international[index] ?? '')) seen += 1
  }

  return ''
}

function stripLeadingSeparators(value: string): string {
  return value.replace(/^[\s\-.)\/]+/, '').trim()
}
