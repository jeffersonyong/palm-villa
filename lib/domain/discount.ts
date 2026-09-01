/**
 * Staff discounts (capability B2, an addition to prd.md §8).
 *
 * prd.md §8: "Pricing is a line-item calculation, never a single stored
 * price." A discount is therefore a LINE — a negative one — and never a
 * subtraction applied to a total somewhere downstream. That is what keeps the
 * booking's price explainable to a guest disputing it: the receipt shows what
 * was charged and what was taken off, and the total is still the sum of what
 * is printed.
 *
 * Pure and I/O-free, like the rest of lib/domain, so the booking form can
 * preview a discount live using the very function the server then prices with.
 * The engine owns the arithmetic; nothing else is allowed to compute it.
 *
 * ── What this module does NOT decide ──────────────────────────────────────
 *
 * Who may apply one. That is the `booking.discount` permission, checked by
 * requirePermission() at the top of the server actions — a deliberate grant
 * rather than a side effect of being able to create a booking, because this is
 * the one field on the form that gives money away.
 */

import { totalOf, type BookingLine, line } from './lines'
import { centsFromInput, formatCents, type Cents } from './money'

/**
 * Two shapes, because staff think in both: "give them ten percent" and "knock
 * forty dollars off" are different instructions, and storing the resolved
 * cents alone would lose which one was meant. A stay repriced by an amendment
 * must re-derive a percentage against the NEW subtotal, not carry forward the
 * dollars the old one happened to produce.
 */
export const DISCOUNT_KINDS = ['amount', 'percent'] as const

export type DiscountKind = (typeof DISCOUNT_KINDS)[number]

/** The longest a reason may be, matching the amendment and cancellation reasons. */
export const MAX_DISCOUNT_REASON_LENGTH = 280

export interface Discount {
  kind: DiscountKind
  /** Cents when `kind` is `amount`; whole percent (1–100) when `percent`. */
  value: number
  /**
   * Why. Required, always — a discount with no recorded reason is the one
   * thing an owner asks about later that nobody can answer.
   */
  reason: string
}

export type DiscountErrorCode =
  'invalid_value' | 'exceeds_total' | 'reason_required' | 'reason_too_long'

export interface DiscountError {
  code: DiscountErrorCode
  /** Written for a staff member to read on screen, not for a log. */
  message: string
}

export type DiscountResult =
  { ok: true; amount: Cents; line: BookingLine } | { ok: false; error: DiscountError }

function fail(code: DiscountErrorCode, message: string): DiscountResult {
  return { ok: false, error: { code, message } }
}

/**
 * Resolves a discount against the subtotal it applies to, returning the line
 * that expresses it.
 *
 * `subtotal` is the sum of the priced lines BEFORE the discount. The security
 * deposit is deliberately not part of it and is never discounted: prd.md §11
 * makes it a refundable BND 100 liability, and taking money off a sum that is
 * given back is not a discount, it is a shortfall at release time.
 *
 * A percentage is rounded to the nearest cent. Every rate in prd.md §7.1 and
 * §8 is a whole number of dollars, so this only ever bites on an odd
 * percentage of an odd subtotal — and rounding is stated here rather than left
 * to whichever caller does the multiplication.
 */
export function resolveDiscount(subtotal: Cents, discount: Discount): DiscountResult {
  const reason = discount.reason.trim()

  if (reason.length === 0) {
    return fail('reason_required', 'Say why this booking is being discounted.')
  }

  if (reason.length > MAX_DISCOUNT_REASON_LENGTH) {
    return fail(
      'reason_too_long',
      `Keep the reason under ${MAX_DISCOUNT_REASON_LENGTH} characters.`,
    )
  }

  if (!Number.isInteger(discount.value) || discount.value <= 0) {
    return fail(
      'invalid_value',
      discount.kind === 'percent'
        ? 'Enter a discount between 1% and 100%.'
        : 'Enter an amount to take off, like 40.00.',
    )
  }

  if (discount.kind === 'percent' && discount.value > 100) {
    return fail('invalid_value', 'Enter a discount between 1% and 100%.')
  }

  const amount =
    discount.kind === 'percent' ? Math.round((subtotal * discount.value) / 100) : discount.value

  // A discount cannot make a booking negative — `booking.total_cents >= 0` in
  // the schema would refuse the write anyway, and a constraint violation is a
  // worse way to learn this than a sentence beside the field. A 100% discount
  // landing exactly on zero is allowed: comping a stay outright is a real
  // thing a manager does, and it is recorded with a reason like any other.
  if (amount > subtotal) {
    return fail('exceeds_total', 'A discount cannot be more than the booking is worth.')
  }

  return { ok: true, amount, line: line('discount', describe(discount), 1, -amount) }
}

