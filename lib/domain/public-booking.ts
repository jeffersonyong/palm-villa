import { type BookingStatus } from './booking-state'
import type { Cents } from './money'
import type { BookingStream } from './stream'

/**
 * The rules a booking made by a customer runs on (capabilities A1–A4).
 *
 * Everything here exists because the caller is not a staff member. The portal
 * can trust a session, a permission and a name in the audit trail; this
 * surface has none of those, so what it can trust instead is written down in
 * one pure module and applied at the boundary.
 *
 * Three separate jobs, kept together because they answer one question — what
 * may an anonymous caller do:
 *
 *   - the shape of the private link, so a malformed token is refused before it
 *     reaches a query;
 *   - what a customer is asked to transfer, which is the deposit for a stay
 *     and the whole price for anything else (prd.md §9.1, N29);
 *   - what the page says about where their booking has got to.
 *
 * The rate limits sit here too, and §Limits explains why they are constants
 * rather than settings.
 */

/**
 * 16 random bytes in base64url — 22 characters, 128 bits.
 *
 * Enough that guessing is not a strategy, and short enough that the URL fits
 * in a WhatsApp message without wrapping. The pattern is checked before the
 * token reaches a query and again by a CHECK constraint on the column, so a
 * token of any other shape means a caller minted one some other way.
 */
export const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/

export function isAccessToken(value: string): boolean {
  return ACCESS_TOKEN_PATTERN.test(value)
}

/** RFC 5321's ceiling, and the CHECK constraint on `guest.email`. */
export const MAX_GUEST_EMAIL_LENGTH = 254

/**
 * Enough of an address to be worth sending to.
 *
 * Deliberately not an RFC 5322 validator: those refuse addresses that work and
 * accept ones that do not, and the only authority on whether an address exists
 * is the mail server that accepts it. What this refuses is the small set of
 * strings that are *certainly* not one address — the ones that would otherwise
 * be handed to a third party and billed for.
 *
 * The comma and the whitespace matter more than the shape. The field was a
 * bare `includes('@')` check until capability A8, which was fine while nothing
 * read it; a string containing a comma is two recipients to some parsers and
 * one bounce to others, and neither is what the guest typed.
 */
export function isLikelyEmailAddress(value: string): boolean {
  const trimmed = value.trim()

  if (trimmed.length === 0 || trimmed.length > MAX_GUEST_EMAIL_LENGTH) {
    return false
  }

  // One `@`, something either side, a dot in the domain, and no character that
  // separates one address from another.
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>".]+$/.test(trimmed)
}

/**
 * ── Limits ─────────────────────────────────────────────────────────────────
 *
 * prd.md §9.3's hold is indefinite by the client's own decision (N7) and, from
 * this slice, reachable by anybody with the URL. A held unit is a night the
 * property cannot sell and nothing expires it, so the thing worth protecting
 * is inventory rather than bandwidth — which is why `openBookingsPerPhone` is
 * here at all, and why it is the one a patient human hits first.
 *
 * **Constants rather than settings, deliberately.** Every figure the client
 * can edit is one prd.md §8 makes a business rule, agreed and written down.
 * Nobody has agreed these; they are a defence against a script, and a settings
 * row would invite the owner to tune a control nobody has explained to him —
 * upward, on the day a real customer trips it. If they turn out to be wrong,
 * that is a deploy, and the deploy is the conversation.
 *
 * They are set where an ordinary customer never reaches them: a family
 * comparing two date ranges and booking twice is nowhere near ten, and the
 * open-holds cap of three is more bookings than one phone number has ever
 * needed at once without paying for any of them.
 */
export const PUBLIC_LIMITS = {
  /** Bookings attempted from one address in an hour. */
  bookingsPerIpPerHour: 10,
  /** Bookings attempted against one phone number in a day. */
  bookingsPerPhonePerDay: 5,
  /** Unpaid bookings one phone number may be holding at once. */
  openBookingsPerPhone: 3,
  /** "I've made the transfer" presses from one address in an hour. */
  submitsPerIpPerHour: 30,
  /**
   * Files sent from one address in an hour (capabilities A6, A7).
   *
   * The first counter here guarding something that costs storage rather than
   * inventory or bandwidth, and the looser of the pair for that reason: an
   * address is a household or an office, and a family sending a slip and two
   * sides of an IC from one hotel wifi is three uploads before anybody has
   * retaken a dark photograph.
   */
  uploadsPerIpPerHour: 20,
  /**
   * Files sent against one booking in a day.
   *
   * The one that actually bounds the cost, because it keys on the credential
   * rather than the caller: an upload needs a valid access token, so a script
   * with one token can only ever fill one booking'''s allowance.
   *
   * Ten, because a guest whose first photograph came out dark retakes it once
   * or twice, and each retake supersedes rather than accumulates — the storage
   * a booking can hold is bounded by the superseding, not by this. What this
   * bounds is the *writing*.
   */
  uploadsPerBookingPerDay: 10,
  /**
   * Lookup attempts from one address in an hour (capability A9).
   *
   * The first counter here that guards a **read**, and it guards a different
   * shape of attack from the rest. `PV-` references are sequential by design
   * (architecture.md §6.1 — short enough to type into a transfer), so the
   * reference half of a lookup is a sweep rather than a guess, and the only
   * thing between a sweep and a permanent link to somebody's booking is this
   * number and the phone match.
   *
   * Ten, because a customer who has lost their link tries two or three times
   * and a family on one office connection might reach five.
   */
  lookupsPerIpPerHour: 10,
  /**
   * Lookup attempts against one reference in a day.
   *
   * What the address counter cannot answer: a reference read off a transfer
   * slip and guessed against from many addresses. Ten tries a day at a
   * seven-digit number is not a strategy.
   *
   * It has a cost, and it is the honest one to state — somebody who knows a
   * reference can burn its allowance and push its owner to the phone for the
   * rest of the day. The alternatives are worse: counting only failures needs
   * two counter calls per request against architecture.md §4a's instruction
   * that the whole gate be readable at once, and keying on reference *and*
   * address defeats the distributed case this exists for.
   */
  lookupsPerReferencePerDay: 10,
  /**
   * Emails sent to one address in a day (capability A8).
   *
   * The only limit here that protects somebody other than the property. Every
   * other counter keys on the caller — an IP or a phone number — so a script
   * rotating phone numbers behind one address can make ten bookings an hour
   * naming a victim's inbox, and each one would send them mail. The cost is
   * not bandwidth: it is complaints against a sending domain, which is close
   * to unrecoverable for a domain with no reputation yet.
   *
   * Five, because a family who books, amends and books again is nowhere near
   * it, and because a booking is never refused for tripping it — only the
   * email is skipped.
   */
  emailsPerAddressPerDay: 5,
} as const

