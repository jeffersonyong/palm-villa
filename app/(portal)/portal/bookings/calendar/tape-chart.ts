import { bookingStatusTone } from '@/components/portal/booking-status-badge'
import type { StatusTone } from '@/components/portal/status-tone'
import { unitStatusTone } from '@/components/portal/unit-status-badge'
import {
  daysInMonth,
  firstDayOfMonth,
  shiftMonth,
  WEEKDAYS,
  type CalendarMonth,
} from '@/components/ui/calendar-month'
import type { CalendarOccupancy } from '@/lib/db/calendar'
import type { Unit } from '@/lib/db/inventory'
import type { DateRange } from '@/lib/domain/availability'
import { addDays, nightsBetween, type StayDate } from '@/lib/domain/dates'
import type { BookingStream } from '@/lib/domain/stream'
import type { OccupancyStatus } from '@/lib/domain/unit-status'

/**
 * A month of occupancy laid out as a tape chart (capability B1, the calendar
 * half): one row per unit, one column per night, a bar for everything that
 * holds the unit.
 *
 * Pure, and tested as such. The page reads the facts and hands them here; the
 * grid draws what comes back and decides nothing. That split is the one every
 * paged list and every report on this surface already uses — arithmetic in a
 * plain module beside the component, chrome in the component.
 *
 * ── Nights are half-open ────────────────────────────────────────────────────
 *
 * A stay `[14, 16)` paints the 14th and the 15th; the 16th is free from the
 * moment the range is written, and another stay may start on it in the same
 * unit. That is the exclusion constraint's own convention (architecture.md
 * §5.2), and a bar that reached the check-out column would draw a collision
 * the database permits.
 *
 * ── A bar may run off either edge ───────────────────────────────────────────
 *
 * The window is one month and a stay is not; an open-ended lease has no end at
 * all. A bar records what the window cut off, so the grid can show the cut
 * rather than a stay that appears to start on the first.
 *
 * ── Bars never overlap ──────────────────────────────────────────────────────
 *
 * Capability G1 makes two occupancies on one unit's night structurally
 * impossible, so a row is a plain sequence of free nights and bars. The pass
 * that enforces it here is defensive: a row whose bars overlapped would shift
 * every later cell sideways, and one corrupt row must not misplace a month.
 */

/** Wide enough for a type's group label — "Semi-detached · 6 units" in `micro` — on one line. */
export const UNIT_COLUMN_WIDTH = 200
export const DAY_COLUMN_WIDTH = 32
export const ROW_HEIGHT = 36

export type BarKind = 'booking' | 'lease' | 'out_of_service'

export interface TapeChartBar {
  type: 'bar'
  key: string
  kind: BarKind
  /** 0-based column, inclusive. */
  colStart: number
  /** 0-based column, exclusive; the span is always at least one. */
  colEnd: number
  /** The window cut the start off — the stay began before the month. */
  continuesBefore: boolean
  /** The window cut the end off — the stay runs past the month, or has no end. */
  continuesAfter: boolean
  tone: StatusTone
  /** The guest, the tenant, or "Out of service". */
  label: string
  href: string
  status: OccupancyStatus | 'out_of_service'
  /** Unclipped, for the tooltip. */
  start: StayDate
  /** Unclipped; null for an open-ended lease and for an out-of-service band. */
  end: StayDate | null
  reference: string | null
  stream: BookingStream | null
}

export interface TapeChartFreeNight {
  type: 'free'
  day: StayDate
  column: number
  /**
   * Whether this night could be sold: the reader may create a booking, the
   * night is not behind us, and it is inside the advance-booking window. It is
   * what the grid lets a stay be chosen across.
   */
  sellable: boolean
}

export type TapeChartSegment = TapeChartBar | TapeChartFreeNight

export interface TapeChartColumn {
  day: StayDate
  /** The weekday's short label, Monday-first. */
  weekday: string
  /** A Monday: the week seam is drawn on this column's left edge. */
  startsWeek: boolean
  isToday: boolean
}

export interface TapeChartRow {
  unit: Unit
  segments: readonly TapeChartSegment[]
}

export interface TapeChartGroup {
  typeId: string
  name: string
  rows: readonly TapeChartRow[]
}

export interface TapeChartSummary {
  /** Rows actually drawn. */
  units: number
  /** Every unit the type filter left, drawn or not. */
  totalUnits: number
  bookings: number
  leases: number
  outOfService: number
}

export interface TapeChart {
  month: CalendarMonth
  window: DateRange
  columns: readonly TapeChartColumn[]
  todayColumn: number | null
  groups: readonly TapeChartGroup[]
  summary: TapeChartSummary
}

