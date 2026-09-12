/**
 * Revenue by stream, over a period (prd.md §14, capability E5).
 *
 * ── What "revenue" means here [A] ─────────────────────────────────────────
 *
 * Money received: verified payments, on the day the money was actually seen.
 * Not booking totals — a total is what a stay was quoted at, it moves when the
 * booking is amended (prd.md §9.6), and a report built on it would state
 * income the bank has never held. prd.md §10.7 already took this position for
 * the balance: "only verified payments count — a promised transfer is not
 * money", and this is the same sentence read across a period rather than
 * against one booking.
 *
 * The consequence worth stating: this is a CASH-BASIS figure. A stay paid for
 * in August and taken in September is August's revenue. That is the basis
 * Finance reconciles against and the one that agrees with the cash-up next
 * door; an accrual figure spreading a stay across its nights is a different
 * report, and nobody has asked for one.
 *
 * ── Which day a payment lands on [A] ──────────────────────────────────────
 *
 * Cash by the day it was collected, in Brunei — the clerk was holding the
 * notes, and `collected_at` is the moment they took them.
 *
 * A transfer by `observed_on`: the date the person verifying it read off the
 * bank. That is the day the money arrived, which is rarely the day somebody
 * got round to checking. `observed_on` is nullable — verify_payment() takes it
 * as an optional parameter — so a transfer without one falls back to the day
 * it was verified. The fallback is named rather than silent, because a run of
 * payments dated by when a clerk was at their desk is a legitimate thing for
 * the owner to notice.
 *
 * ── Security deposits, and the one that counts ────────────────────────────
 *
 * A deposit that is held is not here, and neither is one given back: prd.md
 * §11 makes a deposit a refundable liability rather than income, and the
 * excess a guest settles when charges exceed it "settles no booking and
 * appears in no cash-up" (20260906000100). Both have their own ledger.
 *
 * **A deposit that is kept is here** (prd.md §9.5, 22 September 2026). A
 * guest who cancels or never arrives forfeits it, and money the business keeps
 * stops being a liability. It counts on the day it was **kept** — the
 * cancellation or the no-show — in the stream its booking belonged to. That is
 * open-questions.md N32's standing assumption, built on and still open for the
 * accountant to confirm.
 *
 * It counts in its stream and in the total, and **in no method column**. The
 * notes went into the drawer, or the transfer into the bank, when the deposit
 * was taken — often weeks earlier — so putting it under Cash on the day it was
 * kept would make that column disagree with the cash-up beside it, which
 * counts cash on the day it was collected. Its own column says what it is.
 *
 * Tenancies produce nothing here and will until phase three: a lease is an
 * occupancy row with no booking and no payments (architecture.md §5.1), so the
 * stream is reported at zero with the reason on the screen rather than omitted.
 *
 * Pure and I/O-free.
 */

import { dateInBrunei, type StayDate } from '../dates'
import type { PaymentMethod, PaymentStatus } from '../payment'
import { BOOKING_STREAMS, type BookingStream } from '../stream'
import type { Cents } from '../money'

/** A payment, reduced to what dating and grouping it needs. */
export interface RevenueSource {
  stream: BookingStream
  method: PaymentMethod
  status: PaymentStatus
  /** Null until somebody has observed the money (architecture.md §5.1). */
  amount: Cents | null
  collectedAt: string | null
  observedOn: StayDate | null
  verifiedAt: string | null
}

/** A payment that has been dated and belongs in the period. */
export interface DatedRevenue extends RevenueSource {
  amount: Cents
  date: StayDate
}

/** A security deposit kept when its booking closed, reduced to what dating it needs. */
export interface KeptDepositSource {
  stream: BookingStream
  /** What was kept: everything held, which is less than the quote for a short deposit. */
  amount: Cents
  /** The moment the booking closed and the deposit stopped being owed back. */
  keptAt: string
}

/** A kept deposit that has been dated and belongs in the period. */
export interface DatedKeptDeposit extends KeptDepositSource {
  date: StayDate
}

