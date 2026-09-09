import { describe, expect, test } from 'vitest'

import { buildBookingEmail, type BookingEmailModel } from '@/lib/domain/booking-email'
import type { PropertyContact } from '@/lib/domain/contact'
import { line } from '@/lib/domain/lines'

import { renderBookingEmail } from './render'

/**
 * The markup, as against the words.
 *
 * The wording is `lib/domain/booking-email.test.ts`'s job; this asserts three
 * things that file cannot see. That the palette is still design.md's — the
 * whitelist below is the guard that catches a colour typed in by hand. That a
 * guest's name cannot break the page it is rendered into, which is the one
 * real injection surface in the slice. And that the plain-text alternative
 * carries every figure the HTML does, because a client that refuses HTML shows
 * only that.
 */

/** design.md's light theme. Any other colour in the output is a bug. */
const PALETTE = new Set([
  '#111111',
  '#6b6b6b',
  '#ffffff',
  '#f3f3f3',
  '#f7f7f7',
  '#e8e8e8',
  '#0e6b64',
])

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

function model(
  guestName = 'Amin Hassan',
  lineDescription = '2 nights at BND 200.00',
): BookingEmailModel {
  const result = buildBookingEmail({
    kind: 'booking_created',
    booking: {
      reference: 'PV-4821',
      stream: 'short_stay',
      status: 'held',
      guestName,
      guestEmail: 'amin@example.com',
      accessToken: TOKEN,
      vehicles: ['BAA 1234'],
      noVehicle: false,
      chargeableGuests: 4,
      exemptGuests: 0,
      stay: { unitTypeId: 'three-bedroom', range: { start: '2026-09-14', end: '2026-09-16' } },
      dayPass: null,
      lines: [line('accommodation', lineDescription, 2, 20_000)],
      total: 40_000,
      paid: 0,
      securityDeposit: 10_000,
    },
    property: {
      name: 'Palm Villa',
      checkInTime: '14:00',
      checkOutTime: '12:00',
      bankAccounts: [{ id: 'a', bankName: 'BIBD', accountNumber: '0011223344', sortOrder: 1 }],
      unitTypeName: 'Three-bedroom apartment',
    },
    contact,
    bookingUrl: URL,
  })

  if (!result.ok) {
    throw new Error(`Expected an email, got ${result.reason}`)
  }

  return result.model
}

describe('the palette stays design.md’s', () => {
  test('every colour in the markup is a light-theme token', () => {
    const { html } = renderBookingEmail(model())
    const used = html.match(/#[0-9a-fA-F]{3,8}/g) ?? []

    expect(used.length).toBeGreaterThan(0)

    for (const colour of used) {
      expect(PALETTE).toContain(colour.toLowerCase())
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

describe('what a guest types cannot break the email', () => {
  test('escapes a name carrying markup', () => {
    const { html } = renderBookingEmail(model('Tan & Sons <boss>'))

    expect(html).toContain('Tan &amp; Sons &lt;boss&gt;')
    expect(html).not.toContain('<boss>')
  })

  test('escapes a line description carrying markup', () => {
    const { html } = renderBookingEmail(model('Amin Hassan', '2 nights <script>alert(1)</script>'))

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('leaves the plain-text body unescaped, because it is not markup', () => {
    const { text } = renderBookingEmail(model('Tan & Sons <boss>'))

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

describe('the plain-text alternative', () => {
  test('carries every figure the markup carries', () => {
    const { text } = renderBookingEmail(model())

    for (const figure of ['PV-4821', 'BND 400.00', 'BND 100.00', 'BND 500.00', '0011223344']) {
      expect(text).toContain(figure)
    }
  })

  test('carries the link and the warning that goes with it', () => {
    const { text } = renderBookingEmail(model())

    expect(text).toContain(URL)
    expect(text).toContain('do not post it publicly')
  })

  test('is text, not markup', () => {
    expect(renderBookingEmail(model()).text).not.toContain('<')
  })
})
