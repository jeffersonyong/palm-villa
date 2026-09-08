import { describe, expect, test } from 'vitest'

import { WEEKDAYS } from '@/components/ui/calendar-month'
import type { CalendarOccupancy } from '@/lib/db/calendar'
import type { Unit } from '@/lib/db/inventory'
import type { OccupancyStatus } from '@/lib/domain/unit-status'

import {
  buildTapeChart,
  monthWindow,
  type TapeChart,
  type TapeChartBar,
  type TapeChartFreeNight,
  type TapeChartInput,
} from './tape-chart'

const MONTH = '2026-09'
const TODAY = '2026-09-08'

function unit(ref: string, overrides: Partial<Unit> = {}): Unit {
  return {
    id: `unit:${ref}`,
    ref,
    unitTypeId: 'three-bedroom',
    unitTypeName: 'Three-bedroom',
    outOfServiceSince: null,
    ...overrides,
  }
}

function stay(
  unitRef: string,
  start: string,
  end: string,
  overrides: Partial<CalendarOccupancy> & { status?: OccupancyStatus } = {},
): CalendarOccupancy {
  return {
    id: `occ:${unitRef}:${start}`,
    unitId: `unit:${unitRef}`,
    status: 'confirmed',
    start,
    end,
    occupantName: 'Jane Lim',
    booking: { reference: 'PV-0001', stream: 'short_stay' },
    ...overrides,
  }
}

function lease(unitRef: string, start: string, end: string | null): CalendarOccupancy {
  return {
    id: `lease:${unitRef}`,
    unitId: `unit:${unitRef}`,
    status: 'leased',
    start,
    end,
    occupantName: 'Long Tenant',
    booking: null,
  }
}

function chartOf(overrides: Partial<TapeChartInput> = {}): TapeChart {
  return buildTapeChart({
    month: MONTH,
    today: TODAY,
    units: [unit('3B-01')],
    occupancies: [],
    create: { enabled: true, maxAdvanceDays: 62 },
    // The tests above this line are about bars, columns and clipping, and
    // describe rows that mostly hold nothing. The narrowing has its own block.
    showEmptyUnits: true,
    ...overrides,
  })
}

function rowOf(chart: TapeChart, ref: string) {
  const row = chart.groups.flatMap((group) => group.rows).find((row) => row.unit.ref === ref)

  if (!row) {
    throw new Error(`No row for ${ref}`)
  }

  return row
}

function barsOf(chart: TapeChart, ref: string): TapeChartBar[] {
  return rowOf(chart, ref).segments.filter(
    (segment): segment is TapeChartBar => segment.type === 'bar',
  )
}

function freeNightsOf(chart: TapeChart, ref: string): TapeChartFreeNight[] {
  return rowOf(chart, ref).segments.filter(
    (segment): segment is TapeChartFreeNight => segment.type === 'free',
  )
}

describe('monthWindow', () => {
  test('is the month as a half-open range', () => {
    expect(monthWindow('2026-09')).toEqual({ start: '2026-09-01', end: '2026-10-01' })
    expect(monthWindow('2026-12')).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })
})

describe('columns', () => {
  test('one per night of the month', () => {
    expect(chartOf().columns).toHaveLength(30)
    expect(chartOf({ month: '2028-02' }).columns).toHaveLength(29)
  })

  test('knows which columns start a week, Monday-first', () => {
    const columns = chartOf().columns

    // 7 September 2026 is a Monday; the 1st is a Tuesday.
    expect(columns[6]).toMatchObject({ day: '2026-09-07', startsWeek: true })
    expect(columns[6]?.weekday).toBe(WEEKDAYS[0]?.short)
    expect(columns[0]).toMatchObject({ day: '2026-09-01', startsWeek: false })
  })

  test('marks today, and only when it is inside the month', () => {
    expect(chartOf().todayColumn).toBe(7)
    expect(chartOf().columns[7]).toMatchObject({ day: TODAY, isToday: true })
    expect(chartOf({ month: '2026-10' }).todayColumn).toBeNull()
  })
})

