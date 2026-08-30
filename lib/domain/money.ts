/**
 * Money.
 *
 * All amounts in this system are integer cents in BND (architecture.md §5.1).
 * Floats are never used for money: 0.1 + 0.2 !== 0.3, and a booking total that
 * is a cent out is a reconciliation problem for a human, not a rounding detail.
 *
 * The type alias is documentation, not enforcement — TypeScript will not stop
 * a raw number being passed. The convention is that any variable holding money
 * is named `...Cents`.
 */

/** An amount in BND cents. Always an integer. */
export type Cents = number

/** Multiplier between the major unit (BND) and the minor unit (cents). */
const CENTS_PER_BND = 100

/**
 * Converts a whole-BND figure to cents.
 *
 * Every rate in prd.md §7.1 and §8 is quoted as a whole number of dollars, so
 * this is the only conversion the pricing engine needs.
 */
export function bnd(amount: number): Cents {
  if (!Number.isInteger(amount)) {
    throw new Error(
      `bnd() takes whole Brunei dollars, received ${amount}. Express sub-dollar amounts in cents directly.`,
    )
  }

  return amount * CENTS_PER_BND
}

/** The most minor units a typed amount may carry. BND has two. */
const TYPED_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/

/**
 * Parses an amount a staff member typed, in BND, to cents.
 *
 * `bnd()` refuses anything that is not whole dollars, which is right for the
 * rate table — every price in prd.md §7.1 is a round figure — but wrong for a
 * payment: a clerk records what was actually transferred or counted, and that
 * routinely has cents in it.
 *
 * Returns null rather than throwing, and rejects rather than repairs: a
 * grouping comma, a currency symbol, a minus sign or a third decimal place all
 * come back as null so the form can say what it did not understand. Guessing
 * at "1,0O0" is how a payment gets recorded at the wrong amount.
 */
export function centsFromInput(value: string): Cents | null {
  const trimmed = value.trim()

  if (!TYPED_AMOUNT_PATTERN.test(trimmed)) {
    return null
  }

  const [major, minor = ''] = trimmed.split('.')

  return Number(major) * CENTS_PER_BND + Number(minor.padEnd(2, '0'))
}

/** Sums a list of amounts. */
export function sumCents(amounts: readonly Cents[]): Cents {
  return amounts.reduce((total, amount) => total + amount, 0)
}

/**
 * Formats an amount for display, e.g. `442.00`.
 *
 * Deliberately excludes the currency word or symbol. The client writes prices
 * as "$" but means BND (prd.md, assumption A1), so the unit is spelled out in
 * the surrounding copy — "BND 442.00" — rather than rendered as an ambiguous
 * dollar sign.
 */
export function formatCents(amount: Cents): string {
  const isNegative = amount < 0
  const absolute = Math.abs(amount)
  const major = Math.floor(absolute / CENTS_PER_BND)
  const minor = absolute % CENTS_PER_BND

  return `${isNegative ? '-' : ''}${major.toLocaleString('en-GB')}.${String(minor).padStart(2, '0')}`
}
