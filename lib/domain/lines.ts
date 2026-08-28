import { sumCents, type Cents } from './money'

/**
 * Booking lines.
 *
 * prd.md §8: "Pricing is a line-item calculation, never a single stored price.
 * Every booking produces itemised BookingLine records that sum to a total."
 *
 * The engine therefore returns lines, and the total is always derived by
 * summing them. Nothing stores a total that was not built this way, which is
 * what makes a price explainable to a guest disputing it.
 */

export type BookingLineType =
  | 'accommodation'
  | 'extra_person'
  | 'sofa_bed'
  | 'early_check_in'
  | 'late_check_out'
  | 'day_pass'
  | 'day_pass_bundle'

export interface BookingLine {
  type: BookingLineType
  /** Human-readable, shown to staff and guests verbatim. */
  description: string
  quantity: number
  unitPrice: Cents
  /** Always `quantity * unitPrice`; stored so a line is self-contained. */
  amount: Cents
}

/** Builds a line, deriving the amount so it can never disagree with its parts. */
export function line(
  type: BookingLineType,
  description: string,
  quantity: number,
  unitPrice: Cents,
): BookingLine {
  return { type, description, quantity, unitPrice, amount: quantity * unitPrice }
}

/** Sums lines to a booking total. */
export function totalOf(lines: readonly BookingLine[]): Cents {
  return sumCents(lines.map((entry) => entry.amount))
}