describe('painting a stay', () => {
  test('paints the nights and not the check-out day', () => {
    const chart = chartOf({ occupancies: [stay('3B-01', '2026-09-14', '2026-09-16')] })

    expect(barsOf(chart, '3B-01')).toMatchObject([
      { colStart: 13, colEnd: 15, continuesBefore: false, continuesAfter: false },
    ])
  })

  test('cuts a stay that began before the month and says so', () => {
    const chart = chartOf({ occupancies: [stay('3B-01', '2026-08-28', '2026-09-03')] })

    expect(barsOf(chart, '3B-01')).toMatchObject([
      { colStart: 0, colEnd: 2, continuesBefore: true, continuesAfter: false },
    ])
  })

  test('cuts a stay that runs past the month and says so', () => {
    const chart = chartOf({ occupancies: [stay('3B-01', '2026-09-29', '2026-10-03')] })

    expect(barsOf(chart, '3B-01')).toMatchObject([
      { colStart: 28, colEnd: 30, continuesBefore: false, continuesAfter: true },
    ])
  })

  test('fills the month for a stay that spans it', () => {
    const chart = chartOf({ occupancies: [stay('3B-01', '2026-08-01', '2026-11-01')] })

    expect(barsOf(chart, '3B-01')).toMatchObject([
      { colStart: 0, colEnd: 30, continuesBefore: true, continuesAfter: true },
    ])
  })

  test('draws nothing for a stay that only touches the month at an edge', () => {
    const chart = chartOf({
      occupancies: [
        stay('3B-01', '2026-08-28', '2026-09-01'),
        stay('3B-01', '2026-10-01', '2026-10-03'),
      ],
    })

    expect(barsOf(chart, '3B-01')).toHaveLength(0)
    expect(freeNightsOf(chart, '3B-01')).toHaveLength(30)
  })

  test('keeps the unclipped dates for the tooltip', () => {
    const chart = chartOf({ occupancies: [stay('3B-01', '2026-08-28', '2026-10-03')] })

    expect(barsOf(chart, '3B-01')[0]).toMatchObject({
      start: '2026-08-28',
      end: '2026-10-03',
      reference: 'PV-0001',
      stream: 'short_stay',
      label: 'Jane Lim',
    })
  })
})

describe('an open-ended lease', () => {
  test('runs off the right edge with no end', () => {
    const chart = chartOf({ occupancies: [lease('3B-01', '2026-08-15', null)] })

    expect(barsOf(chart, '3B-01')).toMatchObject([
      {
        kind: 'lease',
        colStart: 0,
        colEnd: 30,
        continuesBefore: true,
        continuesAfter: true,
        tone: 'neutral',
        label: 'Long Tenant',
        href: '/portal/units/3B-01',
        end: null,
        reference: null,
        stream: null,
      },
    ])
  })
})

describe('a unit out of service', () => {
  test('carries a band from the day it went out to the end of the month', () => {
    const chart = chartOf({ units: [unit('3B-01', { outOfServiceSince: '2026-09-10' })] })

    expect(barsOf(chart, '3B-01')).toMatchObject([
      {
        kind: 'out_of_service',
        colStart: 9,
        colEnd: 30,
        continuesBefore: false,
        continuesAfter: true,
        tone: 'negative',
        label: 'Out of service',
        href: '/portal/units/3B-01',
        start: '2026-09-10',
      },
    ])
  })

  test('fills the month when it went out before the month began', () => {
    const chart = chartOf({ units: [unit('3B-01', { outOfServiceSince: '2026-08-01' })] })

    expect(barsOf(chart, '3B-01')).toMatchObject([
      { colStart: 0, colEnd: 30, continuesBefore: true },
    ])
  })

  test('shows nothing yet when it goes out after the month', () => {
    const chart = chartOf({ units: [unit('3B-01', { outOfServiceSince: '2026-10-05' })] })

    expect(barsOf(chart, '3B-01')).toHaveLength(0)
  })
})

