import { balanceOf } from './balance'
import type { BookingStatus } from './booking-state'
import type { PropertyContact } from './contact'
import { formatStayDate, formatStayRange, nightsBetween, type StayDate } from './dates'
import type { BookingLine } from './lines'
import { formatCents, type Cents } from './money'
import { isLikelyEmailAddress, publicStageOf, transferPlanFor } from './public-booking'
import type { BankAccountSettings } from './settings'
import type { BookingStream } from './stream'

/**
 * What each of the two customer emails says (capability A8, architecture.md §9).
 *
 * The `lib/domain/pack.ts` seat, applied to a second medium: the decisions are
 * pure and tested here, and `lib/email/render.ts` draws whatever this returns
 * without deciding anything. That split is what lets the wording of a figure
 * be asserted by inspection while the markup is asserted separately.
 *
 * ── The emails are the page, not a second product ──────────────────────────
 *
 * Every sentence here is one `/booking/{token}` already says, in the same
 * words. Two customer surfaces describing one booking differently is how a
 * guest ends up ringing the desk to ask which is true — so where the page has
 * a sentence, this reuses it, and where the page derives a figure, this calls
 * the same function. In particular what is owed on arrival comes from
 * `balanceOf`, never from `total`: a guest who chose to send everything owes
 * nothing, and telling them otherwise is the one mistake that would cost the
 * desk a phone call per booking.
 *
 * ── No QR ──────────────────────────────────────────────────────────────────
 *
 * A8 promises a confirmation *and* an entry QR code; this is the first half.
 * Nothing here mentions a code, because nothing can read one yet — check-in
 * authority is open (N11) and no code has been issued. An email promising an
 * attachment it does not carry is worse than one that says what to show.
 */

export type BookingEmailKind = 'booking_created' | 'booking_confirmed'

/**
 * Why an email is not sent. None of these is an error: each is a booking that
 * has moved on, or one that never had an address.
 */
export type BookingEmailRefusal = 'no_address' | 'closed' | 'stage_moved'

/**
 * The facts an email needs, shaped so `lib/db`'s `Booking` satisfies it as it
 * is — the same structural trick `PackBookingFacts` uses, so the model can be
 * tested with a literal and used with a row.
 */
export interface EmailBookingFacts {
  reference: string
  stream: BookingStream
  status: BookingStatus
  guestName: string
  guestEmail: string | null
  accessToken: string | null
  vehicles: readonly string[]
  noVehicle: boolean
  chargeableGuests: number
  exemptGuests: number
  stay: { unitTypeId: string; range: { start: StayDate; end: StayDate } } | null
  dayPass: { date: StayDate; headcount: number } | null
  lines: readonly BookingLine[]
  total: Cents
  paid: Cents
  securityDeposit: Cents
}

export interface EmailPropertyFacts {
  name: string
  /** `HH:MM`, 24-hour, from the property's policy settings. */
  checkInTime: string
  checkOutTime: string
  bankAccounts: readonly BankAccountSettings[]
  /**
   * The unit *type*'s name, resolved by the caller from the settings.
   *
   * The type, never the door: N36 records that the system assigns a unit and
   * the desk may move it, so naming one in an email is a promise about a
   * specific room nobody made.
   */
  unitTypeName: string | null
}

export interface BuildBookingEmailInput {
  kind: BookingEmailKind
  booking: EmailBookingFacts
  property: EmailPropertyFacts
  contact: PropertyContact
  /** Absolute and already validated, or null where the booking has no token. */
  bookingUrl: string | null
}

export interface EmailRow {
  label: string
  value: string
}

export interface EmailQuote {
  rows: readonly EmailRow[]
  totalLabel: string
  totalDisplay: string
}

export interface EmailAmountOption {
  label: string
  /** The figure itself, so a test can assert it against `transferPlanFor`. */
  amount: Cents
  detail: string
}

export interface EmailTransfer {
  options: readonly EmailAmountOption[]
  reference: string
  /** Bank name against account number. Empty when none is configured. */
  accounts: readonly EmailRow[]
  noAccountsNote: string | null
  instruction: string
}

export interface EmailAction {
  label: string
  url: string
  note: string
}

export interface EmailFooter {
  propertyName: string
  phones: readonly string[]
  notes: readonly string[]
}

export interface BookingEmailModel {
  kind: BookingEmailKind
  subject: string
  /** The hidden line a client shows beside the subject. */
  preheader: string
  headline: string
  intro: string
  reference: string
  facts: readonly EmailRow[]
  quote: EmailQuote | null
  depositNote: string | null
  /** Present on a created email only — the confirmed one asks for nothing. */
  transfer: EmailTransfer | null
  /** Present on a confirmed email only. One sentence per line. */
  arrival: readonly string[]
  action: EmailAction | null
  footer: EmailFooter
}

