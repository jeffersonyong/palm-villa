import { describe, expect, test } from 'vitest'

import { todayInBrunei } from '@/lib/domain/dates'
import { bnd } from '@/lib/domain/money'

import { listCashBankings, recordCashBanking } from './cash-banking'
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