export const HOUR_IN_SECONDS = 3600
export const DAY_IN_SECONDS = 86_400

/** Which of the two things the client named the customer is sending. */
export type TransferChoice = 'deposit_only' | 'everything'

export interface TransferPlan {
  /** What the customer sends, in one transfer. */
  total: Cents
  /** The refundable part of it. Zero where no deposit is quoted. */
  deposit: Cents
  /** The part that pays for the stay or the pass now. Zero when it is not. */
  stay: Cents
  /**
   * Whether the customer is offered the choice at all.
   *
   * Only a short stay quoting a deposit has two answers; a day pass has no
   * unit to secure and nothing to defer, so it is simply paid for.
   */
  choosable: boolean
}

/**
 * What the customer transfers, and what each part of it is for.
 *
 * **Both branches are the client's own words.** Asked on 10 September 2026
 * what a guest sends when they book, he named two cases — *the deposit only,
 * or the full amount with the deposit* — and N29 recorded both while only the
 * first was built. This is the second, and it is not [N16](open-questions.md):
 * paying everything up front is the stated policy (a stay is paid in full)
 * happening earlier, where a part payment would be the stay paid in halves.
 *
 * The two parts stay separate all the way down even though the customer makes
 * one transfer, because they are different kinds of money: the deposit is a
 * refundable liability the property owes back, and the stay is revenue. prd.md
 * §11 keeps them apart in the ledger, and merging them here would be the one
 * place they could be confused.
 */
export function transferPlanFor(
  booking: { stream: BookingStream; total: Cents; securityDeposit: Cents },
  choice: TransferChoice = 'deposit_only',
): TransferPlan {
  const securesWithDeposit = booking.stream === 'short_stay' && booking.securityDeposit > 0

  if (!securesWithDeposit) {
    return { total: booking.total, deposit: 0, stay: booking.total, choosable: false }
  }

  if (choice === 'everything') {
    return {
      total: booking.securityDeposit + booking.total,
      deposit: booking.securityDeposit,
      stay: booking.total,
      choosable: true,
    }
  }

  return {
    total: booking.securityDeposit,
    deposit: booking.securityDeposit,
    stay: 0,
    choosable: true,
  }
}

export function isTransferChoice(value: string): value is TransferChoice {
  return value === 'deposit_only' || value === 'everything'
}

/**
 * Whether the "I've made the transfer" button is offered.
 *
 * Exactly one status, and it is the state machine's rather than this module's
 * opinion: `held` is the only place `submit_payment` leaves from that a
 * customer can be in. Pressing it twice is a race the database settles, so
 * this is what the screen renders on, never what the write relies on.
 */
export function canSubmitTransfer(status: BookingStatus): boolean {
  return status === 'held'
}

/**
 * Where the customer's own booking has got to, in their terms.
 *
 * Four stages over nine statuses, because the state machine describes the
 * property's operation and this describes one person's afternoon. A guest does
 * not need to know the difference between `completed` and `no_show` on a page
 * about a booking they made an hour ago; they need to know whether the
 * business is waiting on them, they are waiting on the business, it is
 * settled, or it is over.
 *
 * `checked_in` and `completed` both read as confirmed, deliberately: the
 * booking is good, and a customer looking at this page mid-stay should not be
 * told their booking has "completed" as though something ended badly.
 */
export type PublicStage = 'awaiting_transfer' | 'checking' | 'confirmed' | 'closed'

export function publicStageOf(status: BookingStatus): PublicStage {
  switch (status) {
    case 'draft':
    case 'held':
      return 'awaiting_transfer'
    case 'awaiting_payment_verification':
      return 'checking'
    case 'confirmed':
    case 'checked_in':
    case 'completed':
      return 'confirmed'
    default:
      return 'closed'
  }
}

/**
 * What a closed booking says, which is the one stage that has to name its own
 * reason: "this booking is no longer live" is the sentence that makes somebody
 * ring the office, and every one of these is a thing they can act on.
 */
export const CLOSED_REASONS: Partial<Record<BookingStatus, string>> = {
  cancelled: 'This booking was cancelled.',
  expired: 'This booking was released before payment was confirmed.',
  no_show: 'This booking was recorded as a no-show.',
}
