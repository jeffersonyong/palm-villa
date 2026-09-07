import { describe, expect, test } from 'vitest'

import { todayInBrunei } from '@/lib/domain/dates'
import { bnd } from '@/lib/domain/money'

import { cashOnHandBefore, listCashBankings, recordCashBanking } from './cash-banking'
import { givenBooking } from './test/factory'
import { auditEventsFor } from './test/inspect'

/**
 * Banking cash, against the real database (capability E4).
 *
 * What these prove is that the record cannot be made dishonest: an amount that
 * is not money, a day that has not happened, and a note that would not fit are
 * all refused by the database rather than by the form — and a correction adds
 * a row rather than moving one, which is what makes the day's variance a fact
 * somebody can be asked about.
 */

const TODAY = todayInBrunei()
const YESTERDAY = todayInBrunei(new Date(Date.now() - 86_400_000))
const TOMORROW = todayInBrunei(new Date(Date.now() + 86_400_000))

function window(from: string, to: string) {
  return { from, to }
}

describe('recordCashBanking', () => {
  test('records the banking and its audit event', async () => {
    const result = await recordCashBanking({
      businessDate: TODAY,
      amount: bnd(250),
      note: 'Morning run to BIBD',
      actorId: null,
    })

    expect(result.ok).toBe(true)

    if (!result.ok) return

    const events = await auditEventsFor(result.bankingId)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      action: 'cash.banked',
      before: null,
      after: { business_date: TODAY, amount_cents: bnd(250), note: 'Morning run to BIBD' },
    })
  })

  test('a blank note is stored as no note rather than as an empty one', async () => {
    const result = await recordCashBanking({
      businessDate: TODAY,
      amount: bnd(100),
      note: '   ',
      actorId: null,
    })

    expect(result.ok).toBe(true)

    const [banking] = await listCashBankings(window(TODAY, TODAY))

    expect(banking?.note).toBeNull()
  })

  test('refuses a day that has not happened', async () => {
    const tomorrow = todayInBrunei(new Date(Date.now() + 86_400_000))

    const result = await recordCashBanking({
      businessDate: tomorrow,
      amount: bnd(100),
      note: null,
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'future_date' } })
    expect(await listCashBankings(window(tomorrow, tomorrow))).toEqual([])
  })

  test('refuses an amount that is not money', async () => {
    for (const amount of [0, bnd(-50)]) {
      const result = await recordCashBanking({
        businessDate: TODAY,
        amount,
        note: null,
        actorId: null,
      })

      expect(result).toMatchObject({ ok: false, error: { code: 'invalid_amount' } })
    }
  })

  test('refuses a note longer than the column allows', async () => {
    const result = await recordCashBanking({
      businessDate: TODAY,
      amount: bnd(100),
      note: 'x'.repeat(281),
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'note_too_long' } })
  })

  test('a second banking on a day is a second row, never an update', async () => {
    // The whole point of append-only: a correction moves the day's variance and
    // leaves both entries readable, rather than rewriting what somebody did.
    await recordCashBanking({ businessDate: TODAY, amount: bnd(100), note: null, actorId: null })
    await recordCashBanking({ businessDate: TODAY, amount: bnd(60), note: null, actorId: null })

    const bankings = await listCashBankings(window(TODAY, TODAY))

    expect(bankings).toHaveLength(2)
    expect(bankings.reduce((total, row) => total + row.amount, 0)).toBe(bnd(160))
  })
})

describe('listCashBankings', () => {
  test('returns the window’s days, oldest first, and nothing outside it', async () => {
    await recordCashBanking({ businessDate: TODAY, amount: bnd(100), note: null, actorId: null })
    await recordCashBanking({
      businessDate: YESTERDAY,
      amount: bnd(200),
      note: null,
      actorId: null,
    })

    const both = await listCashBankings(window(YESTERDAY, TODAY))

    expect(both.map((row) => row.businessDate)).toEqual([YESTERDAY, TODAY])
    expect(await listCashBankings(window(TODAY, TODAY))).toHaveLength(1)
  })
})

describe('cashOnHandBefore', () => {
  test('is nothing when no cash has ever been taken', async () => {
    expect(await cashOnHandBefore(TODAY)).toBe(0)
  })

  test('counts cash taken before the day and leaves that day itself out', async () => {
    // The opening balance of a window is what happened *before* it. Including
    // the day itself would double-count every figure the table then shows.
    await givenBooking({ unitRef: '3B-01', checkIn: '2026-11-02', checkOut: '2026-11-04' })

    expect(await cashOnHandBefore(TODAY)).toBe(0)
    expect(await cashOnHandBefore(TOMORROW)).toBeGreaterThan(0)
  })

  test('a banking reduces what is on hand, and the two net off', async () => {
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-11-02',
      checkOut: '2026-11-04',
    })

    await recordCashBanking({
      businessDate: TODAY,
      amount: booking.total,
      note: null,
      actorId: null,
    })

    expect(await cashOnHandBefore(TOMORROW)).toBe(0)
  })

  test('one lump sum clears several days of takings', async () => {
    // The case a per-day variance got wrong: cash taken across bookings, all
    // of it banked in a single trip, nothing matched day to day.
    const first = await givenBooking({
      unitRef: '3B-01',
      checkIn: '2026-11-02',
      checkOut: '2026-11-04',
    })
    const second = await givenBooking({
      unitRef: '3B-02',
      checkIn: '2026-11-02',
      checkOut: '2026-11-04',
    })

    await recordCashBanking({
      businessDate: TODAY,
      amount: first.total + second.total,
      note: 'One trip',
      actorId: null,
    })

    expect(await cashOnHandBefore(TOMORROW)).toBe(0)
  })

  test('banking more than was taken goes negative rather than clamping', async () => {
    // Over-banked is a real state and the figure has to be able to express it,
    // or the one arithmetic error this screen can catch reads as balanced.
    await recordCashBanking({
      businessDate: TODAY,
      amount: bnd(500),
      note: null,
      actorId: null,
    })

    expect(await cashOnHandBefore(TOMORROW)).toBe(bnd(-500))
  })
})
