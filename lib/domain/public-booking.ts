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
