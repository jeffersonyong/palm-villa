import { describe, expect, it } from 'vitest'

import { palmVillaConfig } from './config'
import { extrasFromLines, line, totalOf } from './lines'
import { priceStay } from './pricing/stay'

describe('totalOf', () => {
  it('sums the line amounts', () => {
    const lines = [line('sofa_bed', 'Sofa bed', 2, 2800), line('late_check_out', 'Late', 1, 1500)]

    expect(totalOf(lines)).toBe(7100)
  })

  it('is zero for no lines', () => {
    expect(totalOf([])).toBe(0)
  })
})

/**
 * The amend form has to prefill "how many sofa beds, how many late hours" from
 * a booking that stores neither: they exist only as booking_line quantities.
 * These tests pin the round trip, because a silent drift here reprices a
 * booking without anyone asking for a change.
 */
describe('extrasFromLines', () => {
  it('reads the quantities back off the lines the pricing engine produced', () => {
    const priced = priceStay(
      {
        unitTypeId: 'three-bedroom',
        checkIn: '2026-09-14',
        checkOut: '2026-09-17',
        party: { chargeableGuests: 4, exemptGuests: 1 },
        sofaBeds: 2,
        earlyCheckInHours: 0,
        lateCheckOutHours: 3,
      },
      palmVillaConfig,
      '2026-09-01',
    )

    if (!priced.ok) {
      throw new Error(`Expected a price, got ${priced.error.code}`)
    }

    expect(extrasFromLines(priced.lines)).toEqual({
      sofaBeds: 2,
      earlyCheckInHours: 0,
      lateCheckOutHours: 3,
    })
  })

  it('reports zero for extras the booking never bought', () => {
    const accommodationOnly = [line('accommodation', '3-bedroom — 1 night', 1, 20000)]

    expect(extrasFromLines(accommodationOnly)).toEqual({
      sofaBeds: 0,
      earlyCheckInHours: 0,
      lateCheckOutHours: 0,
    })
  })

  it('ignores lines that are not extras', () => {
    const lines = [
      line('accommodation', '3-bedroom — 2 nights', 2, 20000),
      // extra_person quantity is people × nights, not an extra the form collects.
      line('extra_person', 'Extra guests', 4, 700),
      line('sofa_bed', 'Sofa beds', 1, 2800),
    ]

    expect(extrasFromLines(lines)).toEqual({
      sofaBeds: 1,
      earlyCheckInHours: 0,
      lateCheckOutHours: 0,
    })
  })
})
