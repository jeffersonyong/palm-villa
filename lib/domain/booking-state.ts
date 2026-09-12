/**
 * Booking state machine (prd.md §9.2, architecture.md §5.3).
 *
 *   draft → held → awaiting_payment_verification → confirmed → checked_in
 *         → completed
 *         ↘ expired (hold lapsed)
 *         ↘ cancelled
 *         ↘ no_show
 *
 * architecture.md §5.3 is explicit: "Transitions are implemented as a single
 * function in lib/domain that validates legality; no code path sets status
 * directly." This is that function. It is pure — legality only. Persisting the
 * new status and writing the accompanying audit event is the caller's job, and
 * both must happen in the same transaction.
 *
 * Coverage here is mandatory (architecture.md §2).
 */

import type { StayDate } from './dates'

export type BookingStatus =
  | 'draft'
  | 'held'
  | 'awaiting_payment_verification'
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'no_show'

export type BookingEvent =
  | 'hold'
  | 'submit_payment'
  | 'verify_payment'
  | 'pay_in_full'
  | 'secure_with_deposit'
  | 'check_in'
  | 'check_out'
  | 'expire'
  | 'cancel'
  | 'mark_no_show'

/**
 * Terminal states. A booking in one of these never moves again — a cancelled
 * booking that returns is a new booking, which keeps the audit trail honest.
 */
const TERMINAL: readonly BookingStatus[] = ['completed', 'expired', 'cancelled', 'no_show']

/**
 * The legal moves, as data.
 *
 * `pay_in_full` is the walk-in path (prd.md §9.4 [C]): the guest is present and
 * pays immediately, so the booking is created and paid in one action and never
 * passes through `held`. No unit is ever held against an unpaid promise.
 *
 * `submit_payment` leaves `draft` as well as `held`, and the two are the same
 * event for the same reason: the customer says they have paid and somebody has
 * to check. The difference is only whether a hold preceded it. A booking taken
 * at the desk and paid by bank transfer goes straight to the queue rather than
 * fabricating a transient `held` state it never persists — `held` carries hold
 * semantics (`hold_expires_at`, the expiry job in architecture.md §6.3) that
 * this path does not have, and whose duration is prd.md §18 N7, still open.
 *
 * `secure_with_deposit` is the deposit taken in cash at the desk (prd.md §9.1,
 * capability B16). It reaches `confirmed` without the stay being paid at all,
 * which is exactly what the client's reversal of 10 September 2026 asks for:
 * a booking is secured by the BND 100, and the stay is settled on arrival. It
 * is NOT `pay_in_full` wearing two hats — that event means the guest handed
 * over the whole price, and a booking confirmed on its deposit still owes
 * every cent of the stay. Naming them the same would make the history say
 * something untrue about money, which is the one thing §10.7 spent a slice
 * making legible. A deposit transferred rather than counted uses
 * `submit_payment` instead, because it has to be verified like any transfer.
 *
 * It leaves `awaiting_payment_verification` too, because a booking can be
 * waiting on a transfer for the *stay* with no deposit yet recorded — a desk
 * booking taken by transfer before the form took the deposit, or a customer
 * who sent the stay and forgot the BND 100. Cash counted for the deposit is
 * what confirms such a booking, and the pending transfer stays in the queue
 * to settle the balance when it is seen.
 *
 * ── Which event confirms a booking is the deposit's decision ─────────────
 *
 * Three events reach `confirmed`, and the machine keeps all three legal; what
 * it cannot see is whether the booking quotes a deposit. That rule lives one
 * layer down, in the writers (lib/db) and the SQL functions behind them: **a
 * booking quoting a deposit is confirmed by that deposit — counted, or
 * verified in the queue — and by nothing else**, so `verify_payment` and
 * `pay_in_full` against the stay's money are used only where no deposit is
 * quoted, or where it is already in hand. A booking quoting none is confirmed
 * by paying for it. prd.md §11's as-built block carries the rule; this
 * comment is here so nobody reads the map and infers that a stay payment
 * confirms a deposit-secured booking.
 *
 * There is deliberately no transition that reaches `confirmed` without either
 * a verified payment, a walk-in payment, or the deposit that secures it.
 * prd.md §9.4 excludes booked-ahead, pay-on-arrival from v1; §9.4 also notes
 * that adding it later is additive — a new state alongside these, not a
 * rework of them.
 */
const TRANSITIONS: Readonly<Record<BookingStatus, Partial<Record<BookingEvent, BookingStatus>>>> = {
  draft: {
    hold: 'held',
    submit_payment: 'awaiting_payment_verification',
    pay_in_full: 'confirmed',
    secure_with_deposit: 'confirmed',
    cancel: 'cancelled',
  },
  held: {
    submit_payment: 'awaiting_payment_verification',
    pay_in_full: 'confirmed',
    secure_with_deposit: 'confirmed',
    expire: 'expired',
    cancel: 'cancelled',
  },
  awaiting_payment_verification: {
    verify_payment: 'confirmed',
    secure_with_deposit: 'confirmed',
    expire: 'expired',
    cancel: 'cancelled',
  },
  confirmed: {
    check_in: 'checked_in',
    cancel: 'cancelled',
    mark_no_show: 'no_show',
  },
  checked_in: {
    check_out: 'completed',
  },
  completed: {},
  expired: {},
  cancelled: {},
  no_show: {},
}

