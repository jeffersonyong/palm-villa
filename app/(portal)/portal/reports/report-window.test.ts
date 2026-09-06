import { describe, expect, test } from 'vitest'

import { readReportWindow } from './report-window'

const TODAY = '2026-09-16'

describe('readReportWindow', () => {
  test('opens on this month to date when nothing is chosen', () => {
    // Not the whole month: a period padded with days that have not happened
    // would divide occupancy by nights nobody could have slept.
    expect(readReportWindow(undefined, undefined, TODAY)).toEqual({
      window: { from: '2026-09-01', to: '2026-09-16' },
      isExplicit: false,
    })
  })

  test('takes a period out of the URL', () => {
    expect(readReportWindow('2026-08-01', '2026-08-31', TODAY)).toEqual({
      window: { from: '2026-08-01', to: '2026-08-31' },
      isExplicit: true,
    })
  })

  test('falls back to the default rather than inventing a period from half a pair', () => {
    for (const pair of [
      ['2026-08-01', undefined],
      [undefined, '2026-08-31'],
      ['2026-08-31', '2026-08-01'],
      ['August', '2026-08-31'],
    ] as const) {
      expect(readReportWindow(pair[0], pair[1], TODAY).isExplicit).toBe(false)
    }
  })

  test('a period the reader chose that happens to be the default is still explicit', () => {
    // It has an address somebody can send on, and a Clear control that works.
    expect(readReportWindow('2026-09-01', '2026-09-16', TODAY).isExplicit).toBe(true)
  })
})