export type BuildBookingEmailResult =
  { ok: true; model: BookingEmailModel } | { ok: false; reason: BookingEmailRefusal }

const LINK_NOTE = 'Anyone with this link can see this booking, so do not post it publicly.'

const ONLY_EMAIL_NOTE = 'This is the only email we send about this booking.'

/**
 * The page's own sentence about the hold, minus its amount.
 *
 * N7: the hold is indefinite by the client's decision, so nothing here states
 * a deadline. prd.md §9.3 spells out why — a timer the system does not enforce
 * is a promise it does not keep.
 */
const HOLD_SENTENCE =
  'Your unit is held until we confirm the transfer — there is no time limit, but the sooner you send it the sooner it is confirmed.'

export function buildBookingEmail(input: BuildBookingEmailInput): BuildBookingEmailResult {
  const { booking, property, contact, kind } = input

  if (booking.guestEmail === null || !isLikelyEmailAddress(booking.guestEmail)) {
    return { ok: false, reason: 'no_address' }
  }

  const stage = publicStageOf(booking.status)

  if (stage === 'closed') {
    return { ok: false, reason: 'closed' }
  }

  // Each email describes one moment. `after()` runs a second or two later and
  // reads committed state, so a booking somebody confirmed or cancelled in
  // between is described as it now is — which is why the stage is checked
  // here rather than assumed from the trigger.
  const expected = kind === 'booking_created' ? stage !== 'confirmed' : stage === 'confirmed'

  if (!expected) {
    return { ok: false, reason: 'stage_moved' }
  }

  const isDayPass = booking.dayPass !== null
  const action = actionFor(input.bookingUrl)

  return {
    ok: true,
    model: {
      kind,
      subject: subjectFor(kind, booking, isDayPass),
      preheader: preheaderFor(kind, booking, isDayPass),
      headline: kind === 'booking_created' ? 'Almost done' : 'You are booked',
      intro: introFor(kind, isDayPass),
      reference: booking.reference,
      facts: factsFor(booking, property, isDayPass),
      quote: quoteFor(booking),
      depositNote: depositNoteFor(kind, booking),
      transfer: kind === 'booking_created' ? transferFor(booking, property) : null,
      arrival: kind === 'booking_confirmed' ? arrivalFor(booking, property, isDayPass) : [],
      action,
      footer: {
        propertyName: property.name,
        phones: contact.phones.map((phone) => phone.display),
        notes: [ONLY_EMAIL_NOTE],
      },
    },
  }
}

function subjectFor(
  kind: BookingEmailKind,
  booking: EmailBookingFacts,
  isDayPass: boolean,
): string {
  if (kind === 'booking_confirmed') {
    return `You are booked — Palm Villa ${booking.reference}`
  }

  return isDayPass
    ? `Almost done — your Palm Villa day pass ${booking.reference}`
    : `Almost done — your Palm Villa booking ${booking.reference}`
}

function preheaderFor(
  kind: BookingEmailKind,
  booking: EmailBookingFacts,
  isDayPass: boolean,
): string {
  const when = whenOf(booking, isDayPass)

  if (kind === 'booking_confirmed') {
    return when === null ? booking.reference : `${booking.reference} · ${when}`
  }

  const plan = transferPlanFor(booking)

  return `${booking.reference} · BND ${formatCents(plan.total)} to secure it`
}

/** The date a booking is about, or null for the shape that has neither. */
function whenOf(booking: EmailBookingFacts, isDayPass: boolean): string | null {
  if (isDayPass && booking.dayPass) {
    return formatStayDate(booking.dayPass.date)
  }

  if (booking.stay) {
    return formatStayRange(booking.stay.range.start, booking.stay.range.end)
  }

  return null
}

function introFor(kind: BookingEmailKind, isDayPass: boolean): string {
  if (kind === 'booking_confirmed') {
    return 'Your booking is confirmed.'
  }

  return isDayPass
    ? 'We have your booking. Send the transfer below and we will confirm your pass.'
    : 'We have your booking. The unit is held for you — send the transfer below and we will confirm it.'
}

function factsFor(
  booking: EmailBookingFacts,
  property: EmailPropertyFacts,
  isDayPass: boolean,
): readonly EmailRow[] {
  const rows: EmailRow[] = []

  if (isDayPass && booking.dayPass) {
    rows.push({ label: 'Day pass', value: formatStayDate(booking.dayPass.date) })
    rows.push({ label: 'Guests', value: `${booking.dayPass.headcount} people` })
  } else if (booking.stay) {
    const { start, end } = booking.stay.range

    rows.push({ label: 'Unit', value: property.unitTypeName ?? 'To be assigned' })
    rows.push({
      label: 'Dates',
      value: `${formatStayRange(start, end)} · ${nightsBetween(start, end)} nights`,
    })
    rows.push({ label: 'Guests', value: guestCountOf(booking) })
  }

  rows.push({ label: 'Name', value: booking.guestName })
  rows.push({ label: 'Car', value: vehiclesOf(booking) })

  return rows
}