/**
 * Every status, derived from the transition map rather than retyped.
 *
 * Screens that offer a status filter enumerate this, so adding a state to the
 * machine cannot leave a filter silently missing it.
 */
export const BOOKING_STATUSES = Object.keys(TRANSITIONS) as readonly BookingStatus[]

export interface TransitionError {
  code: 'illegal_transition' | 'terminal_state'
  message: string
}

export type TransitionResult =
  { ok: true; status: BookingStatus } | { ok: false; error: TransitionError }

/** True when the booking can never move again. */
export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL.includes(status)
}

/** The events legal from a given state. Drives which actions a screen offers. */
export function allowedEvents(status: BookingStatus): readonly BookingEvent[] {
  return Object.keys(TRANSITIONS[status]) as BookingEvent[]
}

/**
 * Applies an event to a status, returning the new status or why it is illegal.
 *
 * Returns a result rather than throwing: an illegal transition is usually two
 * staff members acting on the same booking at once, which is a message on
 * screen, not a crash.
 */
export function transition(status: BookingStatus, event: BookingEvent): TransitionResult {
  if (isTerminal(status)) {
    return {
      ok: false,
      error: {
        code: 'terminal_state',
        message: `This booking is ${status.replace(/_/g, ' ')} and cannot be changed.`,
      },
    }
  }

  const next = TRANSITIONS[status][event]

  if (!next) {
    return {
      ok: false,
      error: {
        code: 'illegal_transition',
        message: `Cannot ${event.replace(/_/g, ' ')} a booking that is ${status.replace(/_/g, ' ')}.`,
      },
    }
  }

  return { ok: true, status: next }
}

/**
 * Statuses whose booking may still be amended.
 *
 * Amendment is NOT a transition — a booking's status does not move when its
 * dates or guest change — so it is not in the map above and there is no
 * `amend` event. What belongs here is the *legality* question, because it is a
 * fact about the machine and architecture.md §5.3 keeps those in one module.
 *
 * `checked_in` is excluded even though the machine can still move out of it:
 * the guest is in the unit, so the stay has begun, and `priceStay` refuses a
 * check-in date in the past — an in-progress stay cannot be repriced without a
 * deliberate exception in the pricing engine. Extending a guest already in
 * house is a real front-office need and its own decision (prd.md §9.6), not
 * something to smuggle in behind an edit form.
 */
const AMENDABLE: readonly BookingStatus[] = [
  'draft',
  'held',
  'awaiting_payment_verification',
  'confirmed',
]

/** True when the booking's details can still be changed. */
export function canAmend(status: BookingStatus): boolean {
  return AMENDABLE.includes(status)
}

/**
 * The closed states in which the guest never stayed.
 *
 * Three of the four terminal states, and the fourth is left out on purpose:
 * `completed` is a stay that happened, so its deposit waits on an inspection
 * and a release (prd.md §11). These three settle the deposit as they close —
 * kept or given back, prd.md §9.5 — and a promised transfer still unverified
 * when one of them lands is no longer awaited by anybody.
 */
const ENDED_WITHOUT_STAY: readonly BookingStatus[] = ['cancelled', 'no_show', 'expired']

/** True when the booking closed without the guest ever staying. */
export function endedWithoutStay(status: BookingStatus): boolean {
  return ENDED_WITHOUT_STAY.includes(status)
}

/**
 * Whether a booking may be marked a no-show today.
 *
 * The machine allows `mark_no_show` from `confirmed` and nowhere else; what it
 * cannot see is the calendar. **[A]** Not before the arrival day: a guest due
 * on Friday has not failed to arrive on Thursday, and marking them keeps their
 * deposit and releases their unit — neither of which a clerk should be able to
 * do early by mistake. From the arrival day on it is the desk's judgement,
 * because a guest can turn up at 23:00. `close_booking()` refuses the same
 * thing in SQL, reading today in the property's own timezone.
 *
 * `arrival` is the stay's first night or a day pass's date, and null for a
 * booking that has neither — which has nothing to be absent from.
 */
export function canMarkNoShow(booking: {
  status: BookingStatus
  arrival: StayDate | null
  today: StayDate
}): boolean {
  return (
    allowedEvents(booking.status).includes('mark_no_show') &&
    booking.arrival !== null &&
    booking.arrival <= booking.today
  )
}

/**
 * The staff-facing name for each status.
 *
 * The words live with the machine and the colours live with the badge
 * (components/portal/booking-status-badge.tsx), because the two are answering
 * different questions: what a state is called is a fact about the booking,
 * and what tone it takes is a fact about a screen. The split was made for the
 * accounting pack (capability G5), which has to name a status on a page with
 * no screen behind it, and lib/domain cannot reach into components to ask.
 */
export const BOOKING_STATUS_LABELS: Readonly<Record<BookingStatus, string>> = {
  draft: 'Draft',
  held: 'Held',
  awaiting_payment_verification: 'Awaiting payment',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  completed: 'Completed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  no_show: 'No show',
}
