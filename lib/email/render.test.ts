import { describe, expect, test } from 'vitest'

import {
  buildBookingEmail,
  type BookingEmailKind,
  type BookingEmailModel,
} from '@/lib/domain/booking-email'
import type { PropertyContact } from '@/lib/domain/contact'
import { line } from '@/lib/domain/lines'
import type { BankAccountSettings } from '@/lib/domain/settings'

import { renderBookingEmail } from './render'

/**
 * The markup, as against the words.
 *
 * The wording is `lib/domain/booking-email.test.ts`'s job; this asserts what
 * that file cannot see. That the palette is still design.md's — the whitelist
 * below is the guard that catches a colour typed in by hand. That a guest's
 * name cannot break the page it is rendered into, which is the one real
 * injection surface in the slice. That the status a guest is shown is drawn
 * in the status hue and nothing else is. And that the plain-text alternative
 * carries every figure the HTML does, because a client that refuses HTML shows
 * only that.
 */

/** design.md's light theme, plus its two status hues and their oklab tints. */
const PALETTE = new Set([
  '#111111',
  '#6b6b6b',
  '#ffffff',
  '#f3f3f3',
  '#e8e8e8',
  '#0e6b64',
  '#d97706',
  '#92400e',
  '#fdf2ea',
  '#fcece1',
  '#1fa552',
  '#166534',
  '#ecf6ed',
])

const AMBER_TINTS = ['#fdf2ea', '#fcece1']
const GREEN_TINTS = ['#ecf6ed']

const contact: PropertyContact = {
  phones: [{ display: '+673 0000001', whatsappUrl: 'https://wa.me/6730000001' }],
  whatsappUrl: 'https://wa.me/6730000001',
  instagramHandle: '@test',
  instagramUrl: 'https://instagram.com/test',
  tiktokHandle: '@test',
  tiktokUrl: 'https://tiktok.com/@test',
  mapsUrl: 'https://maps.example/test',
}

const TOKEN = 'Ab3xY9-_ZqRs7TuVwX2Kd0'
const URL = `https://palmvilla.bn/booking/${TOKEN}`
const LOOKUP_URL = 'https://palmvilla.bn/find-booking'

const TWO_ACCOUNTS: readonly BankAccountSettings[] = [
  { id: 'a', bankName: 'BIBD', accountNumber: '0011223344', sortOrder: 1 },
  { id: 'b', bankName: 'Baiduri', accountNumber: '5566778899', sortOrder: 2 },
]

function model(
  overrides: {
    kind?: BookingEmailKind
    guestName?: string
    lineDescription?: string
    accounts?: readonly BankAccountSettings[]
  } = {},
): BookingEmailModel {
  const kind = overrides.kind ?? 'booking_created'

  const result = buildBookingEmail({
    kind,
    booking: {
      reference: 'PV-4821',
      stream: 'short_stay',
      status: kind === 'booking_created' ? 'held' : 'confirmed',
      guestName: overrides.guestName ?? 'Amin Hassan',
      guestEmail: 'amin@example.com',
      accessToken: TOKEN,
      vehicles: ['BAA 1234'],
      noVehicle: false,
      chargeableGuests: 4,
      exemptGuests: 0,
      stay: { unitTypeId: 'three-bedroom', range: { start: '2026-09-14', end: '2026-09-16' } },
      dayPass: null,
      lines: [
        line('accommodation', overrides.lineDescription ?? '2 nights at BND 200.00', 2, 20_000),
      ],
      total: 40_000,
      paid: 0,
      securityDeposit: 10_000,
    },
    property: {
      name: 'Palm Villa',
      checkInTime: '14:00',
      checkOutTime: '12:00',
      bankAccounts: overrides.accounts ?? TWO_ACCOUNTS,
      unitTypeName: 'Three-bedroom apartment',
    },
    contact,
    bookingUrl: URL,
    findBookingUrl: LOOKUP_URL,
  })

  if (!result.ok) {
    throw new Error(`Expected an email, got ${result.reason}`)
  }

  return result.model
}

