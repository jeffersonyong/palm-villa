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
 * A deposit passes through eight stages, and every one of them is already a
 * consequence of facts recorded elsewhere: whether it has been collected at
 * all (`collected_at`), whether a release has been approved (a column pair on
 * the deposit), whether it was kept when its booking closed (a column trio),
 * whether an inspection exists (a row), and where the booking has got to (its
 * status). Storing another copy as a `stage` column would be storing a second
 * copy of a fact, and the copy would drift — the same argument
 * architecture.md §5.1 makes for `unit.status` and §6.2a makes for the booking
 * balance. `deposit_summary` returns the facts; this turns them into a stage,
 * in one place.
 *
 * ── What this does not do ─────────────────────────────────────────────────
 *
 * **It moves no money.** A release is an approval event — who, when, and the
 * figures as they stood — exactly as prd.md §11 requirement 5 asks: "Approval
 * is a recorded event, not a status flag. The audit trail is the point of an
 * approval step." Handing the notes back, or transferring them, happens in the
 * world and is recorded here rather than performed. That is the position
 * architecture.md §6.4 already takes on refunds. Keeping a deposit (prd.md
 * §9.5, N5 answered 10 September 2026) is the same kind of fact: the money is
 * already in the safe, and what changes is whose it is.
 *
 * **It does not cap liability.** prd.md §11 [C] is explicit: "The deposit is
 * not a cap on liability." Charges above the deposit are not clipped to it —
 * they produce an amount owed, which the product tracks and states.
 *
 * Pure and I/O-free. Coverage here is mandatory (architecture.md §2): these
 * figures decide what a guest is given back.
 */

import { endedWithoutStay, type BookingStatus } from './booking-state'
import type { Cents } from './money'

/**
 * Where a deposit has got to.
 *
 * Eight stages, and they are a pipeline rather than a state machine: nothing
 * here moves backwards, because each step is a fact that has happened. The
 * names are the questions Finance actually asks — what is promised and not
 * yet seen, what is in the safe for a guest who has not arrived, whose stay
 * is still running, what is waiting on Housekeeping, what can be signed off
 * now, what is done, what was kept, and what never came.
 *
 * `secured` arrived when the deposit moved from the door to the booking
 * (prd.md §9.1, capability B16): most deposits now spend days on the ledger
 * before the guest does, and calling that "guest in stay" was the ledger
 * assuming a deposit could only exist because somebody had checked in.
 *
 * `forfeited` and `lapsed` arrived on 22 September 2026, and they are the two
 * ends of the pipeline a booking reaches when it closes without a stay
 * (prd.md §9.5). **Kept** is a deposit the guest forfeited by cancelling or
 * never arriving: the business's money now, off the ledger and into revenue.
 * **Never received** is a transfer the customer promised and nobody verified
 * before the booking closed, which nobody is waiting on any more. A deposit
 * the desk chose to give back on a cancellation is `released`, because that
 * is what it is.
 */
export type DepositStage =
  | 'awaiting_verification'
  | 'secured'
  | 'in_house'
  | 'awaiting_inspection'
  | 'ready_for_release'
  | 'released'
  | 'forfeited'
  | 'lapsed'

/** The stages in pipeline order. Filters and stat tiles render them in this order. */
export const DEPOSIT_STAGES = [
  'awaiting_verification',
  'secured',
  'in_house',
  'awaiting_inspection',
  'ready_for_release',
  'released',
  'forfeited',
  'lapsed',
] as const satisfies readonly DepositStage[]

/** How each stage is named on screen. Singular: a badge labels one deposit. */
export const DEPOSIT_STAGE_LABELS: Readonly<Record<DepositStage, string>> = {
  awaiting_verification: 'Transfer awaited',
  secured: 'Held before arrival',
  in_house: 'Guest in stay',
  awaiting_inspection: 'Awaiting inspection',
  ready_for_release: 'Ready to release',
  released: 'Released',
  forfeited: 'Kept',
  lapsed: 'Never received',
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
  /**
   * Kept when the booking closed without a stay — the guest cancelled, or
   * never arrived (prd.md §9.5). Stored on the deposit rather than read off
   * the booking's status, because the desk may give a cancelled guest's
   * deposit back instead, and because the moment it was kept is the date
   * revenue counts it on.
   */
  forfeited: boolean
  /** An inspection has been recorded against this stay. */
  inspected: boolean
  /** Where the booking itself has got to. `completed` means the guest has left. */
  bookingStatus: BookingStatus
}

/**
 * What the deposit is doing, first match wins.
 *
 * Released and kept outrank everything, and an inspection outranks the
 * booking's status: all three are facts that have happened, and reading them
 * in that order is what makes the pipeline one-way. After those the booking's
 * status says where the guest is: gone (`completed`), in the unit
 * (`checked_in`), or not yet arrived — which is the fall-through, because a
 * deposit is taken when the booking is made and the ordinary deposit spends
 * days there.
 *
 * A deposit collected against a booking that closed without a stay, and
 * neither kept nor released, also falls through to `secured`. Closing a
 * booking settles its deposit in the same transaction (`close_booking()`), so
 * only a row written before that existed can be here — and for it the money is
 * still in the safe and the guest never arrived, which is what the label says.
 */
