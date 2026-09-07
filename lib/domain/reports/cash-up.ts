/**
 * The daily cash-up (prd.md §10.5, §14; capability E4).
 *
 * "Provide a daily cash-up view comparing recorded cash against banked
 * amounts." Two figures per business day, and the difference between them.
 *
 * ── What is recorded [A] ──────────────────────────────────────────────────
 *
 * Cash BOOKING payments, on the Brunei day they were collected. Not transfers,
 * which never pass through the drawer, and not the security deposits taken the
 * same afternoon: prd.md §11 makes a deposit a refundable liability rather
 * than takings, and banking one as revenue would put a figure the business owes
 * back into the day it earned. The deposits are still *counted* and shown
 * beside the total, because the notes are physically in the same drawer and a
 * clerk counting it needs to know why it holds more than the cash-up says. The
 * excess a guest settles when charges run past their deposit is excluded on
 * the same reasoning, and 20260906000100 said so when it was built: it
 * "settles no booking and appears in no cash-up".
 *
 * Whether the deposits belong inside the total is N27 — it is a real question
 * about how Finance counts a drawer, and the answer moves one line here.
 *
 * ── What is banked ────────────────────────────────────────────────────────
 *
 * The `cash_banking` rows filed against that business day. A day's cash may go
 * to the bank in two runs, or the next morning; what ties them to the day is
 * the business date on the record, not when the trip happened.
 *
 * ── The running balance, and why it is not a per-day variance [A] ─────────
 *
 * The first cut reconciled each day on its own: `banked − recorded`, a
 * variance per row. That is only correct for a desk that banks every day it
 * takes cash, and this one does not — an evening's notes go in the next
 * morning, and a quiet week goes in on one trip. Under a per-day rule that
 * trip left four days reading "Not banked" and the fifth "Over" by four days'
 * takings, and squaring it would have meant splitting one deposit slip across
 * five rows by hand. A reconciliation that makes the ordinary week look broken
 * is one nobody will keep up.
 *
 * So a day carries a **balance brought forward**: everything taken, less
 * everything banked, from the day the building opened. One lump sum clears
 * whatever has built up, whichever days it came from, and no row has to be
 * matched to another. The figure the screen leads with — what should be in the
 * safe right now — is then the one thing here a person can verify directly, by
 * counting it.
 *
 * The window's own `recorded` and `banked` totals still answer §10.5's
 * "recorded cash against banked amounts" for the period; what moved is that
 * the *day* is no longer the unit of reconciliation.
 *
 * Nothing here is stored. A day's reconciliation is a consequence of three sets
 * of rows, and storing it would be storing a second copy of a fact that can
 * still move (a banking recorded late changes yesterday's answer, correctly).
 * That is architecture.md §5.1's position on `unit.status` and a deposit's
 * stage, applied a third time.
 *
 * Pure and I/O-free.
 */

import { addDays, dateInBrunei, nightsBetween, type StayDate, type StayWindow } from '../dates'
import type { Cents } from '../money'

/**
 * Where the money stands at the end of a day — a statement about the balance
 * carried forward, not about that day's own two figures.
 *
 * `holding` is the ordinary state of a business that banks twice a week, so it
 * is deliberately unremarkable: cash in the safe is not a problem to be
 * flagged. `over_banked` is the one that is wrong in a way arithmetic can
 * prove — more has gone to the bank than was ever recorded as taken, which
 * means a payment went unrecorded or a banking was entered twice.
 */
export const CASH_UP_STATES = ['clear', 'holding', 'over_banked'] as const

export type CashUpState = (typeof CASH_UP_STATES)[number]

export const CASH_UP_STATE_LABELS: Record<CashUpState, string> = {
  clear: 'Clear',
  holding: 'In safe',
  over_banked: 'Over-banked',
}

/** A cash payment, reduced to what the day's arithmetic needs. */
export interface CashCollection {
  collectedAt: string
  amount: Cents
}

/** A banking, filed against the day the cash was taken. */
export interface Banking {
  businessDate: StayDate
  amount: Cents
}

