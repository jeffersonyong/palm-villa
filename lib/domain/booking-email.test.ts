import { describe, expect, test } from 'vitest'

import {
  buildBookingEmail,
  type BookingEmailKind,
  type BuildBookingEmailInput,
  type EmailBookingFacts,
  type EmailPropertyFacts,
} from './booking-email'
import type { PropertyContact } from './contact'
import { line } from './lines'
import { transferPlanFor } from './public-booking'

/**
 * What the two customer emails say.
 *
 * Mandatory coverage, for the reason the module's header gives: these
 * sentences reach a guest unreviewed, and the figure in them is the one they
 * will turn up at the desk expecting. The assertion that matters most is the
 * confirmed stay's — a booking secured by its deposit still owes the whole
 * stay, and a booking paid in full owes nothing, and the two differ by nothing
 * except `paid`.
 */

const TOKEN = 'Ab3xY9-_ZqRs7TuVwX2Kd0'

const contact: PropertyContact = {
  phones: [
    { display: '+673 0000001', whatsappUrl: 'https://wa.me/6730000001' },
    { display: '+673 0000002', whatsappUrl: 'https://wa.me/6730000002' },
  ],
  whatsappUrl: 'https://wa.me/6730000001',
  instagramHandle: '@test',
  instagramUrl: 'https://instagram.com/test',
  tiktokHandle: '@test',
  tiktokUrl: 'https://tiktok.com/@test',
  mapsUrl: 'https://maps.example/test',
}

const property = (overrides: Partial<EmailPropertyFacts> = {}): EmailPropertyFacts => ({
  name: 'Palm Villa',
  checkInTime: '14:00',
  checkOutTime: '12:00',
  bankAccounts: [
    { id: 'a', bankName: 'BIBD', accountNumber: '0011223344', sortOrder: 1 },
    { id: 'b', bankName: 'Baiduri', accountNumber: '5566778899', sortOrder: 2 },
  ],
  unitTypeName: 'Three-bedroom apartment',
  ...overrides,
})

const stay = (overrides: Partial<EmailBookingFacts> = {}): EmailBookingFacts => ({
  reference: 'PV-4821',
  stream: 'short_stay',
  status: 'held',
  guestName: 'Amin Hassan',
  guestEmail: 'amin@example.com',
  accessToken: TOKEN,
  vehicles: ['BAA 1234'],
  noVehicle: false,
  chargeableGuests: 4,
  exemptGuests: 1,
  stay: { unitTypeId: 'three-bedroom', range: { start: '2026-09-14', end: '2026-09-16' } },
  dayPass: null,
  lines: [line('accommodation', '2 nights at BND 200.00', 2, 20_000)],
  total: 40_000,
  paid: 0,
  securityDeposit: 10_000,
  ...overrides,
})

const dayPass = (overrides: Partial<EmailBookingFacts> = {}): EmailBookingFacts => ({
  ...stay(),
  reference: 'PV-4822',
  stream: 'day_pass',
  stay: null,
  dayPass: { date: '2026-09-20', headcount: 3 },
  lines: [line('day_pass_bundle', 'Family bundle', 1, 2_000)],
  total: 2_000,
  securityDeposit: 0,
  ...overrides,
})

const build = (
  kind: BookingEmailKind,
  booking: EmailBookingFacts,
  overrides: Partial<BuildBookingEmailInput> = {},
) =>
  buildBookingEmail({
    kind,
    booking,
    property: property(),
    contact,
    bookingUrl: booking.accessToken === null ? null : `https://palmvilla.bn/booking/${TOKEN}`,
    findBookingUrl: 'https://palmvilla.bn/find-booking',
    ...overrides,
  })

const built = (kind: BookingEmailKind, booking: EmailBookingFacts) => {
  const result = build(kind, booking)

  if (!result.ok) {
    throw new Error(`Expected an email, got a refusal: ${result.reason}`)
  }

  return result.model
}

