import { describe, expect, test } from 'vitest'

import { bnd } from '@/lib/domain/money'
import type { DepositStage } from '@/lib/domain/deposit'

import {
  countByStage,
  DEFAULT_LEDGER_VIEW,
  filterHeld,
  isArchiveView,
  LEDGER_VIEWS,
  owedTotalOf,
  readLedgerView,
  sortForLedger,
  stageFor,
  totalsOf,
} from './ledger-view'

/**
 * What the ledger shows, and in what order.
 *
 * Colocated with the screen and tested for the reason `history-window.ts` is:
 * it turns a string somebody may have typed into which query runs, and it
 * decides the order Finance works in.
 */

const row = (stage: DepositStage, end: string | null, collectedAt = '2026-09-01T00:00:00Z') => ({
  stage,
  collectedAt,
  stay: end === null ? null : { range: { end } },
})

describe('readLedgerView', () => {
  test.each(LEDGER_VIEWS)('%s is read back as itself', (view) => {
    expect(readLedgerView(view)).toBe(view)
  })

  test('nothing asked for is what the ledger is actually about', () => {
    expect(readLedgerView(undefined)).toBe(DEFAULT_LEDGER_VIEW)
    expect(DEFAULT_LEDGER_VIEW).toBe('held')
  })

  test('a hand-edited URL narrows the screen or is ignored, never breaks it', () => {
    expect(readLedgerView('nonsense')).toBe('held')
    expect(readLedgerView('')).toBe('held')
  })

  test('a repeated param takes the first value', () => {
    // Next gives an array when a param appears twice; the alternative is
    // deciding a screen cannot render because a link was built twice.
    expect(readLedgerView(['owed', 'released'])).toBe('owed')
  })
})

describe('isArchiveView', () => {
  test('released and owed read the archive, which pages in the database', () => {
    expect(isArchiveView('released')).toBe(true)
    expect(isArchiveView('owed')).toBe(true)
  })

  test('every held view is read whole and narrowed here', () => {
    expect(isArchiveView('held')).toBe(false)
    expect(isArchiveView('in_house')).toBe(false)
    expect(isArchiveView('awaiting_inspection')).toBe(false)
    expect(isArchiveView('ready_for_release')).toBe(false)
  })
})

describe('stageFor', () => {
  test('the three stage views name their stage', () => {
    expect(stageFor('in_house')).toBe('in_house')
    expect(stageFor('ready_for_release')).toBe('ready_for_release')
  })

  test('held is every stage, so it names none', () => {
    expect(stageFor('held')).toBeNull()
  })

  test('owed is a fact about a released deposit, not a stage', () => {
    expect(stageFor('owed')).toBeNull()
  })
})

describe('filterHeld', () => {
  const deposits = [
    row('in_house', '2026-09-10'),
    row('awaiting_inspection', '2026-09-02'),
    row('ready_for_release', '2026-09-01'),
  ]

  test('held keeps everything', () => {
    expect(filterHeld(deposits, 'held')).toHaveLength(3)
  })

  test('a stage view keeps only that stage', () => {
    const visible = filterHeld(deposits, 'awaiting_inspection')

    expect(visible).toHaveLength(1)
    expect(visible[0]?.stage).toBe('awaiting_inspection')
  })

  test('a stage nothing is in produces the empty state rather than everything', () => {
    // The filter has to be able to come back with nothing, or the URL would
    // lie about what is on screen.
    expect(filterHeld([row('in_house', '2026-09-10')], 'ready_for_release')).toHaveLength(0)
  })

  test('does not mutate what it was given', () => {
    const original = [row('in_house', '2026-09-10')]

    filterHeld(original, 'held')

    expect(original).toHaveLength(1)
  })
})

describe('sortForLedger', () => {
  test('what can be done now comes before what is waiting on somebody else', () => {
    // A work queue, not a register: the newest arrival at the top would bury
    // the deposit that has been ready longest.
    const sorted = sortForLedger([
      row('in_house', '2026-09-20'),
      row('awaiting_inspection', '2026-09-12'),
      row('ready_for_release', '2026-09-15'),
    ])

    expect(sorted.map((deposit) => deposit.stage)).toEqual([
      'ready_for_release',
      'awaiting_inspection',
      'in_house',
    ])
  })

  test('within a stage, the one waiting longest is first', () => {
    const sorted = sortForLedger([
      row('ready_for_release', '2026-09-15'),
      row('ready_for_release', '2026-09-02'),
      row('ready_for_release', '2026-09-09'),
    ])

    expect(sorted.map((deposit) => deposit.stay?.range.end)).toEqual([
      '2026-09-02',
      '2026-09-09',
      '2026-09-15',
    ])
  })

  test('a deposit with no stay falls back to when it was taken', () => {
    const sorted = sortForLedger([
      row('in_house', null, '2026-09-20T00:00:00Z'),
      row('in_house', null, '2026-09-01T00:00:00Z'),
    ])

    expect(sorted[0]?.collectedAt).toBe('2026-09-01T00:00:00Z')
  })

  test('does not mutate what it was given', () => {
    const original = [row('in_house', '2026-09-20'), row('ready_for_release', '2026-09-15')]

    sortForLedger(original)

    expect(original[0]?.stage).toBe('in_house')
  })
})

describe('totalsOf', () => {
  test('counts and sums what is held', () => {
    expect(totalsOf([{ amount: bnd(100) }, { amount: bnd(100) }])).toEqual({
      count: 2,
      amount: bnd(200),
    })
  })

  test('nothing held is nothing owed back', () => {
    expect(totalsOf([])).toEqual({ count: 0, amount: 0 })
  })
})

describe('owedTotalOf', () => {
  test('sums what guests still owe', () => {
    expect(owedTotalOf([{ figures: { owed: bnd(30) } }, { figures: { owed: bnd(20) } }])).toBe(
      bnd(50),
    )
  })

  test('nothing owed is zero', () => {
    expect(owedTotalOf([])).toBe(0)
  })
})

describe('countByStage', () => {
  test('every stage is present, including the ones at zero', () => {
    // A tile that vanishes at zero makes the strip's width jump as the day
    // goes on, and "nothing is waiting on Housekeeping" is worth showing.
    const counts = countByStage([row('in_house', null), row('in_house', null)])

    expect(counts).toEqual({
      in_house: 2,
      awaiting_inspection: 0,
      ready_for_release: 0,
      released: 0,
    })
  })
})
