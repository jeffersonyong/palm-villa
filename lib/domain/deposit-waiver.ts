/**
 * Waiving the security deposit on a booking (capability B15, prd.md §11).
 *
 * prd.md §11 [C] takes BND 100 at check-in and holds it until the unit has
 * been inspected. The one case that rule gets wrong is a stay that is really
 * the continuation of another: a guest who extends by a night after checking
 * in cannot have their booking amended (§9.6 [O], N12), so the desk takes a
 * second booking for the extra night — and `check_in_booking()` would then
 * take a second BND 100 off a guest who already has one held. The waiver is
 * how the desk says "the deposit for this stay is already in the safe, under
 * another reference", and has that written down.
 *
 * ── What a waiver IS ──────────────────────────────────────────────────────
 *
 * A booking that quotes no deposit. `check_in_booking()` already checks a
 * zero-deposit booking in without writing a deposit row and says so on
 * screen; the waiver reuses that path rather than adding a state. What it adds
 * is the *record*: a reason on the booking, and a `deposit.waived` audit event
 * carrying what would otherwise have been held — because the whole point of
 * the one-transaction check-in was that "no deposit recorded" and "nobody
 * wrote it down" should never look the same, and a waiver with no reason
 * would put them back together.
 *
 * ── What this module does NOT decide ──────────────────────────────────────
 *
 * Who may waive. That is `deposit.waive`, checked by requirePermission() in
 * the server action — its own string rather than a side effect of
 * `booking.create`, for the reason `booking.discount` is: it decides that
 * money is not taken, and a manager should be able to withhold that from a
 * role that otherwise takes bookings all day.
 *
 * Pure and I/O-free, like the rest of lib/domain, so the booking form and the
 * server action read the control with one function.
 */

/**
 * 280, matching a discount's reason, a charge's and a cancellation's: the same
 * act — a sentence explaining a decision about money, written at a desk — read
 * back in a history row. Enforced here, in the server action's schema, and by a
 * CHECK constraint, so the rule survives a caller that never asked.
 */
export const MAX_DEPOSIT_WAIVER_REASON_LENGTH = 280

/**
 * The two fields the waiver control submits, as they arrive from a form.
 *
 * Strings, because that is what `FormData` carries. `waive` is `'true'` or
 * `'false'`, submitted on every save so an unticked box is a decision rather
 * than an absence.
 */
export interface DepositWaiverFormValues {
  waive: string
  reason: string
}

export interface DepositWaiverFieldError {
  /** Which input the form should put the message against. */
  field: 'depositWaiverReason'
  message: string
}

/**
 * `reason` is the waiver: a string when the deposit is waived, null when it is
 * not. There is no separate flag to fall out of step with it — the database
 * column has the same shape.
 */
export type ParsedDepositWaiver =
  { ok: true; reason: string | null } | { ok: false; error: DepositWaiverFieldError }

/**
 * Turns what a clerk submitted into a waiver, or into the sentence explaining
 * what is missing.
 *
 * Not waiving is the ordinary case and needs no reason, whatever the field
 * holds — a clerk who typed one and then unticked the box has changed their
 * mind, and the text goes with it. Waiving requires one: a deposit that was
 * not taken with no note of why is the gap in the spreadsheet this product
 * exists to close.
 */
export function parseDepositWaiver(values: DepositWaiverFormValues): ParsedDepositWaiver {
  if (values.waive !== 'true') {
    return { ok: true, reason: null }
  }

  const reason = values.reason.trim()

  if (reason.length === 0) {
    return {
      ok: false,
      error: {
        field: 'depositWaiverReason',
        message:
          'Say why no deposit is being taken — for instance, which booking already holds one.',
      },
    }
  }

  if (reason.length > MAX_DEPOSIT_WAIVER_REASON_LENGTH) {
    return {
      ok: false,
      error: {
        field: 'depositWaiverReason',
        message: `Keep the reason under ${MAX_DEPOSIT_WAIVER_REASON_LENGTH} characters.`,
      },
    }
  }

  return { ok: true, reason }
}
