import { describe, expect, test } from 'vitest'

import { bnd } from '../money'
import { cashUpDays, cashUpStateOf, cashUpTotals, clampWindowToToday } from './cash-up'

const WINDOW = { from: '2026-09-04', to: '2026-09-06' } as const

const NOTHING = { payments: [], deposits: [], bankings: [] }

describe('cashUpStateOf', () => {
  test('a day with neither figure is quiet, not balanced', () => {
    // A day nobody took cash on and a day somebody squared away are different
    // facts, and only one of them is worth reading.
    expect(cashUpStateOf(0, 0)).toBe('nothing')
  })

  test('names each way a day can stand', () => {
    expect(cashUpStateOf(bnd(200), 0)).toBe('unbanked')
    expect(cashUpStateOf(bnd(200), bnd(200))).toBe('balanced')
    expect(cashUpStateOf(bnd(200), bnd(150))).toBe('short')
    expect(cashUpStateOf(bnd(200), bnd(260))).toBe('over')
  })

  test('money banked against a day that recorded none is over, not balanced', () => {
    expect(cashUpStateOf(0, bnd(200))).toBe('over')
  })
})

describe('cashUpDays', () => {
  test('every day in the window is present, newest first', () => {
    expect(cashUpDays(WINDOW, NOTHING).map((day) => day.date)).toEqual([
      '2026-09-06',
      '2026-09-05',
      '2026-09-04',
    ])
  })

  test('a quiet day is listed rather than omitted', () => {
    const days = cashUpDays(WINDOW, NOTHING)

    expect(days.every((day) => day.state === 'nothing')).toBe(true)
  })

  test('a payment is placed on its Brunei day, not its UTC one', () => {
    // 16:30Z on the 4th is already half past midnight on the 5th at the desk.
    const days = cashUpDays(WINDOW, {
      ...NOTHING,
      payments: [{ collectedAt: '2026-09-04T16:30:00Z', amount: bnd(200) }],
    })

    expect(days.find((day) => day.date === '2026-09-05')?.recorded).toBe(bnd(200))
    expect(days.find((day) => day.date === '2026-09-04')?.recorded).toBe(0)
  })

  test('a banking is placed by its business date, whenever it was recorded', () => {
    const days = cashUpDays(WINDOW, {
      ...NOTHING,
      bankings: [{ businessDate: '2026-09-04', amount: bnd(200) }],
    })

    expect(days.find((day) => day.date === '2026-09-04')).toMatchObject({
      banked: bnd(200),
      bankingCount: 1,
      variance: bnd(200),
      state: 'over',
    })
  })

  test('two runs on one day are one banked figure', () => {
    const days = cashUpDays(WINDOW, {
      ...NOTHING,
      payments: [{ collectedAt: '2026-09-04T02:00:00Z', amount: bnd(300) }],
      bankings: [
        { businessDate: '2026-09-04', amount: bnd(100) },
        { businessDate: '2026-09-04', amount: bnd(200) },
      ],
    })

    expect(days.find((day) => day.date === '2026-09-04')).toMatchObject({
      banked: bnd(300),
      bankingCount: 2,
      state: 'balanced',
    })
  })

  test('a short day carries a negative variance, so the sign reads like a statement', () => {
    const days = cashUpDays(WINDOW, {
      ...NOTHING,
      payments: [{ collectedAt: '2026-09-05T02:00:00Z', amount: bnd(200) }],
      bankings: [{ businessDate: '2026-09-05', amount: bnd(150) }],
    })

    expect(days.find((day) => day.date === '2026-09-05')).toMatchObject({
      variance: bnd(-50),
      state: 'short',
    })
  })

  test('cash deposits are counted beside the total and never added to it', () => {
    // prd.md §11: a deposit is a liability, not takings — but the notes are in
    // the same drawer, so the clerk counting it has to be told they are there.
    const days = cashUpDays(WINDOW, {
      ...NOTHING,
      payments: [{ collectedAt: '2026-09-06T02:00:00Z', amount: bnd(200) }],
      deposits: [{ collectedAt: '2026-09-06T02:30:00Z', amount: bnd(100) }],
      bankings: [{ businessDate: '2026-09-06', amount: bnd(200) }],
    })

    expect(days.find((day) => day.date === '2026-09-06')).toMatchObject({
      recorded: bnd(200),
      depositCash: bnd(100),
      depositCount: 1,
      state: 'balanced',
    })
  })

  test('a single-day window is one day', () => {
    expect(cashUpDays({ from: '2026-09-06', to: '2026-09-06' }, NOTHING)).toHaveLength(1)
  })
})

describe('cashUpTotals', () => {
  test('sums both sides and states the difference once', () => {
    const days = cashUpDays(WINDOW, {
      payments: [
        { collectedAt: '2026-09-04T02:00:00Z', amount: bnd(200) },
        { collectedAt: '2026-09-06T02:00:00Z', amount: bnd(100) },
      ],
      deposits: [{ collectedAt: '2026-09-04T02:00:00Z', amount: bnd(100) }],
      bankings: [{ businessDate: '2026-09-04', amount: bnd(250) }],
    })

    expect(cashUpTotals(days)).toEqual({
      recorded: bnd(300),
      depositCash: bnd(100),
      banked: bnd(250),
      variance: bnd(-50),
    })
  })
})

describe('clampWindowToToday', () => {
  test('cuts the future off a window that runs past today', () => {
    expect(clampWindowToToday({ from: '2026-09-01', to: '2026-09-30' }, '2026-09-06')).toEqual({
      from: '2026-09-01',
      to: '2026-09-06',
    })
  })

  test('leaves a window that has already happened alone', () => {
    const past = { from: '2026-08-01', to: '2026-08-31' }

    expect(clampWindowToToday(past, '2026-09-06')).toEqual(past)
  })

  test('a window entirely in the future has nothing to cash up', () => {
    expect(clampWindowToToday({ from: '2026-09-07', to: '2026-09-14' }, '2026-09-06')).toBeNull()
  })
})