/**
 * The line's own wording, which is what a guest reads on a receipt.
 *
 * The reason is NOT in it. It is staff shorthand recorded against the booking
 * and in the audit trail — "regular, always pays cash" is not a sentence to
 * hand back to the person it is about.
 */
function describe(discount: Discount): string {
  return discount.kind === 'percent' ? `Discount — ${discount.value}%` : 'Discount'
}

/**
 * A discount instruction in one line of staff-readable text, reason included.
 *
 * Used wherever a discount has to be *compared* as well as shown — the
 * amendment diff decides "did this change?" on rendered text, so a reworded
 * reason with the same figure has to read differently or the change would go
 * unnoticed and Save would stay disabled.
 */
export function describeDiscount(discount: Discount | null): string {
  if (!discount) {
    return 'None'
  }

  const figure =
    discount.kind === 'percent' ? `${discount.value}%` : `BND ${formatCents(discount.value)}`

  return `${figure} — ${discount.reason}`
}

/**
 * The subtotal a discount applies to: everything priced except the discount
 * itself.
 *
 * Exported because both the pricing engine and any screen re-reading a stored
 * booking's lines need the same answer, and "sum everything that is not the
 * discount" written twice is where the two would drift.
 */
export function subtotalOf(lines: readonly BookingLine[]): Cents {
  return totalOf(lines.filter((entry) => entry.type !== 'discount'))
}

/**
 * The three fields the discount control submits, as they arrive from a form.
 *
 * Strings, all of them, because that is what `FormData` carries. `kind` is
 * widened to `string` deliberately: this runs at a trust boundary, and the
 * closed list is checked here rather than assumed by the caller.
 */
export interface DiscountFormValues {
  /** `none`, `amount` or `percent`. Anything else is refused. */
  kind: string
  /** BND as typed — `40` or `40.00` — when `amount`; whole percent when `percent`. */
  value: string
  reason: string
}

export interface DiscountFieldError {
  /** Which input the form should put the message against. */
  field: 'discountValue' | 'discountReason' | 'discountKind'
  message: string
}

export type ParsedDiscount =
  { ok: true; discount: Discount | null } | { ok: false; error: DiscountFieldError }

/**
 * Turns what a clerk typed into a discount instruction, or into the sentence
 * explaining what could not be read.
 *
 * Pure, so the booking form can preview the discounted total with the same
 * function the server action then parses with — the arrangement `priceStay`
 * already has with that form, where a second copy of the rule in the browser
 * is exactly what would drift.
 *
 * `none` returns a null discount rather than an error: no discount is the
 * ordinary case, and the control opens on it.
 *
 * What this does NOT check is whether the discount is affordable — that needs
 * a subtotal, and `resolveDiscount` owns it. This is the parse; that is the
 * rule.
 */
export function parseDiscount(values: DiscountFormValues): ParsedDiscount {
  if (values.kind === 'none') {
    return { ok: true, discount: null }
  }

  if (values.kind !== 'amount' && values.kind !== 'percent') {
    return {
      ok: false,
      error: { field: 'discountKind', message: 'Choose a discount type.' },
    }
  }

  const value =
    values.kind === 'percent' ? percentFromInput(values.value) : centsFromInput(values.value)

  if (value === null || value <= 0) {
    return {
      ok: false,
      error: {
        field: 'discountValue',
        message:
          values.kind === 'percent'
            ? 'Enter a whole percentage between 1 and 100.'
            : 'Enter an amount like 40.00.',
      },
    }
  }

  const reason = values.reason.trim()

  if (reason.length === 0) {
    return {
      ok: false,
      error: { field: 'discountReason', message: 'Say why this booking is being discounted.' },
    }
  }

  if (reason.length > MAX_DISCOUNT_REASON_LENGTH) {
    return {
      ok: false,
      error: {
        field: 'discountReason',
        message: `Keep the reason under ${MAX_DISCOUNT_REASON_LENGTH} characters.`,
      },
    }
  }

  return { ok: true, discount: { kind: values.kind, value, reason } }
}

/**
 * A whole percentage, or null.
 *
 * Rejects rather than repairs, like `centsFromInput`: `10%`, `ten` and `10.5`
 * all come back as null so the form can say what it did not understand.
 * Fractions of a percent are refused because the value is stored as an
 * integer — allowing one would round it away in silence.
 */
function percentFromInput(value: string): number | null {
  const trimmed = value.trim()

  if (!/^\d{1,3}$/.test(trimmed)) {
    return null
  }

  const percent = Number(trimmed)

  return percent >= 1 && percent <= 100 ? percent : null
}