export interface CreatePolicy {
  /** Whether the reader may start a booking at all — `booking.create`. */
  enabled: boolean
  /** How far ahead a booking may start, in days (config.maxAdvanceBookingDays). */
  maxAdvanceDays: number
}

export interface TapeChartInput {
  month: CalendarMonth
  today: StayDate
  /** In the registry's order (by reference), already narrowed by the page's filter. */
  units: readonly Unit[]
  occupancies: readonly CalendarOccupancy[]
  create: CreatePolicy
  /**
   * Whether to keep a unit with nothing on it this month.
   *
   * Off by default on the screen: forty-eight rows of which six carry a bar
   * is a grid a reader has to scan rather than read, and the question the
   * calendar is opened with is almost always about the six. Required rather
   * than defaulted here so the caller says which grid it is asking for.
   */
  showEmptyUnits: boolean
}

/** The month as a half-open range: its first day to the next month's first day. */
export function monthWindow(month: CalendarMonth): DateRange {
  return { start: firstDayOfMonth(month), end: firstDayOfMonth(shiftMonth(month, 1)) }
}

export function buildTapeChart(input: TapeChartInput): TapeChart {
  const window = monthWindow(input.month)
  const columns = daysInMonth(input.month).map((day) => columnFor(day, input.today))
  const todayIndex = columns.findIndex((column) => column.isToday)

  const byUnit = groupByUnit(input.occupancies)
  const lastCreatableDay = addDays(input.today, input.create.maxAdvanceDays)

  const groups = new Map<string, { name: string; rows: TapeChartRow[] }>()
  const summary = { units: 0, totalUnits: 0, bookings: 0, leases: 0, outOfService: 0 }

  for (const unit of input.units) {
    const bars = barsFor(unit, byUnit.get(unit.id) ?? [], window)

    summary.totalUnits += 1

    for (const bar of bars) {
      if (bar.kind === 'booking') summary.bookings += 1
      else if (bar.kind === 'lease') summary.leases += 1
      else summary.outOfService += 1
    }

    // A unit with nothing on it this month is dropped unless it was asked
    // for. Counted first, so the summary can say what is not being shown —
    // a grid that quietly omits forty rows is worse than a full one.
    if (!input.showEmptyUnits && bars.length === 0) {
      continue
    }

    const segments = segmentsFor(bars, columns, (day) =>
      isSellable(day, input.today, lastCreatableDay, input.create.enabled),
    )

    const group = groups.get(unit.unitTypeId) ?? { name: unit.unitTypeName, rows: [] }
    group.rows.push({ unit, segments })
    groups.set(unit.unitTypeId, group)

    summary.units += 1
  }

  return {
    month: input.month,
    window,
    columns,
    todayColumn: todayIndex === -1 ? null : todayIndex,
    // A Map keeps first-insertion order, so groups come out in the order the
    // registry's reference order first reached each type.
    groups: [...groups].map(([typeId, group]) => ({ typeId, name: group.name, rows: group.rows })),
    summary,
  }
}

// ── Columns ──────────────────────────────────────────────────────────────────

function columnFor(day: StayDate, today: StayDate): TapeChartColumn {
  const weekday = weekdayIndex(day)

  return {
    day,
    weekday: WEEKDAYS[weekday]?.short ?? '',
    startsWeek: weekday === 0,
    isToday: day === today,
  }
}

/** Monday-first, 0–6. The platform counts from Sunday; the grid does not. */
function weekdayIndex(day: StayDate): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
}

// ── Bars ─────────────────────────────────────────────────────────────────────

interface Clip {
  colStart: number
  colEnd: number
  continuesBefore: boolean
  continuesAfter: boolean
}

/**
 * The part of `[start, end)` that falls inside the window, as columns. Null
 * when none of it does — a stay ending on the window's first day, or starting
 * on the day after its last. `YYYY-MM-DD` compares as text.
 */
function clipToWindow(start: StayDate, end: StayDate | null, window: DateRange): Clip | null {
  const clipStart = start > window.start ? start : window.start
  const clipEnd = end === null || end > window.end ? window.end : end

  if (clipStart >= clipEnd) {
    return null
  }

  return {
    colStart: nightsBetween(window.start, clipStart),
    colEnd: nightsBetween(window.start, clipEnd),
    continuesBefore: start < window.start,
    continuesAfter: end === null || end > window.end,
  }
}

