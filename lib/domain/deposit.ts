/**
 * What is held against a stay, and what happens to it (prd.md §11, E1–E3).
 *
 * The security deposit is the one figure in this product that is neither
 * revenue nor a payment: BND 100 taken when the booking is made — it is what
 * secures the booking (prd.md §9.1) — held as a liability, and given back
 * after the unit has been looked at. prd.md §2 names the absence of
 * a ledger for it as one of the five problems the platform exists to solve —
 * "nobody can answer what deposits do we owe back right now" — and this module
 * is the answer's arithmetic.
 *
 * ── Why the stage is derived, not stored ──────────────────────────────────
 *
 * A deposit passes through six stages, and every one of them is already a
 * consequence of facts recorded elsewhere: whether it has been collected at
 * all (`collected_at`), whether a release has been approved (a column pair on
 * the deposit), whether an inspection exists (a row), and where the booking
 * has got to (its status). Storing a seventh copy as a `stage`
 * column would be storing a second copy of a fact, and the copy would drift —
 * the same argument architecture.md §5.1 makes for `unit.status` and §6.2a
 * makes for the booking balance. `deposit_summary` returns the facts; this
 * turns them into a stage, in one place.
 *
 * ── What this does not do ─────────────────────────────────────────────────
 *
 * **It moves no money.** A release is an approval event — who, when, and the
 * figures as they stood — exactly as prd.md §11 requirement 5 asks: "Approval
 * is a recorded event, not a status flag. The audit trail is the point of an
 * approval step." Handing the notes back, or transferring them, happens in the
 * world and is recorded here rather than performed. That is the position
 * architecture.md §6.4 already takes on refunds, and it is what keeps this
 * slice independent of N5 in the open-questions register, which is open.
 *
 * **It does not cap liability.** prd.md §11 [C] is explicit: "The deposit is
 * not a cap on liability." Charges above the deposit are not clipped to it —
 * they produce an amount owed, which the product tracks and states.
 *
 * Pure and I/O-free. Coverage here is mandatory (architecture.md §2): these
 * figures decide what a guest is given back.
 */

import type { BookingStatus } from './booking-state'
import type { Cents } from './money'

/**
 * Where a deposit has got to.
 *
 * Six stages, and they are a pipeline rather than a state machine: nothing
 * here moves backwards, because each step is a fact that has happened. The
 * names are the questions Finance actually asks — what is promised and not
 * yet seen, what is in the safe for a guest who has not arrived, whose stay
 * is still running, what is waiting on Housekeeping, what can be signed off
 * now, and what is done.
 *
 * `secured` arrived when the deposit moved from the door to the booking
 * (prd.md §9.1, capability B16): most deposits now spend days on the ledger
 * before the guest does, and calling that "guest in stay" was the ledger
 * assuming a deposit could only exist because somebody had checked in.
 */
export type DepositStage =
  | 'awaiting_verification'
  | 'secured'
  | 'in_house'
  | 'awaiting_inspection'
  | 'ready_for_release'
  | 'released'

/** The stages in pipeline order. Filters and stat tiles render them in this order. */
export const DEPOSIT_STAGES = [
  'awaiting_verification',
  'secured',
  'in_house',
  'awaiting_inspection',
  'ready_for_release',
  'released',
] as const satisfies readonly DepositStage[]

/** How each stage is named on screen. Singular: a badge labels one deposit. */
export const DEPOSIT_STAGE_LABELS: Readonly<Record<DepositStage, string>> = {
  awaiting_verification: 'Transfer awaited',
  secured: 'Held before arrival',
  in_house: 'Guest in stay',
  awaiting_inspection: 'Awaiting inspection',
  ready_for_release: 'Ready to release',
  released: 'Released',
}

/**
 * Ceilings on the three pieces of prose this slice collects.
 *
 * 280 each, matching a discount's reason and a cancellation's: they are all
 * the same act — a sentence explaining a decision about money, written at a
 * desk — and they are read back in a table cell and on a printed statement,
 * neither of which can hold an essay. The inspection's notes are the deliberate
 * exception at 2000 (see ./inspection.ts): that one is evidence rather than a
 * justification, and an inspector describing damage should not be editing down.
 *
 * Enforced by the server actions' schemas, and again by CHECK constraints, so
 * the rule survives a caller that never asked.
 */
