/**
 * Matching a payment to what is owed (prd.md §10.4, capability B5).
 *
 * scope-of-capabilities.md B5 promises the client: "Confirm payments by
 * matching both reference and amount — a short payment is flagged, never
 * silently accepted." This module is the amount half of that promise, and it
 * is the only place the rule is decided.
 *
 * Pure, so the confirm dialog can reveal its reason field live using the very
 * function the server action then enforces with — the same arrangement
 * priceStay() has with the booking form, where a second copy of the rule in
 * the island is exactly what would drift.
 *
 * Coverage here is mandatory (architecture.md §2). What this module does NOT
 * do is decide anything about money movement: a short payment is recorded as
 * short, an overpayment as over, and nothing is refunded, forfeited or netted
 * off. prd.md §18 N5 is open and §9.6 records why nothing may depend on it.
 */

import type { Cents } from './money'
import type { PaymentMatchKind } from './payment'

/** How the observed amount stands against what is due. */
export type VarianceKind = 'exact' | 'short' | 'over'

/**
 * Observed minus due. Negative is short, positive is over.
 *
 * The sign convention is stated rather than implied because it lands in the
 * audit event as `variance_cents`, where a reader a year later has only the
 * name to go on.
 */
export function amountVariance(dueCents: Cents, observedCents: Cents): Cents {
  return observedCents - dueCents
}

export function describeVariance(variance: Cents): VarianceKind {
  if (variance === 0) {
    return 'exact'
  }

  return variance < 0 ? 'short' : 'over'
}

export interface PaymentMatchInput {
  /**
   * What the booking is worth *now* — booking.total_cents, never the figure
   * snapshotted when the payment was raised. A booking amended between the
   * quote and the transfer must be matched against what is actually due, or a
   * repriced stay confirms itself short without anyone being told.
   */
  dueCents: Cents
  /** What the staff member saw in the bank, or counted out. */
  observedCents: Cents
  match: PaymentMatchKind
  amountOverrideReason: string | null
  matchReason: string | null
}

/** Which justifications this confirmation cannot proceed without. */
export interface RequiredReasons {
  /** The amount disagrees with what is due (architecture.md §6.2). */
  amount: boolean
  /** The payment was tied to this booking by hand (prd.md §10.4). */
  match: boolean
}

/**
 * The two reasons are independent, and both can be required at once — a
 * transfer with no reference that is also fifty dollars short is one click
 * carrying two separate justifications.
 */
export function requiresReasons(
  input: Pick<PaymentMatchInput, 'dueCents' | 'observedCents' | 'match'>,
): RequiredReasons {
  return {
    amount: amountVariance(input.dueCents, input.observedCents) !== 0,
    match: input.match === 'manual',
  }
}

export interface PaymentMatchError {
  code: 'reason_required'
  /** Which field the dialog should put the error against. */
  field: 'amountOverrideReason' | 'matchReason'
  message: string
}

export type PaymentMatchResult =
  | { ok: true; variance: Cents; kind: VarianceKind; overridden: boolean }
  | { ok: false; error: PaymentMatchError }

/**
 * Decides whether this confirmation may proceed.
 *
 * Trimming is part of the rule, not the form's job: a reason of three spaces
 * satisfies `required` in a browser and satisfies nobody reading the audit
 * trail afterwards.
 *
 * An overpayment is refused without a reason just as firmly as a short one.
 * prd.md §10.4 names only the short case because that is the one that loses
 * money, but an overpayment is a refund conversation — and refunds are N5,
 * open — so confirming one silently would be the system taking a position it
 * has not been given.
 */
export function checkPaymentMatch(input: PaymentMatchInput): PaymentMatchResult {
  const variance = amountVariance(input.dueCents, input.observedCents)
  const kind = describeVariance(variance)
  const required = requiresReasons(input)

  if (required.amount && !isGiven(input.amountOverrideReason)) {
    return {
      ok: false,
      error: {
        code: 'reason_required',
        field: 'amountOverrideReason',
        message:
          kind === 'short'
            ? 'This is less than the amount due. Say why it is being confirmed.'
            : 'This is more than the amount due. Say why it is being confirmed.',
      },
    }
  }

  if (required.match && !isGiven(input.matchReason)) {
    return {
      ok: false,
      error: {
        code: 'reason_required',
        field: 'matchReason',
        message: 'Say why this payment belongs to this booking.',
      },
    }
  }

  return { ok: true, variance, kind, overridden: required.amount }
}

function isGiven(reason: string | null): boolean {
  return reason !== null && reason.trim().length > 0
}