const hexesIn = (html: string): string[] =>
  (html.match(/#[0-9a-fA-F]{3,8}/g) ?? []).map((colour) => colour.toLowerCase())

describe('the palette stays design.md’s', () => {
  test('every colour in the markup is a light-theme token or a status tint', () => {
    for (const kind of ['booking_created', 'booking_confirmed'] as const) {
      const used = hexesIn(renderBookingEmail(model({ kind })).html)

      expect(used.length).toBeGreaterThan(0)

      for (const colour of used) {
        expect(PALETTE, `${kind} uses ${colour}`).toContain(colour)
      }
    }
  })

  test('uses no CSS an email client cannot read', () => {
    const { html } = renderBookingEmail(model())

    expect(html).not.toContain('var(--')
    expect(html).not.toContain('color-mix(')
    expect(html).not.toContain('class=')
  })

  test('declares the light scheme, so a client does not invent a dark one', () => {
    expect(renderBookingEmail(model()).html).toContain('color-scheme:light')
  })

  test('fills the one button with the brand, and puts white on it', () => {
    const { html } = renderBookingEmail(model())

    expect(html).toContain('background-color:#0e6b64')
    expect(html).toContain('color:#ffffff')
  })
})

describe('the status a guest is shown', () => {
  test('a created booking wears amber, and says the guest is up', () => {
    const { html } = renderBookingEmail(model({ kind: 'booking_created' }))

    expect(html).toContain('Waiting for your transfer')
    expect(html).toContain('#92400e')
    for (const tint of GREEN_TINTS) {
      expect(html).not.toContain(tint)
    }
  })

  test('a confirmed booking wears green, with a tick', () => {
    const { html } = renderBookingEmail(model({ kind: 'booking_confirmed' }))

    expect(html).toContain('✓')
    expect(html).toContain('Confirmed')
    expect(html).toContain('#166534')
    for (const tint of AMBER_TINTS) {
      expect(html).not.toContain(tint)
    }
  })

  test('the pay panel shares the waiting amber, so status and action are one message', () => {
    const { html } = renderBookingEmail(model({ kind: 'booking_created' }))

    expect(html).toContain('background-color:#fcece1')
  })

  test('the mark is a text glyph, never an emoji or an image', () => {
    const { html } = renderBookingEmail(model({ kind: 'booking_created' }))

    expect(html).toContain('●')
    expect(html).not.toContain('⏳')
    expect(html).not.toContain('<img')
  })
})

describe('where the money goes', () => {
  test('two accounts are joined by an "or", not stacked as two jobs', () => {
    const { html, text } = renderBookingEmail(model())

    expect(html).toContain('either of these accounts')
    expect(html).toContain('>or</td>')
    expect(text).toContain('either of these accounts')
    expect(text).toContain('BIBD: 0011223344\n  -------- or --------\n  Baiduri: 5566778899')
  })

  test('one account has no "or"', () => {
    const { html, text } = renderBookingEmail(model({ accounts: [TWO_ACCOUNTS[0]!] }))

    expect(html).toContain('this account')
    expect(html).not.toContain('>or</td>')
    expect(text).not.toContain('-------- or --------')
  })

  test('the number is set in a monospace face, since it is what gets copied', () => {
    const { html } = renderBookingEmail(model())

    expect(html).toMatch(/font-family:ui-monospace[^"]*">0011223344</)
  })
})

describe('what a guest types cannot break the email', () => {
  test('escapes a name carrying markup', () => {
    const { html } = renderBookingEmail(model({ guestName: 'Tan & Sons <boss>' }))

    expect(html).toContain('Tan &amp; Sons &lt;boss&gt;')
    expect(html).not.toContain('<boss>')
  })

  test('escapes a line description carrying markup', () => {
    const { html } = renderBookingEmail(
      model({ lineDescription: '2 nights <script>alert(1)</script>' }),
    )

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('leaves the plain-text body unescaped, because it is not markup', () => {
    const { text } = renderBookingEmail(model({ guestName: 'Tan & Sons <boss>' }))

    expect(text).toContain('Tan & Sons <boss>')
    expect(text).not.toContain('&amp;')
  })
})

describe('the link', () => {
  test('is the model’s url, and is restated as readable text', () => {
    const { html } = renderBookingEmail(model())

    expect(html).toContain(`href="${URL}"`)
    // Once in the href, once as the visible line a guest can copy.
    expect(html.split(URL)).toHaveLength(3)
  })
})

/**
 * Capability A9's half of the email. The private link above it only works
 * while the guest still has this message; this is the route that survives
 * losing it, and the only one a desk booking ever had.
 */
describe('the way back into a booking', () => {
  test('the footer links the lookup page on both emails', () => {
    for (const kind of ['booking_created', 'booking_confirmed'] as const) {
      const { html } = renderBookingEmail(model({ kind }))

      expect(html, kind).toContain(`href="${LOOKUP_URL}"`)
      expect(html, kind).toContain('Find your booking')
      expect(html, kind).toContain('reference and phone number')
    }
  })

  /**
   * The booking with no `action` block at all — taken at the desk, no token,
   * no private link. The footer line is the whole of its way back, so it has
   * to be there when the link above it is not.
   */
  test('is present even when there is no private link to lose', () => {
    const withoutLink = renderBookingEmail({
      ...model(),
      action: null,
      footer: { ...model().footer, lookup: { label: 'Lost this email?', url: LOOKUP_URL } },
    })

    expect(withoutLink.html).toContain(LOOKUP_URL)
    expect(withoutLink.text).toContain(LOOKUP_URL)
  })

  test('is dropped rather than half-written when the origin is unreadable', () => {
    const built = model()
    const { html, text } = renderBookingEmail({
      ...built,
      footer: { ...built.footer, lookup: null },
    })

    expect(html).not.toContain('find-booking')
    expect(text).not.toContain('find-booking')
    // The rest of the footer is untouched.
    expect(html).toContain('Call or WhatsApp us on')
  })
})

describe('the plain-text alternative', () => {
  test('carries every figure the markup carries', () => {
    const { text } = renderBookingEmail(model())

    for (const figure of ['PV-4821', 'BND 400.00', 'BND 100.00', 'BND 500.00', '0011223344']) {
      expect(text).toContain(figure)
    }
  })

  test('carries the status, the link and the warning that goes with it', () => {
    const { text } = renderBookingEmail(model())

    expect(text).toContain('Status: Waiting for your transfer')
    expect(text).toContain(URL)
    expect(text).toContain('do not post it publicly')
  })

  test('is text, not markup', () => {
    expect(renderBookingEmail(model()).text).not.toContain('<')
  })

  test('carries the lookup page as a URL somebody can type', () => {
    const { text } = renderBookingEmail(model())

    expect(text).toContain(`reference and phone number: ${LOOKUP_URL}`)
  })
})