describe('what is sent, and what is not', () => {
  test('a booking with no email address sends nothing', () => {
    expect(build('booking_created', stay({ guestEmail: null }))).toEqual({
      ok: false,
      reason: 'no_address',
    })
  })

  test('an address that cannot be one sends nothing', () => {
    expect(build('booking_created', stay({ guestEmail: 'amin@example.com, other@x.com' }))).toEqual(
      { ok: false, reason: 'no_address' },
    )
  })

  test('a cancelled booking sends nothing', () => {
    expect(build('booking_confirmed', stay({ status: 'cancelled' }))).toEqual({
      ok: false,
      reason: 'closed',
    })
  })

  test('a confirmation is refused for a booking that is not confirmed', () => {
    expect(build('booking_confirmed', stay({ status: 'held' }))).toEqual({
      ok: false,
      reason: 'stage_moved',
    })
  })

  test('transfer instructions are refused once the booking is already confirmed', () => {
    expect(build('booking_created', stay({ status: 'confirmed' }))).toEqual({
      ok: false,
      reason: 'stage_moved',
    })
  })

  test('a guest who pressed "I have made the transfer" still gets their instructions', () => {
    expect(build('booking_created', stay({ status: 'awaiting_payment_verification' })).ok).toBe(
      true,
    )
  })
})

describe('the created email', () => {
  test('names the booking in the subject', () => {
    expect(built('booking_created', stay()).subject).toContain('PV-4821')
  })

  test('offers both amounts, and they are the two the page offers', () => {
    const booking = stay()
    const model = built('booking_created', booking)

    expect(model.transfer?.options.map((option) => option.amount)).toEqual([
      transferPlanFor(booking, 'deposit_only').total,
      transferPlanFor(booking, 'everything').total,
    ])
  })

  test('says what to put as the transfer reference, and that the unit is held meanwhile', () => {
    const instruction = built('booking_created', stay()).transfer?.instruction ?? ''

    expect(instruction).toContain('PV-4821 as the transfer reference')
    expect(instruction).toContain('held for you in the meantime')
    // N7: no deadline is stated, because none is enforced.
    expect(instruction).not.toMatch(/within|hour|expire|deadline|time limit/i)
  })

  test('carries both bank accounts', () => {
    expect(built('booking_created', stay()).transfer?.accounts).toEqual([
      { label: 'BIBD', value: '0011223344' },
      { label: 'Baiduri', value: '5566778899' },
    ])
  })

  test('tells the guest to call when no account is configured', () => {
    const model = built('booking_created', stay())
    const result = build('booking_created', stay(), {
      property: property({ bankAccounts: [] }),
    })

    expect(model.transfer?.noAccountsNote).toBeNull()
    expect(result.ok && result.model.transfer?.noAccountsNote).toContain('call us')
  })

  test('states the deposit separately from the price', () => {
    const model = built('booking_created', stay())

    expect(model.quote?.totalDisplay).toBe('BND 400.00')
    expect(model.depositNote).toContain('BND 100.00')
  })

  test('names the unit type, never the door', () => {
    const facts = built('booking_created', stay()).facts

    expect(facts).toContainEqual({ label: 'Unit', value: 'Three-bedroom apartment' })
    expect(facts).toContainEqual({ label: 'Dates', value: '14 – 16 Sept 2026 · 2 nights' })
  })
})

describe('a day pass differs from a stay', () => {
  test('offers one amount and no deposit', () => {
    const model = built('booking_created', dayPass())

    expect(model.transfer?.options).toHaveLength(1)
    expect(model.transfer?.options[0]?.amount).toBe(2_000)
    expect(model.depositNote).toBeNull()
  })

  test('carries a date and a headcount, and no unit or nights', () => {
    const facts = built('booking_created', dayPass()).facts

    expect(facts).toContainEqual({ label: 'Day pass', value: 'Sun 20 Sept' })
    expect(facts).toContainEqual({ label: 'Guests', value: '3 people' })
    expect(facts.map((row) => row.label)).not.toContain('Unit')
    expect(facts.map((row) => row.label)).not.toContain('Dates')
  })

  test('is confirmed by being shown at the gate', () => {
    const model = built('booking_confirmed', dayPass({ status: 'confirmed' }))

    expect(model.arrival).toEqual(['Show reference PV-4822 at the gate.'])
  })
})

