/**
 * What a booking is owed (capability B13).
 *
 * One subtraction, in one place. `total - paid`, where `paid` is the sum of
 * the payments actually verified against the booking — and the reason it gets
 * a module rather than being written inline at each call site is that the same
 * figure decides three different things: what the Money card says, whether a
 * top-up may be raised at all, and what a confirmation is matched against
 * (`checkPaymentMatch` in ./payment-match.ts takes it as `dueCents`).
 *
 * ── What changed, and why this exists at all ──────────────────────────────
 *
 * The payment slice opened by recording that it "is NOT a ledger": nothing
 * computed a balance, and two payments against one booking were two recorded
 * facts. That held while a booking's price could not move after it was paid.
 * The amendment path (prd.md §9.6) broke it — a guest who paid for one night
 * and extends to two leaves the booking worth more than has been paid for it —
 * and the product could neither name that figure nor take a second transfer to
 * clear it.
 *
 * This is deliberately NOT part payments. prd.md §9.1 [C] still stands: full
 * payment secures a unit, and nothing offers a guest the choice of paying half
 * up front. What is now expressible is a shortfall the *system itself* created
 * by repricing a booking somebody had already paid for. That the balance is
 * computable does make instalments mechanically possible, which is worth
 * saying out loud: it is now the product that declines to offer them, not the
 * schema that cannot represent one. [N16](docs/open-questions.md) is unchanged.
 *
 * Pure and I/O-free. `paid` is read off `booking_summary`, which sums the
 * verified payment rows — never a stored column, because a stored total is a
 * second copy of a figure the payment rows already hold and the two disagree
 * the first time something writes a payment without maintaining it.
 */

import type { Cents } from './money'

/**
 * Where a booking's money stands.
 *
 * Three states, describing money rather than policy. There is deliberately no
 * `part_paid`: that names an arrangement nobody has agreed to (see N16), and a
 * booking mid-way through settling an amendment is not in a different *kind*
 * of state from one whose transfer has not landed yet — both are simply owed
 * something.
 */
export type BalanceState = 'outstanding' | 'settled' | 'overpaid'

export interface BookingBalance {
  total: Cents
  /** The sum of verified payments. A promised transfer counts for nothing. */
  paid: Cents
  /**
   * `total - paid`. Positive when the guest owes; negative when they have paid
   * more than the booking is worth, which is a refund conversation and one the
   * system does not have (prd.md §9.6, and N5 is open).
   */
  outstanding: Cents
  state: BalanceState
}

export function balanceOf(total: Cents, paid: Cents): BookingBalance {
  const outstanding = total - paid

  return { total, paid, outstanding, state: describeBalance(outstanding) }
}

export function describeBalance(outstanding: Cents): BalanceState {
  if (outstanding === 0) {
    return 'settled'
  }

  return outstanding > 0 ? 'outstanding' : 'overpaid'
}

/**
 * Whether a further payment can be taken against this booking.
 *
 * False on a settled booking, and false on an overpaid one — taking more money
 * against a booking that already owes the guest a refund is not a case
 * anything here can make sense of, and `record_transfer_payment()` refuses it
 * in the database for the same reason. The screen uses this to decide whether
 * to offer the action at all, so a clerk is never shown a button that is going
 * to say no.
 */
export function canSettle(balance: BookingBalance): boolean {
  return balance.state === 'outstanding'
}