export const MAX_CHARGE_REASON_LENGTH = 280
export const MAX_WAIVE_REASON_LENGTH = 280
export const MAX_RELEASE_NOTE_LENGTH = 280

export interface DepositStageFacts {
  /**
   * The money has actually been seen — counted at the desk, or matched in
   * the bank app. False for a transfer the customer says they have sent and
   * nobody has checked (prd.md §9.1), which is the one state in which this
   * deposit is not yet a liability.
   */
  collected: boolean
  /** A release has been approved. */
  released: boolean
  /** An inspection has been recorded against this stay. */
  inspected: boolean
  /** Where the booking itself has got to. `completed` means the guest has left. */
  bookingStatus: BookingStatus
}

/**
 * What the deposit is doing, first match wins.
 *
 * Released outranks everything, and an inspection outranks the booking's
 * status: both are facts that have happened, and reading them in that order is
 * what makes the pipeline one-way. After those the booking's status says
 * where the guest is: gone (`completed`), in the unit (`checked_in`), or not
 * yet arrived — which is the fall-through, because a deposit is taken when
 * the booking is made and the ordinary deposit spends days there.
 *
 * A deposit held against a booking that was cancelled, expired or marked a
 * no-show also falls through to `secured`. That is the least wrong of the
 * stages available rather than the right one: prd.md §9.5 says the deposit is
 * kept, and a `forfeited` outcome is the rule not yet built (N5, N32 in the
 * register). Until it is, the money is in the safe and the guest never
 * arrived, which is what the label says.
 */
export function depositStageOf(facts: DepositStageFacts): DepositStage {
  // Ahead of everything, because it is the one stage where the property is
  // holding nothing. Every stage below describes money already in the safe;
  // reading a promise as held would put an unverified BND 100 on the ledger's
  // "what do we owe back right now", which is the one figure E1 exists to
  // answer.
  if (!facts.collected) {
    return 'awaiting_verification'
  }

  if (facts.released) {
    return 'released'
  }

  if (facts.inspected) {
    return 'ready_for_release'
  }

  if (facts.bookingStatus === 'completed') {
    return 'awaiting_inspection'
  }

  return facts.bookingStatus === 'checked_in' ? 'in_house' : 'secured'
}

/** True when the value is one of the six — for reading a URL parameter. */
export function isDepositStage(value: string): value is DepositStage {
  return (DEPOSIT_STAGES as readonly string[]).includes(value)
}

export interface DepositFigures {
  /** What was collected. */
  amount: Cents
  /** The charges standing against it. Waived charges are not among them. */
  chargesTotal: Cents
  /** What goes back to the guest. Never negative. */
  releasable: Cents
  /** What the guest owes beyond the deposit. Never negative. */
  owed: Cents
}

/**
 * The three figures a release is approved against.
 *
 * `releasable` and `owed` are two halves of one subtraction and at most one of
 * them is ever non-zero, which is the point: a deposit either has something
 * left in it or has been exceeded, and a single signed number would leave every
 * screen deciding for itself which sentence to write. prd.md §11 [C] — the
 * deposit is not a cap on liability — is what makes `owed` a real figure rather
 * than an overflow to discard.
 *
 * The database repeats this arithmetic as a CHECK constraint on the approved
 * row (`deposit_release_arithmetic`), so the figures somebody signed cannot
 * disagree with each other however they were written.
 */
export function depositFiguresOf(amount: Cents, chargesTotal: Cents): DepositFigures {
  return {
    amount,
    chargesTotal,
    releasable: Math.max(amount - chargesTotal, 0),
    owed: Math.max(chargesTotal - amount, 0),
  }
}

/** One charge, as this module needs to see it. */
export interface ChargeAmount {
  amount: Cents
  waived: boolean
}

/**
 * What the charges come to.
 *
 * A waived charge is excluded rather than removed: prd.md §4 gives waiving its
 * own permission (`charge.waive`, held by Finance), which makes it a decision
 * somebody took and therefore something the trail has to keep. It stays on the
 * screen with its reason, and counts for nothing.
 */