function barsFor(
  unit: Unit,
  occupancies: readonly CalendarOccupancy[],
  window: DateRange,
): readonly TapeChartBar[] {
  const bars = occupancies.flatMap((occupancy) => {
    const clip = clipToWindow(occupancy.start, occupancy.end, window)

    return clip ? [occupancyBar(occupancy, unit, clip)] : []
  })

  const since = unit.outOfServiceSince
  const outOfService = since === null ? null : clipToWindow(since, null, window)

  const all =
    since !== null && outOfService ? [...bars, outOfServiceBar(unit, since, outOfService)] : bars

  return withoutOverlap([...all].sort((a, b) => a.colStart - b.colStart))
}

function occupancyBar(occupancy: CalendarOccupancy, unit: Unit, clip: Clip): TapeChartBar {
  const isLease = occupancy.status === 'leased'

  return {
    type: 'bar',
    key: occupancy.id,
    kind: isLease ? 'lease' : 'booking',
    ...clip,
    tone: toneFor(occupancy.status),
    label: occupancy.occupantName,
    // A booking opens its own screen; a lease has none, and the unit's page is
    // where it is managed.
    href: occupancy.booking
      ? `/portal/bookings/${encodeURIComponent(occupancy.booking.reference)}`
      : unitHref(unit),
    status: occupancy.status,
    start: occupancy.start,
    end: occupancy.end,
    reference: occupancy.booking?.reference ?? null,
    stream: occupancy.booking?.stream ?? null,
  }
}

function outOfServiceBar(unit: Unit, since: StayDate, clip: Clip): TapeChartBar {
  return {
    type: 'bar',
    key: `oos:${unit.id}`,
    kind: 'out_of_service',
    ...clip,
    tone: unitStatusTone('out_of_service'),
    label: 'Out of service',
    href: unitHref(unit),
    status: 'out_of_service',
    start: since,
    end: null,
    reference: null,
    stream: null,
  }
}

/**
 * Read off the two badge tables rather than restated: a bar is the badge's
 * colour at row scale, and design.md is normative for both tables.
 */
function toneFor(status: OccupancyStatus): StatusTone {
  return status === 'leased' ? unitStatusTone('leased_long_term') : bookingStatusTone(status)
}

function unitHref(unit: Unit): string {
  return `/portal/units/${encodeURIComponent(unit.ref)}`
}

/**
 * Bars in column order, none overlapping. A later bar that starts under an
 * earlier one is cut to begin where that one ends, and dropped if nothing is
 * left; the cut is recorded as a continuation so the grid still shows it was
 * cut.
 */
function withoutOverlap(sorted: readonly TapeChartBar[]): readonly TapeChartBar[] {
  const kept: TapeChartBar[] = []
  let cursor = 0

  for (const bar of sorted) {
    const colStart = Math.max(bar.colStart, cursor)

    if (colStart >= bar.colEnd) {
      continue
    }

    const next = colStart === bar.colStart ? bar : { ...bar, colStart, continuesBefore: true }
    kept.push(next)
    cursor = next.colEnd
  }

  return kept
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function groupByUnit(
  occupancies: readonly CalendarOccupancy[],
): Map<string, readonly CalendarOccupancy[]> {
  const byUnit = new Map<string, CalendarOccupancy[]>()

  for (const occupancy of occupancies) {
    const list = byUnit.get(occupancy.unitId) ?? []
    list.push(occupancy)
    byUnit.set(occupancy.unitId, list)
  }

  return byUnit
}

/** The row as the grid draws it: every column accounted for, free or barred. */
function segmentsFor(
  bars: readonly TapeChartBar[],
  columns: readonly TapeChartColumn[],
  sellable: (day: StayDate) => boolean,
): readonly TapeChartSegment[] {
  const segments: TapeChartSegment[] = []
  let column = 0

  const freeNight = (index: number): TapeChartFreeNight => {
    const day = columns[index]?.day ?? ''

    return { type: 'free', day, column: index, sellable: sellable(day) }
  }

  for (const bar of bars) {
    for (; column < bar.colStart; column += 1) {
      segments.push(freeNight(column))
    }

    segments.push(bar)
    column = bar.colEnd
  }

  for (; column < columns.length; column += 1) {
    segments.push(freeNight(column))
  }

  return segments
}

/**
 * Whether a night is one the screen would sell.
 *
 * A night in the past cannot be booked, and neither can one past the advance
 * window the booking form itself enforces — so neither may be pointed at here.
 * A reader without `booking.create` sells none of them.
 *
 * This used to build a whole new-booking URL per night, back when a click was
 * a link and bought exactly one night. Choosing a stay now takes two clicks
 * and the hand-off is built once, from the span, when it is confirmed.
 */
function isSellable(
  day: StayDate,
  today: StayDate,
  lastCreatableDay: StayDate,
  enabled: boolean,
): boolean {
  return enabled && day >= today && day <= lastCreatableDay
}