describe('the confirmed email, and the money it states', () => {
  test('a deposit-secured booking still owes the whole stay', () => {
    const model = built('booking_confirmed', stay({ status: 'confirmed', paid: 0 }))

    expect(model.arrival).toContain('BND 400.00 for the stay is settled when you arrive.')
    expect(model.arrival.join(' ')).toContain('BND 100.00 security deposit is with us')
  })

  test('a booking paid in full owes nothing, and does not repeat the total', () => {
    const model = built('booking_confirmed', stay({ status: 'confirmed', paid: 40_000 }))

    expect(model.arrival).toContain('Everything is settled — there is nothing to pay on arrival.')
    expect(model.arrival.join(' ')).not.toContain('settled when you arrive')
  })

  test('a part-paid booking states what is left, not the total', () => {
    const model = built('booking_confirmed', stay({ status: 'confirmed', paid: 15_000 }))

    expect(model.arrival).toContain('BND 250.00 for the stay is settled when you arrive.')
  })

  test('states the check-in and check-out times', () => {
    const model = built('booking_confirmed', stay({ status: 'confirmed' }))

    expect(model.arrival).toContain('Check in from 14:00, and check out by 12:00.')
  })

  test('asks for nothing', () => {
    expect(built('booking_confirmed', stay({ status: 'confirmed' })).transfer).toBeNull()
  })

  test('a booking that is under way still reads as confirmed', () => {
    expect(build('booking_confirmed', stay({ status: 'checked_in' })).ok).toBe(true)
  })
})

describe('the link back', () => {
  test('is offered when the booking has one', () => {
    const model = built('booking_created', stay())

    expect(model.action?.url).toBe(`https://palmvilla.bn/booking/${TOKEN}`)
    expect(model.action?.note).toContain('do not post it publicly')
  })

  test('is absent for a booking taken at the desk, and never built out of null', () => {
    const model = built('booking_confirmed', stay({ status: 'confirmed', accessToken: null }))

    expect(model.action).toBeNull()
    expect(JSON.stringify(model)).not.toContain('/booking/')
    expect(model.reference).toBe('PV-4821')
  })
})

describe('whose turn it is', () => {
  test('a created booking is marked as waiting on the guest', () => {
    expect(built('booking_created', stay()).status).toEqual({
      tone: 'waiting',
      label: 'Waiting for your transfer',
    })
  })

  test('a confirmed booking is marked done', () => {
    expect(built('booking_confirmed', stay({ status: 'confirmed' })).status).toEqual({
      tone: 'confirmed',
      label: 'Confirmed',
    })
  })
})

describe('where the money goes', () => {
  const oneAccount = [{ id: 'a', bankName: 'BIBD', accountNumber: '0011223344', sortOrder: 1 }]

  test('two accounts are introduced as alternatives, not as two things to do', () => {
    expect(built('booking_created', stay()).transfer?.accountsIntro).toBe(
      'Send it to either of these accounts:',
    )
  })

  test('one account is introduced as the account', () => {
    const result = build('booking_created', stay(), {
      property: property({ bankAccounts: oneAccount }),
    })

    expect(result.ok && result.model.transfer?.accountsIntro).toBe('Send it to this account:')
  })

  test('no account has nothing to introduce', () => {
    const result = build('booking_created', stay(), { property: property({ bankAccounts: [] }) })

    expect(result.ok && result.model.transfer?.accountsIntro).toBeNull()
  })
})

describe('what the emails never say', () => {
  const everyModel = [
    built('booking_created', stay()),
    built('booking_created', dayPass()),
    built('booking_confirmed', stay({ status: 'confirmed' })),
    built('booking_confirmed', dayPass({ status: 'confirmed' })),
  ]

  test('never mentions a QR code, because none is issued yet', () => {
    for (const model of everyModel) {
      expect(JSON.stringify(model)).not.toContain('QR')
    }
  })

  test('promises only this one email, as the booking form does', () => {
    for (const model of everyModel) {
      expect(model.footer.notes).toContain('This is the only email we send about this booking.')
      expect(model.footer.phones).toEqual(['+673 0000001', '+673 0000002'])
    }
  })
})