export function activeChargesTotal(charges: readonly ChargeAmount[]): Cents {
  return charges.reduce((total, charge) => (charge.waived ? total : total + charge.amount), 0)
}

export type ReleaseRefusalCode =
  'already_released' | 'inspection_missing' | 'booking_not_completed' | 'not_collected'

export interface ReleaseRefusal {
  code: ReleaseRefusalCode
  message: string
}

export type ReleaseCheck = { ok: true } | { ok: false; error: ReleaseRefusal }

/**
 * The sentence each refusal is reported with.
 *
 * One table, so a refusal reads identically whether the screen caught it before
 * the click or the database function refused it after — the arrangement
 * `checkPaymentMatch` has with `payment_mismatch_needs_reason`.
 */
const RELEASE_REFUSALS: Readonly<Record<ReleaseRefusalCode, string>> = {
  already_released: 'This deposit has already been released.',
  not_collected:
    'The deposit transfer has not been verified yet. Confirm it in the payments queue first.',
  booking_not_completed:
    'The guest has not checked out yet. The deposit is released after the stay ends.',
  inspection_missing:
    'The unit has not been inspected yet. Housekeeping records the inspection first.',
}

/**
 * Whether this deposit may be released.
 *
 * This is prd.md §11 requirement 4 — "the approve action is unavailable until
 * inspection is recorded" — and architecture.md §4 names it as the worked
 * example of permission logic being richer than a row filter, which is why it
 * lives in the server layer rather than in RLS.
 *
 * The screen uses it to decide whether to offer the action at all, so an
 * approver is never shown a button that is going to refuse them; the database
 * function refuses last, with the same codes. Order matters: a released deposit
 * says so rather than complaining about an inspection it already has.
 */
export function canApproveRelease(facts: DepositStageFacts): ReleaseCheck {
  if (facts.released) {
    return refuse('already_released')
  }

  // Nothing is given back that was never taken. Said here as well as by
  // `deposit_release_needs_collection`, so the screen refuses with a sentence
  // naming what to do rather than the database refusing with a constraint.
  if (!facts.collected) {
    return refuse('not_collected')
  }

  if (facts.bookingStatus !== 'completed') {
    return refuse('booking_not_completed')
  }

  if (!facts.inspected) {
    return refuse('inspection_missing')
  }

  return { ok: true }
}

/**
 * Whether a charge may still be added or waived.
 *
 * Approval freezes the figures — the statement a guest is given is what was
 * signed off — so the charges close when the release does. Before that they are
 * open all the way back to the moment the deposit was collected: a broken
 * window reported on the second night of a five-night stay is a charge
 * against this deposit, and making somebody wait for the guest to leave
 * before it can be written down is how it ends up in WhatsApp instead.
 */
export function canAddCharge(facts: DepositStageFacts): boolean {
  // A promised deposit answers for nothing yet: a charge raised against one
  // could be deducted from money that never arrives.
  return facts.collected && !facts.released
}

/** Whether the guest owes anything beyond the deposit, and whether they have paid it. */
export type OwedState = 'none' | 'owed' | 'settled'

export function owedStateOf(deposit: {
  released: boolean
  owed: Cents
  owedSettledAt: string | null
}): OwedState {
  if (!deposit.released || deposit.owed === 0) {
    return 'none'
  }

  return deposit.owedSettledAt === null ? 'owed' : 'settled'
}

/**
 * A refusal code from the database, in the words the screen uses.
 *
 * Anything unrecognised is reported rather than swallowed: a code this module
 * has never heard of means the function has grown a guard nobody mapped, and a
 * blank refusal is worse than an unfamiliar one.
 */
export function describeReleaseFailure(code: string): ReleaseRefusal {
  if (isReleaseRefusalCode(code)) {
    return { code, message: RELEASE_REFUSALS[code] }
  }

  return {
    code: 'already_released',
    message: 'The release could not be approved. Reload the screen and try again.',
  }
}

function isReleaseRefusalCode(code: string): code is ReleaseRefusalCode {
  return code in RELEASE_REFUSALS
}

function refuse(code: ReleaseRefusalCode): ReleaseCheck {
  return { ok: false, error: { code, message: RELEASE_REFUSALS[code] } }
}