describe('bars on one row', () => {
  test('back-to-back stays meet at the changeover column', () => {
    const chart = chartOf({
      occupancies: [
        stay('3B-01', '2026-09-05', '2026-09-08', { id: 'a' }),
        stay('3B-01', '2026-09-08', '2026-09-10', { id: 'b' }),
      ],
    })

    const [first, second] = barsOf(chart, '3B-01')

    expect(first).toMatchObject({ key: 'a', colStart: 4, colEnd: 7 })
    expect(second).toMatchObject({ key: 'b', colStart: 7, colEnd: 9 })
  })

  test('never overlap, even from corrupt input', () => {
    const chart = chartOf({
      occupancies: [
        stay('3B-01', '2026-09-08', '2026-09-12', { id: 'later' }),
        stay('3B-01', '2026-09-05', '2026-09-10', { id: 'earlier' }),
        stay('3B-01', '2026-09-06', '2026-09-08', { id: 'swallowed' }),
      ],
    })

    expect(barsOf(chart, '3B-01')).toMatchObject([
      { key: 'earlier', colStart: 4, colEnd: 9 },
      // Cut to begin where the earlier one ends, and marked as cut.
      { key: 'later', colStart: 9, colEnd: 11, continuesBefore: true },
    ])
  })

  test('accounts for every column, free or barred', () => {
    const chart = chartOf({ occupancies: [stay('3B-01', '2026-09-05', '2026-09-08')] })
    const segments = rowOf(chart, '3B-01').segments

    expect(segments).toHaveLength(28)
    expect(freeNightsOf(chart, '3B-01').map((night) => night.column)).toEqual([
      0, 1, 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
      28, 29,
    ])
  })
})

describe('tones and links', () => {
  test('a booking takes the status badge colour and opens the booking', () => {
    const chart = chartOf({
      units: [unit('3B-01'), unit('3B-02'), unit('3B-03'), unit('3B-04')],
      occupancies: [
        stay('3B-01', '2026-09-05', '2026-09-08', { status: 'confirmed' }),
        stay('3B-02', '2026-09-05', '2026-09-08', { status: 'awaiting_payment_verification' }),
        stay('3B-03', '2026-09-05', '2026-09-08', { status: 'checked_in' }),
        stay('3B-04', '2026-09-05', '2026-09-08', { status: 'held' }),
      ],
    })

    expect(barsOf(chart, '3B-01')[0]).toMatchObject({
      tone: 'positive',
      href: '/portal/bookings/PV-0001',
    })
    expect(barsOf(chart, '3B-02')[0]?.tone).toBe('warning')
    expect(barsOf(chart, '3B-03')[0]?.tone).toBe('active')
    // Neutral, from the booking badge's own table — the one place that colour
    // is decided.
    expect(barsOf(chart, '3B-04')[0]?.tone).toBe('neutral')
  })

  test('a unit reference is safe in a path', () => {
    const chart = chartOf({ units: [unit('A/1')], occupancies: [lease('A/1', '2026-09-01', null)] })

    expect(barsOf(chart, 'A/1')[0]?.href).toBe('/portal/units/A%2F1')
  })
})

describe('which free nights a stay may be chosen across', () => {
  test('marks a night that can be sold', () => {
    const night = freeNightsOf(chartOf(), '3B-01').find((n) => n.day === '2026-09-12')

    expect(night?.sellable).toBe(true)
  })

  test('does not offer the past', () => {
    const nights = freeNightsOf(chartOf(), '3B-01')

    expect(nights.find((n) => n.day === '2026-09-07')?.sellable).toBe(false)
    expect(nights.find((n) => n.day === TODAY)?.sellable).toBe(true)
  })

  test('does not offer past the advance-booking window', () => {
    const nights = freeNightsOf(chartOf({ create: { enabled: true, maxAdvanceDays: 10 } }), '3B-01')

    expect(nights.find((n) => n.day === '2026-09-18')?.sellable).toBe(true)
    expect(nights.find((n) => n.day === '2026-09-19')?.sellable).toBe(false)
  })

  test('offers nothing to a reader who cannot create a booking', () => {
    const nights = freeNightsOf(
      chartOf({ create: { enabled: false, maxAdvanceDays: 62 } }),
      '3B-01',
    )

    expect(nights.every((n) => !n.sellable)).toBe(true)
  })
})

