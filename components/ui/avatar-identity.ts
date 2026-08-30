/**
 * How a person becomes an avatar: the initials on the face, and the colour
 * under them (design.md §Components — Avatars).
 *
 * **Derived, never random.** The same person is the same colour on every
 * screen, in every session, on every device, for as long as the account
 * exists — which is the entire point. A colour that changed between renders
 * would be decoration; one that holds is a second way to recognise a name you
 * have already seen, under the initials that carry it.
 *
 * **Seeded by account id, not by name or email.** Both of those are editable:
 * seed on them and correcting a typo in someone's surname silently repaints
 * them. The id is the identity.
 *
 * The tones are ordered and the order is load bearing — an index into this
 * array is what a person's colour *is*, so hues may be appended but never
 * reordered or removed. Seven stops around the wheel, with teal the one
 * deliberate hole: teal is the customer's colour and the monochrome ops rule
 * keeps it off staff surfaces. The four hues the product spends on meaning are
 * sat *beside* rather than avoided — lime against positive's mint,
 * rose against negative's red — because the form
 * separates them anyway: an identity mark is a circle with two letters, a
 * status is a pill with a word. Avoiding those arcs outright is what a first
 * pass did, and it produced five near-identical blues.
 *
 * Collisions on a roster larger than seven are expected and fine — the initials
 * disambiguate; the colour only has to make a familiar face findable in a list.
 *
 * Written as whole class strings rather than composed from a hue name because
 * Tailwind scans source text for classes: `bg-avatar-${name}` generates
 * nothing at all.
 */
export const AVATAR_TONES = [
  'bg-avatar-sky text-avatar-sky-foreground',
  'bg-avatar-blue text-avatar-blue-foreground',
  'bg-avatar-violet text-avatar-violet-foreground',
  'bg-avatar-fuchsia text-avatar-fuchsia-foreground',
  'bg-avatar-rose text-avatar-rose-foreground',
  'bg-avatar-orange text-avatar-orange-foreground',
  'bg-avatar-lime text-avatar-lime-foreground',
] as const

/**
 * FNV-1a, 32-bit.
 *
 * Any stable string→number function would do, but the obvious one — summing
 * char codes — distributes terribly over the inputs this actually gets: UUIDs
 * share an alphabet and a length, so their sums cluster hard and most of the
 * roster lands on two of the five tones. FNV-1a avalanches, costs four lines,
 * and needs no dependency.
 *
 * `Math.imul` because the multiply overflows 32 bits every round and plain `*`
 * would silently drift into float territory, which is how "the same person"
 * stops being the same colour on a different engine.
 */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

/** The fill/text class pair for a person, from their account id. */
export function avatarTone(seed: string): string {
  return AVATAR_TONES[fnv1a(seed) % AVATAR_TONES.length]!
}

/** "Nur Amalina" → "NA"; a lone name keeps its first two letters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  const last = parts[parts.length - 1]

  if (!first) {
    return 'PV'
  }

  if (parts.length === 1 || !last) {
    return first.slice(0, 2).toUpperCase()
  }

  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}