export type RevenueByMethod = Record<PaymentMethod, Cents>

export interface StreamRevenue {
  stream: BookingStream
  /** Payments only. A kept deposit is in no method column — see the header. */
  byMethod: RevenueByMethod
  keptDeposits: Cents
  /** Payments and kept deposits together. */
  total: Cents
  /** How many payments. */
  count: number
  /** How many kept deposits. */
  keptCount: number
}

export interface RevenueMatrix {
  byStream: readonly StreamRevenue[]
  byMethod: RevenueByMethod
  keptDeposits: Cents
  total: Cents
  count: number
  keptCount: number
}

/**
 * The Brunei day a payment's money belongs to, or null if it has none.
 *
 * A payment that is not verified has no date here at all — it is a promise,
 * not money — which is what keeps the rule in one place rather than half in a
 * filter and half in a sum.
 */
export function revenueDateOf(payment: RevenueSource): StayDate | null {
  if (payment.status !== 'verified' || payment.amount === null) {
    return null
  }

  if (payment.method === 'cash') {
    return payment.collectedAt ? dateInBrunei(payment.collectedAt) : null
  }

  if (payment.observedOn) {
    return payment.observedOn
  }

  return payment.verifiedAt ? dateInBrunei(payment.verifiedAt) : null
}

/**
 * The payments whose money landed inside the window, dated.
 *
 * Both ends inclusive, matching every date filter a staff member picks off a
 * calendar (components/portal/list-params.ts).
 */
export function revenueInWindow(
  payments: readonly RevenueSource[],
  window: { from: StayDate; to: StayDate },
): readonly DatedRevenue[] {
  return payments.flatMap((payment) => {
    const date = revenueDateOf(payment)

    if (date === null || payment.amount === null || date < window.from || date > window.to) {
      return []
    }

    return [{ ...payment, amount: payment.amount, date }]
  })
}

/**
 * The kept deposits whose booking closed inside the window, dated by the
 * Brunei day it closed. Both ends inclusive, like `revenueInWindow`.
 */
export function keptDepositsInWindow(
  deposits: readonly KeptDepositSource[],
  window: { from: StayDate; to: StayDate },
): readonly DatedKeptDeposit[] {
  return deposits.flatMap((deposit) => {
    const date = dateInBrunei(deposit.keptAt)

    return date < window.from || date > window.to ? [] : [{ ...deposit, date }]
  })
}

/**
 * The matrix the screen renders: every stream against every method, with the
 * deposits kept in its own column.
 *
 * Every stream is present even at zero, in BOOKING_STREAMS order. A report
 * that dropped an empty row would answer "how did day passes do" with silence,
 * and silence reads as a bug rather than as a nil.
 */
export function revenueByStream(
  payments: readonly DatedRevenue[],
  kept: readonly DatedKeptDeposit[] = [],
): RevenueMatrix {
  const byStream = BOOKING_STREAMS.map((stream) => {
    const rows = payments.filter((payment) => payment.stream === stream)
    const keptRows = kept.filter((deposit) => deposit.stream === stream)
    const keptDeposits = sumAmounts(keptRows)

    return {
      stream,
      byMethod: totalByMethod(rows),
      keptDeposits,
      total: sumAmounts(rows) + keptDeposits,
      count: rows.length,
      keptCount: keptRows.length,
    }
  })

  const keptDeposits = sumAmounts(kept)

  return {
    byStream,
    byMethod: totalByMethod(payments),
    keptDeposits,
    total: sumAmounts(payments) + keptDeposits,
    count: payments.length,
    keptCount: kept.length,
  }
}

function totalByMethod(payments: readonly DatedRevenue[]): RevenueByMethod {
  return {
    cash: sumAmounts(payments.filter((payment) => payment.method === 'cash')),
    bank_transfer: sumAmounts(payments.filter((payment) => payment.method === 'bank_transfer')),
  }
}

function sumAmounts(rows: readonly { amount: Cents }[]): Cents {
  return rows.reduce((total, row) => total + row.amount, 0)
}