export interface CashUpDay {
  date: StayDate
  recorded: Cents
  paymentCount: number
  /** Cash security deposits taken that day. Reported, never added. */
  depositCash: Cents
  depositCount: number
  banked: Cents
  bankingCount: number
  /**
   * Cash taken and not yet banked at the end of this day, carried forward from
   * every day before it. This is the figure a person can check by opening the
   * safe.
   */
  balance: Cents
  state: CashUpState
}

export interface CashUpTotals {
  recorded: Cents
  depositCash: Cents
  banked: Cents
  /** What was already unbanked before the window began. */
  opening: Cents
  /** What is unbanked at the end of it — `opening + recorded − banked`. */
  closing: Cents
}

/** What a carried balance says about where the money is. */
export function cashUpStateOf(balance: Cents): CashUpState {
  if (balance === 0) {
    return 'clear'
  }

  return balance > 0 ? 'holding' : 'over_banked'
}

export interface CashUpInput {
  payments: readonly CashCollection[]
  deposits: readonly CashCollection[]
  bankings: readonly Banking[]
}

/**
 * Every day in the window, newest first, each carrying the balance as it stood
 * at the end of that day.
 *
 * Every day, including the quiet ones: a cash-up is read to confirm that
 * nothing was missed, and a list that silently omitted the days with no rows
 * would answer "was anything taken on the 4th" by not mentioning the 4th. A
 * quiet day is not empty here either — it carries the balance forward
 * unchanged, which is the whole point of a running figure.
 *
 * `opening` is what was unbanked before the window began. It has to be passed
 * in rather than assumed to be zero: a window starting on the 1st inherits
 * whatever the last week of the previous month left in the safe, and starting
 * every period from zero would report the balance as low by exactly the amount
 * nobody had banked yet.
 *
 * Accumulated forwards and reversed once at the end, because a running total
 * has a direction and the screen reads the other way.
 */
export function cashUpDays(
  window: StayWindow,
  input: CashUpInput,
  opening: Cents = 0,
): readonly CashUpDay[] {
  let balance = opening

  return daysIn(window)
    .map((date) => {
      const payments = input.payments.filter((row) => dateInBrunei(row.collectedAt) === date)
      const deposits = input.deposits.filter((row) => dateInBrunei(row.collectedAt) === date)
      const bankings = input.bankings.filter((row) => row.businessDate === date)

      const recorded = sum(payments)
      const banked = sum(bankings)

      balance = balance + recorded - banked

      return {
        date,
        recorded,
        paymentCount: payments.length,
        depositCash: sum(deposits),
        depositCount: deposits.length,
        banked,
        bankingCount: bankings.length,
        balance,
        state: cashUpStateOf(balance),
      }
    })
    .reverse()
}

/**
 * The window as one line.
 *
 * `closing` is read off the newest day rather than re-derived, so the total and
 * the top row of the table cannot disagree — the rule the list screens already
 * follow, where a list and its summary share one predicate.
 */
export function cashUpTotals(days: readonly CashUpDay[], opening: Cents = 0): CashUpTotals {
  const recorded = days.reduce((total, day) => total + day.recorded, 0)
  const banked = days.reduce((total, day) => total + day.banked, 0)

  return {
    recorded,
    depositCash: days.reduce((total, day) => total + day.depositCash, 0),
    banked,
    opening,
    closing: days[0]?.balance ?? opening,
  }
}

/**
 * The window with any future days cut off, or null if none of it has happened.
 *
 * A cash-up for tomorrow is not a thing — the notes have not been taken — and
 * a row of empty future days at the top of the list would push today off the
 * screen. This is also why `record_cash_banking()` refuses a future business
 * date: the two guards say the same thing at the two ends.
 */
export function clampWindowToToday(window: StayWindow, today: StayDate): StayWindow | null {
  if (window.from > today) {
    return null
  }

  return window.to > today ? { from: window.from, to: today } : window
}

function daysIn(window: StayWindow): readonly StayDate[] {
  const count = nightsBetween(window.from, window.to) + 1

  return Array.from({ length: count }, (_, index) => addDays(window.from, index))
}

function sum(rows: readonly { amount: Cents }[]): Cents {
  return rows.reduce((total, row) => total + row.amount, 0)
}
