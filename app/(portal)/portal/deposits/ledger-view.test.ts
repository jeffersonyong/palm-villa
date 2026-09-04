import { describe, expect, test } from 'vitest'

import { bnd } from '@/lib/domain/money'
import type { DepositStage } from '@/lib/domain/deposit'

import {
  countByStage,
  DEFAULT_LEDGER_VIEW,
  filterHeld,
  HELD_STAGES,
  isArchiveView,
  LEDGER_VIEWS,
  owedTotalOf,
  readHeldStages,
  readLedgerView,
  sortForLedger,
  totalsOf,
} from './ledger-view'

/**
 * What the ledger shows, and in what order.
 *
 * Colocated with the screen and tested for the reason `history-page.ts` is:
 * it turns a string somebody may have typed into which query runs, and it
 * decides the order Finance works in.
 */

const row = (
  stage: DepositStage,
  end: string | null,
  collectedAt = '2026-09-01T00:00:00Z',
  start = '2026-08-25',
  identity = { bookingReference: 'PV-4821', guestName: 'Lim Wei', unitRef: '3B-04' },
) => ({
  stage,
  collectedAt,
  bookingReference: identity.bookingReference,
  guestName: identity.guestName,
  stay: end === null ? null : { unitRef: identity.unitRef, range: { start, end } },
})

const everything = { stages: [], window: null, search: null } as const

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

  test('a stage is a filter now, not a view', () => {
    // `?show=in_house` was how the tiles narrowed the ledger before the Stage
    // chip existed. An old bookmark opens the ledger whole rather than erroring.
    expect(readLedgerView('in_house')).toBe('held')
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

  test('held is read whole and narrowed here', () => {
    expect(isArchiveView('held')).toBe(false)
  })
})

describe('readHeldStages', () => {
  test('the three held stages, in pipeline order, and never released', () => {
    expect(HELD_STAGES).toEqual(['in_house', 'awaiting_inspection', 'ready_for_release'])
    expect(readHeldStages(['ready_for_release', 'in_house'])).toEqual([
      'in_house',
      'ready_for_release',
    ])
  })

  test('released is the archive, not a stage of something held', () => {
    expect(readHeldStages('released')).toEqual([])
    expect(readHeldStages(['released', 'in_house'])).toEqual(['in_house'])
  })

  test('nothing asked for is every stage', () => {
    expect(readHeldStages(undefined)).toEqual([])
  })
})

describe('filterHeld', () => {
  const deposits = [
    row('in_house', '2026-09-10'),
    row('awaiting_inspection', '2026-09-02'),
    row('ready_for_release', '2026-09-01'),
  ]

  test('no filter keeps everything', () => {
    expect(filterHeld(deposits, everything)).toHaveLength(3)
  })

  test('a stage keeps only that stage, and two stages keep both', () => {
    expect(
      filterHeld(deposits, { stages: ['awaiting_inspection'], window: null, search: null }),
    ).toEqual([deposits[1]])
    expect(
      filterHeld(deposits, {
        stages: ['in_house', 'ready_for_release'],
        window: null,
        search: null,
      }).map((deposit) => deposit.stage),
    ).toEqual(['in_house', 'ready_for_release'])
  })

  test('a stage nothing is in produces the empty state rather than everything', () => {
    // The filter has to be able to come back with nothing, or the URL would
    // lie about what is on screen.
    expect(
      filterHeld([row('in_house', '2026-09-10')], {
        stages: ['ready_for_release'],
        window: null,
        search: null,
      }),
    ).toHaveLength(0)
  })

  test('a stay window keeps the stays that touch it', () => {
    // All three stays begin 25 August. A window on the first week of
    // September touches the two that run past the 1st; the stay that ends
    // on the 1st checked out that morning and does not.
    const visible = filterHeld(deposits, {
      stages: [],
      window: { from: '2026-09-01', to: '2026-09-07' },
      search: null,
    })

    expect(visible.map((deposit) => deposit.stage)).toEqual(['in_house', 'awaiting_inspection'])
  })

  test('a deposit with no stay cannot answer a question about dates', () => {
    expect(
      filterHeld([row('in_house', null)], {
        stages: [],
        window: { from: '2026-09-01', to: '2026-09-07' },
        search: null,
      }),
    ).toHaveLength(0)
  })

  test('stage and window narrow together', () => {
    expect(
      filterHeld(deposits, {
        stages: ['awaiting_inspection'],
        window: { from: '2026-09-01', to: '2026-09-07' },
        search: null,
      }),
    ).toEqual([deposits[1]])
  })

  test('a search answers by reference, guest or unit, whatever the case', () => {
    const tan = row('in_house', '2026-09-10', undefined, undefined, {
      bookingReference: 'PV-9001',
      guestName: 'Tan Mei',
      unitRef: '2A-02',
    })
    const both = [...deposits, tan]

    expect(filterHeld(both, { stages: [], window: null, search: 'tan' })).toEqual([tan])
    expect(filterHeld(both, { stages: [], window: null, search: '2a-' })).toEqual([tan])
    expect(filterHeld(both, { stages: [], window: null, search: 'pv-48' })).toHaveLength(3)
  })

  test('a deposit with no stay still answers a search by its booking or guest', () => {
    const noStay = row('in_house', null)

    expect(filterHeld([noStay], { stages: [], window: null, search: 'lim' })).toEqual([noStay])
    expect(filterHeld([noStay], { stages: [], window: null, search: '3b-04' })).toEqual([])
  })

  test('does not mutate what it was given', () => {
    const original = [row('in_house', '2026-09-10')]

    filterHeld(original, everything)

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
