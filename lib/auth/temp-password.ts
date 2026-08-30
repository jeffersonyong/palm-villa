/**
 * Temporary-password generation for staff provisioning.
 *
 * Runs in the browser (the New staff / Reset password dialogs) via Web
 * Crypto. The shape is chosen for the handover, not for vault storage: an
 * admin reads it out loud or sends it on WhatsApp, and the staff member
 * types it once and replaces it — so it is grouped for reading, lowercase
 * for phone keyboards, and stripped of look-alike characters (i/l/1, o/0).
 *
 * Three groups of four over a 31-character alphabet is ~59 bits — far past
 * guessable for a password that should live for a day.
 */

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const GROUPS = 3
const GROUP_LENGTH = 4

/** Largest multiple of the alphabet size below 256, for rejection sampling. */
const UNBIASED_LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length

export function generateTempPassword(): string {
  const characters: string[] = []

  while (characters.length < GROUPS * GROUP_LENGTH) {
    const batch = new Uint8Array(GROUPS * GROUP_LENGTH)

    crypto.getRandomValues(batch)

    for (const byte of batch) {
      // Rejection sampling: bytes past the last full multiple of 31 would
      // favour the alphabet's start via modulo, so they are discarded.
      if (byte < UNBIASED_LIMIT && characters.length < GROUPS * GROUP_LENGTH) {
        characters.push(ALPHABET[byte % ALPHABET.length]!)
      }
    }
  }

  const groups: string[] = []

  for (let index = 0; index < GROUPS; index += 1) {
    groups.push(characters.slice(index * GROUP_LENGTH, (index + 1) * GROUP_LENGTH).join(''))
  }

  return groups.join('-')
}