export function depositStageOf(facts: DepositStageFacts): DepositStage {
  // Ahead of everything, because it is the one stage where the property is
  // holding nothing. Every stage below describes money already in the safe;
  // reading a promise as held would put an unverified BND 100 on the ledger's
  // "what do we owe back right now", which is the one figure E1 exists to
  // answer. A promise on a booking that closed without a stay is not awaited
  // by anybody — the queue has dropped it — so it says it never arrived.
  if (!facts.collected) {
    return endedWithoutStay(facts.bookingStatus) ? 'lapsed' : 'awaiting_verification'
  }

  if (facts.released) {
    return 'released'
  }

  if (facts.forfeited) {
    return 'forfeited'
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

/**
 * What is still owed against the booking's quoted deposit.
 *
 * Deliberately not one of `DepositFigures`. Those four are the release
 * arithmetic — what is held, what is charged, what goes back — and the database
 * repeats them as a CHECK constraint on the approved row. This is a different
 * question asked at the other end of the deposit's life: did all of it arrive?
 *
 * **A promise is never short.** A transfer nobody has checked is worth nothing
 * yet, so the gap between it and the quote is not money missing, it is money
 * unverified — which the `awaiting_verification` stage already says. Reading
 * one as the other would put "Short BND 100" on every deposit the moment a
 * customer pressed the button on their own page.
 *
 * The quote is read live rather than frozen at collection, so an amendment
 * that reprices a booking upward makes a deposit that was whole read as short
 * (prd.md §11). That is the honest answer: the money genuinely is not all
 * there, and the desk has the same one way to put it right.
 */
export function depositShortfallOf(quoted: Cents, held: Cents, collected: boolean): Cents {
  return collected ? Math.max(quoted - held, 0) : 0
}

/**
 * Whether a deposit secures its booking — `booking_deposit_is_secured()` in
 * SQL, said once here so the server layer does not keep a third copy.
 *
 * `collected` is separate from `held` on purpose: a promised transfer carries
 * the full quoted figure on its row and holds nothing, so the figures alone
 * would call it secured.
 */
export function depositSecuresBooking(facts: {
  quoted: Cents
  held: Cents
  collected: boolean
}): boolean {
  return facts.quoted <= 0 || (facts.collected && facts.held >= facts.quoted)
}

/**
 * What a cancellation may do with a deposit still held: keep it, or give it
 * back. A no-show takes neither — it always keeps (prd.md §9.5).
 */
export const DEPOSIT_OUTCOMES = ['keep', 'return'] as const

export type DepositOutcome = (typeof DEPOSIT_OUTCOMES)[number]

/** True when the value is one of the two — for reading a form. */
export function isDepositOutcome(value: unknown): value is DepositOutcome {
  return typeof value === 'string' && (DEPOSIT_OUTCOMES as readonly string[]).includes(value)
}

/** What closing a booking without a stay would find where its deposit should be. */
export type DepositAtClose =
  | { kind: 'held'; amount: Cents; shortfall: Cents }
  | { kind: 'promised' }
  | { kind: 'not_taken' }
  | { kind: 'waived'; reason: string }
  | { kind: 'not_quoted' }
  | { kind: 'settled' }

export interface DepositAtCloseFacts {
  /** What the booking quotes. */
  quoted: Cents
  /** Why nothing is quoted, where the deposit was waived at creation (B15). */
  waiverReason: string | null
  /** The deposit row, or null where none was ever recorded. */
  deposit: { amount: Cents; collected: boolean; released: boolean; forfeited: boolean } | null
}

/**
 * What cancelling a booking, or marking it a no-show, would do to its deposit
 * (prd.md §9.5) — asked before the click, so the dialog can say it.
 *
 * Only `held` is a decision: money in the safe, kept, or given back on a
 * cancellation the desk chooses to refund. Everything else keeps nothing, and
 * each says why, because "nothing is kept" means something different on a
 * waived booking than on one whose transfer never arrived. `close_booking()`
 * reads the same row under its lock and decides last.
 */
export function depositAtClose(facts: DepositAtCloseFacts): DepositAtClose {
  const { deposit } = facts

  if (deposit && (deposit.released || deposit.forfeited)) {
    return { kind: 'settled' }
  }

  if (deposit && deposit.collected) {
    return {
      kind: 'held',
      amount: deposit.amount,
      shortfall: depositShortfallOf(facts.quoted, deposit.amount, true),
    }
  }

  if (deposit) {
    return { kind: 'promised' }
  }

  if (facts.waiverReason !== null) {
    return { kind: 'waived', reason: facts.waiverReason }
  }

  return facts.quoted > 0 ? { kind: 'not_taken' } : { kind: 'not_quoted' }
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
  | 'already_released'
  | 'already_forfeited'
  | 'booking_closed'
  | 'inspection_missing'
  | 'booking_not_completed'
  | 'not_collected'

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
  already_forfeited:
    'This deposit was kept when the booking closed without a stay, so there is nothing to release.',
  booking_closed:
    'This booking closed without a stay, so there is no check-out or inspection for a release to follow.',
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

  if (facts.forfeited) {
    return refuse('already_forfeited')
  }

  // Ahead of the collection and check-out refusals, both of which would name
  // a next step on a booking that has none: a promise that lapsed is not
  // waiting for the queue, and a guest who is never coming will not check
  // out. Only a deposit held on a booking closed before `close_booking()`
  // settled deposits reaches this with money in it.
  if (endedWithoutStay(facts.bookingStatus)) {
    return refuse('booking_closed')
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
  // could be deducted from money that never arrives. A kept one is the
  // business's money now, so there is nothing left to deduct from. And a
  // booking that closed without a stay has nothing a charge could be for, and
  // no release that could ever settle one — which matters for a deposit left
  // held on a booking cancelled before `close_booking()` existed, where the
  // release is refused and a charge would stand against it for good.
  return (
    facts.collected && !facts.released && !facts.forfeited && !endedWithoutStay(facts.bookingStatus)
  )
}

/** What `canTopUp` needs to know. `recorded` is false where no deposit row exists at all. */
export interface TopUpFacts {
  /** The booking closed without a stay — `endedWithoutStay`. */
  closed: boolean
  recorded: boolean
  collected: boolean
  released: boolean
  shortfall: Cents
}

export type TopUpRefusalCode =
  | 'booking_closed'
  | 'not_recorded'
  | 'not_collected'
  | 'already_released'
  | 'nothing_short'
  | 'exceeds_shortfall'

export interface TopUpRefusal {
  code: TopUpRefusalCode
  message: string
}

export type TopUpCheck = { ok: true } | { ok: false; error: TopUpRefusal }

/**
 * The sentence each refusal is reported with, in the arrangement
 * `RELEASE_REFUSALS` uses: one table, so the screen and the database function
 * refuse in the same words.
 *
 * Each one names the action that *would* work, because every state below has
 * one — which is the whole difference between this slice and the gap it
 * closes, where a clerk looking at a short deposit had no correct next move.
 * The exception is a closed booking, which has none, and says so.
 */
const TOP_UP_REFUSALS: Readonly<Record<TopUpRefusalCode, string>> = {
  booking_closed:
    'This booking closed without a stay, so nothing more is taken against its deposit.',
  not_recorded: 'Nothing has been taken against this booking yet. Record the deposit instead.',
  not_collected:
    'This deposit is still an unverified transfer. Confirm it in the payments queue first.',
  already_released: 'This deposit has already been released.',
  nothing_short: 'This deposit is already the full quoted figure.',
  exceeds_shortfall: 'That is more than this deposit is short of the quoted figure.',
}

/**
 * Whether money may still be added to this deposit.
 *
 * The screen asks it so a clerk is never offered a button that will refuse;
 * `top_up_booking_deposit()` asks the same questions again under the row lock,
 * because a release approved or a charge added while the dialog sat open must
 * not be topped up past.
 *
 * Order matters, and it runs oldest fact first: a released deposit says so
 * rather than complaining about a shortfall that stopped being collectable
 * when somebody signed the release.
 */
export function canTopUp(facts: TopUpFacts): TopUpCheck {
  // First, because every refusal below names a way to take money, and a
  // booking that closed without a stay has none: what was held was settled
  // as it closed (prd.md §9.5).
  if (facts.closed) {
    return refuseTopUp('booking_closed')
  }

  if (!facts.recorded) {
    return refuseTopUp('not_recorded')
  }

  if (!facts.collected) {
    return refuseTopUp('not_collected')
  }

  if (facts.released) {
    return refuseTopUp('already_released')
  }

  if (facts.shortfall <= 0) {
    return refuseTopUp('nothing_short')
  }

  return { ok: true }
}

/** A refusal code from `top_up_booking_deposit()`, in the words the screen uses. */
export function describeTopUpFailure(code: string): TopUpRefusal {
  if (code in TOP_UP_REFUSALS) {
    return { code: code as TopUpRefusalCode, message: TOP_UP_REFUSALS[code as TopUpRefusalCode] }
  }

  return {
    code: 'nothing_short',
    message: 'The top-up could not be recorded. Reload the screen and try again.',
  }
}

function refuseTopUp(code: TopUpRefusalCode): TopUpCheck {
  return { ok: false, error: { code, message: TOP_UP_REFUSALS[code] } }
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
