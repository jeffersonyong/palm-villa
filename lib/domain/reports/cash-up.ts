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
 * ── The variance ──────────────────────────────────────────────────────────
 *
 * `banked − recorded`, so the sign reads the way a bank statement does:
 * negative means money has not reached the bank yet, positive means more went
 * in than this day accounts for. Neither is an error the product can resolve —
 * it is a question for the person who was there — so the state names it and
 * stops.
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
 * Where a day's reconciliation stands.
 *
 * `nothing` is its own state rather than a balanced day with two zeroes: a day
 * the desk took no cash and a day somebody has squared away are different
 * facts, and only one of them is worth reading.
 */
export const CASH_UP_STATES = ['nothing', 'unbanked', 'balanced', 'short', 'over'] as const

export type CashUpState = (typeof CASH_UP_STATES)[number]

export const CASH_UP_STATE_LABELS: Record<CashUpState, string> = {
  nothing: 'No cash',
  unbanked: 'Not banked',
  balanced: 'Balanced',
  short: 'Short',
  over: 'Over',
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
  /** `banked − recorded`. Negative means the bank has less than the day took. */
  variance: Cents
  state: CashUpState
}

export interface CashUpTotals {
  recorded: Cents
  depositCash: Cents
  banked: Cents
  variance: Cents
}

/** Where a day stands, from its two figures. */
export function cashUpStateOf(recorded: Cents, banked: Cents): CashUpState {
  if (recorded === 0 && banked === 0) {
    return 'nothing'
  }

  if (banked === 0) {
    return 'unbanked'
  }

  if (banked === recorded) {
    return 'balanced'
  }

  return banked < recorded ? 'short' : 'over'
}

export interface CashUpInput {
  payments: readonly CashCollection[]
  deposits: readonly CashCollection[]
  bankings: readonly Banking[]
}

/**
 * Every day in the window, newest first.
 *
 * Every day, including the quiet ones: a cash-up is read to confirm that
 * nothing was missed, and a list that silently omitted the days with no rows
 * would answer "was anything taken on the 4th" by not mentioning the 4th.
 */
export function cashUpDays(window: StayWindow, input: CashUpInput): readonly CashUpDay[] {
  return daysIn(window)
    .map((date) => {
      const payments = input.payments.filter((row) => dateInBrunei(row.collectedAt) === date)
      const deposits = input.deposits.filter((row) => dateInBrunei(row.collectedAt) === date)
      const bankings = input.bankings.filter((row) => row.businessDate === date)

      const recorded = sum(payments)
      const banked = sum(bankings)

      return {
        date,
        recorded,
        paymentCount: payments.length,
        depositCash: sum(deposits),
        depositCount: deposits.length,
        banked,
        bankingCount: bankings.length,
        variance: banked - recorded,
        state: cashUpStateOf(recorded, banked),
      }
    })
    .reverse()
}

/** The window as one line. */
export function cashUpTotals(days: readonly CashUpDay[]): CashUpTotals {
  const recorded = days.reduce((total, day) => total + day.recorded, 0)
  const banked = days.reduce((total, day) => total + day.banked, 0)

  return {
    recorded,
    depositCash: days.reduce((total, day) => total + day.depositCash, 0),
    banked,
    variance: banked - recorded,
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
