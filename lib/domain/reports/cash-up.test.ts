import { describe, expect, test } from 'vitest'

import { bnd } from '../money'
import { cashUpDays, cashUpStateOf, cashUpTotals, clampWindowToToday } from './cash-up'

const WINDOW = { from: '2026-09-04', to: '2026-09-06' } as const

const NOTHING = { payments: [], deposits: [], bankings: [] }

describe('cashUpStateOf', () => {
  test('nothing left unbanked is clear', () => {
    expect(cashUpStateOf(0)).toBe('clear')
  })

  test('cash still on hand is the ordinary state, not a fault', () => {
    // A business that banks twice a week is holding cash most days. Flagging
    // that as a problem is how a warning stops being read.
    expect(cashUpStateOf(bnd(650))).toBe('holding')
  })

  test('more banked than was ever recorded is the one arithmetic can call wrong', () => {
    // Either a payment went unrecorded or a banking was entered twice.
    expect(cashUpStateOf(bnd(-50))).toBe('over_banked')
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

    expect(days).toHaveLength(3)
    expect(days.every((day) => day.state === 'clear')).toBe(true)
  })

  test('a quiet day carries the balance forward unchanged', () => {
    // The point of a running figure: nothing happened, and what was in the
    // safe yesterday is still in the safe today.
    const days = cashUpDays(WINDOW, NOTHING, bnd(400))

    expect(days.map((day) => day.balance)).toEqual([bnd(400), bnd(400), bnd(400)])
  })

  test('an opening balance is carried in rather than assumed to be zero', () => {
    // A window starting on the 1st inherits whatever last week left unbanked.
    const days = cashUpDays(WINDOW, {
      ...NOTHING,
      payments: [{ collectedAt: '2026-09-04T02:00:00Z', amount: bnd(100) }],
    })

    expect(days.find((day) => day.date === '2026-09-04')?.balance).toBe(bnd(100))

    const carried = cashUpDays(
      WINDOW,
      { ...NOTHING, payments: [{ collectedAt: '2026-09-04T02:00:00Z', amount: bnd(100) }] },
      bnd(250),
    )

    expect(carried.find((day) => day.date === '2026-09-04')?.balance).toBe(bnd(350))
  })

  test('one lump sum clears a week of takings, whichever days they came from', () => {
    // The case the per-day variance got wrong: three days of cash, banked in a
    // single trip on the fourth. Nothing has to be matched day to day, and the
    // balance returns to zero.
    const days = cashUpDays(
      { from: '2026-09-01', to: '2026-09-04' },
      {
        deposits: [],
        payments: [
          { collectedAt: '2026-09-01T02:00:00Z', amount: bnd(300) },
          { collectedAt: '2026-09-02T02:00:00Z', amount: bnd(250) },
          { collectedAt: '2026-09-03T02:00:00Z', amount: bnd(100) },
        ],
        bankings: [{ businessDate: '2026-09-04', amount: bnd(650) }],
      },
    )

    expect(days.map((day) => [day.date, day.balance, day.state])).toEqual([
      ['2026-09-04', 0, 'clear'],
      ['2026-09-03', bnd(650), 'holding'],
      ['2026-09-02', bnd(550), 'holding'],
      ['2026-09-01', bnd(300), 'holding'],
    ])
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
      balance: bnd(-200),
      state: 'over_banked',
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
      balance: 0,
      state: 'clear',
    })
  })

  test('banking part of a day leaves the rest on the balance', () => {
    const days = cashUpDays(WINDOW, {
      ...NOTHING,
      payments: [{ collectedAt: '2026-09-05T02:00:00Z', amount: bnd(200) }],
      bankings: [{ businessDate: '2026-09-05', amount: bnd(150) }],
    })

    expect(days.find((day) => day.date === '2026-09-05')).toMatchObject({
      balance: bnd(50),
      state: 'holding',
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
      balance: 0,
      state: 'clear',
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
      opening: 0,
      closing: bnd(50),
    })
  })

  test('the closing figure is the newest row, so the tile and the table agree', () => {
    const days = cashUpDays(
      WINDOW,
      { ...NOTHING, payments: [{ collectedAt: '2026-09-05T02:00:00Z', amount: bnd(80) }] },
      bnd(120),
    )

    expect(cashUpTotals(days, bnd(120))).toMatchObject({
      opening: bnd(120),
      closing: days[0]?.balance,
    })
    expect(cashUpTotals(days, bnd(120)).closing).toBe(bnd(200))
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