describe('groups and summary', () => {
  test('groups units by type in the order the registry first reaches each', () => {
    const chart = chartOf({
      units: [
        unit('3B-01'),
        unit('3B-02'),
        unit('4B-01', { unitTypeId: 'four-bedroom', unitTypeName: 'Four-bedroom' }),
      ],
    })

    expect(chart.groups.map((group) => [group.typeId, group.name, group.rows.length])).toEqual([
      ['three-bedroom', 'Three-bedroom', 2],
      ['four-bedroom', 'Four-bedroom', 1],
    ])
    expect(chart.groups[0]?.rows.map((row) => row.unit.ref)).toEqual(['3B-01', '3B-02'])
  })

  test('counts what is on the chart', () => {
    const chart = chartOf({
      units: [unit('3B-01'), unit('3B-02'), unit('3B-03', { outOfServiceSince: '2026-09-20' })],
      occupancies: [
        stay('3B-01', '2026-09-05', '2026-09-08', { id: 'a' }),
        stay('3B-01', '2026-09-10', '2026-09-12', { id: 'b' }),
        lease('3B-02', '2026-08-01', null),
      ],
    })

    expect(chart.summary).toEqual({
      units: 3,
      totalUnits: 3,
      bookings: 2,
      leases: 1,
      outOfService: 1,
    })
  })
})

describe('units with nothing on them', () => {
  const OCCUPIED = [
    stay('3B-01', '2026-09-05', '2026-09-08', { id: 'a' }),
    lease('3B-02', '2026-08-01', null),
  ]

  const BUILDING = [
    unit('3B-01'),
    unit('3B-02'),
    unit('3B-03'),
    unit('4B-01', { unitTypeId: 'four-bedroom', unitTypeName: 'Four-bedroom' }),
  ]

  test('drops them, keeping the rows that carry a bar', () => {
    // Arrange / Act
    const chart = chartOf({
      units: BUILDING,
      occupancies: OCCUPIED,
      showEmptyUnits: false,
    })

    // Assert
    expect(chart.groups.flatMap((group) => group.rows.map((row) => row.unit.ref))).toEqual([
      '3B-01',
      '3B-02',
    ])
  })

  test('drops a type whose every unit is empty, rather than leaving a bare heading', () => {
    // Arrange / Act
    const chart = chartOf({
      units: BUILDING,
      occupancies: OCCUPIED,
      showEmptyUnits: false,
    })

    // Assert
    expect(chart.groups.map((group) => group.typeId)).toEqual(['three-bedroom'])
  })

  test('says how many units there are, not just how many are drawn', () => {
    // Arrange / Act
    const chart = chartOf({
      units: BUILDING,
      occupancies: OCCUPIED,
      showEmptyUnits: false,
    })

    // Assert — the counts of what is on the chart are unaffected by hiding
    // rows that had nothing on them to count.
    expect(chart.summary).toEqual({
      units: 2,
      totalUnits: 4,
      bookings: 1,
      leases: 1,
      outOfService: 0,
    })
  })

  test('keeps a unit held only by being out of service', () => {
    // Arrange / Act
    const chart = chartOf({
      units: [unit('3B-01'), unit('3B-02', { outOfServiceSince: '2026-09-20' })],
      occupancies: [],
      showEmptyUnits: false,
    })

    // Assert — a closed unit is something happening to it, not an empty row.
    expect(chart.groups.flatMap((group) => group.rows.map((row) => row.unit.ref))).toEqual([
      '3B-02',
    ])
  })

  test('draws the whole building when asked to', () => {
    // Arrange / Act
    const chart = chartOf({
      units: BUILDING,
      occupancies: OCCUPIED,
      showEmptyUnits: true,
    })

    // Assert
    expect(chart.summary.units).toBe(4)
    expect(chart.summary.totalUnits).toBe(4)
  })

  test('a month with nothing in it leaves no rows at all', () => {
    // Arrange / Act
    const chart = chartOf({ units: BUILDING, occupancies: [], showEmptyUnits: false })

    // Assert — the screen has an empty state for this; the chart just says so.
    expect(chart.groups).toEqual([])
    expect(chart.summary.units).toBe(0)
    expect(chart.summary.totalUnits).toBe(4)
  })
})