function guestCountOf(booking: EmailBookingFacts): string {
  const total = booking.chargeableGuests + booking.exemptGuests

  return `${total} ${total === 1 ? 'person' : 'people'}`
}

function vehiclesOf(booking: EmailBookingFacts): string {
  if (booking.vehicles.length > 0) {
    return booking.vehicles.join(', ')
  }

  return booking.noVehicle ? 'Arriving without a car' : 'Not recorded'
}

function quoteFor(booking: EmailBookingFacts): EmailQuote | null {
  if (booking.lines.length === 0) {
    return null
  }

  return {
    rows: booking.lines.map((line) => ({
      label: line.description,
      value: formatCents(line.amount),
    })),
    totalLabel: 'Total',
    totalDisplay: `BND ${formatCents(booking.total)}`,
  }
}

/** The page's footnote, on the created email where the figure is news. */
function depositNoteFor(kind: BookingEmailKind, booking: EmailBookingFacts): string | null {
  if (kind !== 'booking_created' || booking.securityDeposit <= 0) {
    return null
  }

  return `Plus a refundable BND ${formatCents(booking.securityDeposit)} security deposit, which comes back to you after your stay.`
}

/**
 * What to send, and where.
 *
 * **Both amounts, because no choice has been made yet.** The customer picks
 * one on the page when they press "I have made the transfer"; at the moment
 * this email is written they have picked nothing, so stating a single figure
 * would be deciding for them. The two options are the page's own, word for
 * word.
 */
function transferFor(booking: EmailBookingFacts, property: EmailPropertyFacts): EmailTransfer {
  const depositOnly = transferPlanFor(booking, 'deposit_only')
  const everything = transferPlanFor(booking, 'everything')

  const options: EmailAmountOption[] = depositOnly.choosable
    ? [
        {
          label: `Just the deposit — BND ${formatCents(depositOnly.total)}`,
          amount: depositOnly.total,
          detail: `Secures your unit. The BND ${formatCents(everything.stay)} for the stay is paid when you arrive.`,
        },
        {
          label: `Everything now — BND ${formatCents(everything.total)}`,
          amount: everything.total,
          detail: `The BND ${formatCents(everything.deposit)} deposit and the BND ${formatCents(everything.stay)} for the stay together, so there is nothing to settle on arrival.`,
        },
      ]
    : [
        {
          label: `BND ${formatCents(depositOnly.total)}`,
          amount: depositOnly.total,
          detail:
            booking.dayPass === null
              ? 'The full price of your booking.'
              : 'The full price of your day pass.',
        },
      ]

  return {
    options,
    reference: booking.reference,
    accounts: property.bankAccounts.map((account) => ({
      label: account.bankName,
      value: account.accountNumber,
    })),
    noAccountsNote:
      property.bankAccounts.length === 0
        ? 'We cannot show the bank details here. Please call us and we will give them to you.'
        : null,
    instruction: `Put ${booking.reference} in the transfer description so we can match it to your booking. ${HOLD_SENTENCE}`,
  }
}

/**
 * What happens next, once the booking is confirmed.
 *
 * Two figures from two places, and they are different kinds of money. The
 * deposit is a refundable liability the property owes back; what is owed on
 * arrival is `balanceOf`, which is the whole stay for a deposit-secured
 * booking because a deposit is deliberately not a payment (prd.md §9.1) and
 * nothing for a guest who sent everything.
 */
function arrivalFor(
  booking: EmailBookingFacts,
  property: EmailPropertyFacts,
  isDayPass: boolean,
): readonly string[] {
  if (isDayPass) {
    return [`Show reference ${booking.reference} at the gate.`]
  }

  const sentences: string[] = []

  if (booking.securityDeposit > 0) {
    sentences.push(
      `Your refundable BND ${formatCents(booking.securityDeposit)} security deposit is with us, and comes back to you after your stay.`,
    )
  }

  const balance = balanceOf(booking.total, booking.paid)

  sentences.push(
    balance.outstanding > 0
      ? `BND ${formatCents(balance.outstanding)} for the stay is settled when you arrive.`
      : 'Everything is settled — there is nothing to pay on arrival.',
  )

  sentences.push(
    `Check in from ${property.checkInTime}, and check out by ${property.checkOutTime}.`,
  )

  return sentences
}

/**
 * The link back, or nothing at all.
 *
 * A booking taken at the desk has no access token, so there is no page to send
 * anybody to. It degrades to the reference, which the model always carries —
 * never to a link built out of `null`.
 */
function actionFor(url: string | null): EmailAction | null {
  return url === null ? null : { label: 'Open your booking', url, note: LINK_NOTE }
}
