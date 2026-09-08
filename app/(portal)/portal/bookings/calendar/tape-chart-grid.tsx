'use client'

import { Fragment, memo, useCallback, useEffect, useMemo, useState } from 'react'

import { formatCalendarMonth, formatDayLabel } from '@/components/ui/calendar-month'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
  TableRowHead,
} from '@/components/ui/table'
import { TooltipProvider } from '@/components/ui/tooltip'
import { formatStayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

import { NewBookingDialog, type ChosenNights } from './new-booking-dialog'
import { isWithinSpan, spanFor, stayFor, type NightAnchor, type NightSpan } from './night-selection'
import {
  DAY_COLUMN_WIDTH,
  UNIT_COLUMN_WIDTH,
  type TapeChart,
  type TapeChartRow as Row,
} from './tape-chart'
import { TapeChartBar } from './tape-chart-bar'

/**
 * The tape chart drawn (capability B1, the calendar half).
 *
 * design.md's matrix table over a date axis: a real `<table>` — units are row
 * headers, nights are column headers, a bar is a cell spanning the nights it
 * holds — so the structure a screen reader gets is the structure a sighted
 * reader sees, and a colspan is the exact primitive for a thing that can never
 * overlap its neighbour (G1). Layout is fixed; the unit column is declared and
 * the nights divide what is left.
 *
 * ── Both axes scroll inside the grid, and only the grid ────────────────────
 *
 * Forty-eight rows are taller than a screen, and a row thirty columns wide is
 * unreadable once its date headings have scrolled away. So this is the one
 * table on the surface that is its own scroller vertically as well: header
 * row and unit column both pin, and the body moves beneath them.
 *
 * That makes the height cap load-bearing. The panel is the surface's own
 * scroller, so a grid one pixel too tall gives the screen **two** vertical
 * scrollbars — which it had: the cap was `100dvh - 15rem`, and the chrome it
 * was standing in for measured 254px, so the panel overflowed by 14px and
 * drew a second bar for it.
 *
 * The cap is now the two things actually above and below the grid: `14rem`
 * for the panel header, the page header and the control line, and the
 * panel's own `3xl` foot padding, named rather than folded into the same
 * number so it cannot drift from portal-panel.tsx. There is a little slack
 * in the `14rem` on purpose — the chrome above is *content*, and a
 * description that wraps to a second line at a narrow width would otherwise
 * bring the second scrollbar back. If it ever does grow past the slack the
 * panel simply scrolls a few pixels, which is a small blemish rather than a
 * broken screen.
 *
 * ── Borders are on cells, not rows ──────────────────────────────────────────
 *
 * `border-separate`, because collapsed borders do not travel with a sticky
 * cell: the header's bottom rule and the unit column's seam would stay behind
 * as the body scrolled. In the separate model a row's own border never draws,
 * so every rule here — the row divider, the week seam on each Monday, the day
 * line between them, the header's edge — is a cell's border.
 *
 * ── What is coloured, and what is not ───────────────────────────────────────
 *
 * A free night is uncoloured. Availability is the resting state of a building
 * (design.md — `available` is neutral), and forty-eight rows of green would
 * be a wall in which the four that need attention vanish. Colour is spent on
 * bars. Today is a dot under its numeral, never a column fill, and hover is
 * the row alone — the matrix rule.
 *
 * ── Choosing a stay ─────────────────────────────────────────────────────────
 *
 * A client component for this alone: the first click on a free night marks an
 * arrival, the second marks a departure, and the nights between fill as the
 * pointer moves. The rules are in night-selection.ts and tested there; what
 * lives here is the pointer state and the painting. Rows are memoised and only
 * the one being chosen in is given the selection, so moving the pointer along
 * a row does not re-render the other forty-seven.
 *
 * A night is still not a tab stop — fifteen hundred of them would make the
 * grid impassable by keyboard, and the control line's "New booking" is the
 * same action reachable in one. Bars stay real tab stops, in reading order.
 */

interface TapeChartGridProps {
  chart: TapeChart
}

export function TapeChartGrid({ chart }: TapeChartGridProps) {
  const dayCount = chart.columns.length
  const width = UNIT_COLUMN_WIDTH + DAY_COLUMN_WIDTH * dayCount

  const [anchor, setAnchor] = useState<NightAnchor | null>(null)
  const [pointer, setPointer] = useState<number | null>(null)
  const [chosen, setChosen] = useState<ChosenNights | null>(null)

  // Escape abandons a half-made choice, the way it closes everything else on
  // the surface. Bound while one is in progress and not otherwise.
  useEffect(() => {
    if (anchor === null) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAnchor(null)
        setPointer(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [anchor])

  const clear = useCallback(() => {
    setAnchor(null)
    setPointer(null)
  }, [])

  /**
   * Which nights of the row being chosen in could be sold, as a set.
   *
   * Read once per selection rather than per pointer move: answering it off
   * `row.segments` means a scan per night, and `spanFor` asks about every
   * night in the span every time the pointer moves a column.
   */
  const anchoredRow = useMemo(
    () => (anchor === null ? null : rowById(chart, anchor.unitId)),
    [chart, anchor],
  )

  const sellableNights = useMemo(
    () => (anchoredRow === null ? null : sellableColumnsOf(anchoredRow)),
    [anchoredRow],
  )

  /**
   * A click on a free night. The first sets the arrival; the second sets the
   * departure and asks. Anything that cannot be a departure — the same day,
   * an earlier one, or one across a night already taken — starts again from
   * where it was clicked, which is how an arrival gets corrected.
   *
   * Stable between clicks. It is handed to every row, and a fresh closure on
   * each render would defeat the `memo` on them: pointing at one cell would
   * re-render all forty-eight.
   */
  const select = useCallback(
    (row: Row, column: number) => {
      const restart = () => {
        setAnchor({ unitId: row.unit.id, column })
        setPointer(null)
      }

      if (anchor === null || anchor.unitId !== row.unit.id) {
        restart()

        return
      }

      const span = spanFor(anchor.column, column, (night) =>
        (sellableNights ?? EMPTY_NIGHTS).has(night),
      )

      if (span === null) {
        restart()

        return
      }

      setChosen({
        unit: row.unit,
        ...stayFor(span, (night) => chart.columns[night]?.day ?? ''),
      })
    },
    [anchor, chart, sellableNights],
  )

  const liveSpan =
    anchor === null || pointer === null || sellableNights === null
      ? null
      : spanFor(anchor.column, pointer, (night) => sellableNights.has(night))

  return (
    <TooltipProvider>
      <Table
        scrollX
        scrollY
        containerClassName="max-h-[calc(100dvh-14rem-var(--spacing-3xl))]"
        className="table-fixed border-separate border-spacing-0"
        style={{ minWidth: width }}
      >
        <caption className="sr-only">
          {formatCalendarMonth(chart.month)}, every unit by night
        </caption>

        {/* The unit column is declared; the nights are not, so fixed layout
            divides whatever is left equally between them. `minWidth` above is
            the floor — 32px a night — and below it the container scrolls. A
            declared width on every column left the table at its natural size
            and a quarter of the panel empty to the right of December. */}
        <colgroup>
          <col style={{ width: UNIT_COLUMN_WIDTH }} />
          {chart.columns.map((column) => (
            <col key={column.day} />
          ))}
        </colgroup>

        <TableHeader>
          <TableHeaderRow className="border-b-0">
            <TableHead className="sticky top-0 left-0 z-30 h-11 border-r border-b border-r-divider border-b-border bg-muted px-md align-middle">
              Unit
            </TableHead>

            {chart.columns.map((column, index) => (
              <th
                key={column.day}
                scope="col"
                className={cn(
                  'sticky top-0 z-20 h-11 border-b border-b-border bg-muted p-0 text-center align-middle font-normal',
                  dayRule(column.startsWeek, index),
                )}
              >
                <span className="sr-only">{formatDayLabel(column.day)}</span>
                <span aria-hidden className="relative flex flex-col items-center leading-none">
                  <span className="micro-label text-muted-foreground">{column.weekday}</span>
                  <span className="mt-xxs text-body-sm text-foreground tabular-nums">
                    {Number(column.day.slice(8, 10))}
                  </span>
                  {column.isToday ? (
                    /* The date picker's today mark, out of the flow so the
                       numeral stays where every other numeral is. Held clear
                       of the header's rule rather than sitting on it. */
                    <span className="absolute -bottom-[2px] left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-current opacity-70" />
                  ) : null}
                </span>
              </th>
            ))}
          </TableHeaderRow>
        </TableHeader>

        <TableBody className="divide-y-0">
          {chart.groups.map((group) => (
            <Fragment key={group.typeId}>
              {/* The type's name in the labelling voice, on a band that runs
                  the width of the grid.

                  It was the name on the card fill with air above it, which is
                  the matrix table's group-row grammar — but that grammar is
                  for a table eight columns wide, where a label and a gap are
                  enough to say "a new block starts here". Across thirty night
                  columns the gap read as an empty row and the label as a
                  stray, so a reader scrolled past a type boundary without
                  seeing it. A filled strip is one object the eye can follow
                  all the way out to the last day of the month.

                  Its own tone (`group-band`, globals.css) rather than a
                  borrowed one: the rows are `card`, and `muted` is both the
                  header strip above and a row's hover, so a band in either
                  said "header" rather than "new type". `canvas-sunk` was
                  tried and sits four values off `muted` in light, which is
                  not a distinction anybody can see. */}
              <TableRow className="hover:bg-transparent">
                <TableRowHead
                  scope="rowgroup"
                  className="sticky left-0 z-10 h-8 border-y border-r border-y-divider border-r-divider bg-group-band px-md py-0 micro-label whitespace-nowrap text-muted-foreground"
                >
                  {group.name} · {group.rows.length} {group.rows.length === 1 ? 'unit' : 'units'}
                </TableRowHead>
                <td
                  colSpan={dayCount}
                  className="h-8 border-y border-y-divider bg-group-band p-0"
                />
              </TableRow>

              {group.rows.map((row) => (
                <GridRow
                  key={row.unit.id}
                  row={row}
                  columns={chart.columns}
                  // Only the row being chosen in is told anything about the
                  // choice, so the rest never re-render as the pointer moves.
                  anchorColumn={anchor?.unitId === row.unit.id ? anchor.column : null}
                  span={anchor?.unitId === row.unit.id ? liveSpan : null}
                  onSelect={select}
                  // Only while a stay is being chosen in *this* row, so
                  // ordinary pointer movement over the grid costs no state
                  // update at all. A span never spans two units, so a
                  // neighbouring row has nothing to report anyway.
                  onPoint={anchor?.unitId === row.unit.id ? setPointer : undefined}
                />
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>

      <NewBookingDialog
        chosen={chosen}
        onClose={() => {
          setChosen(null)
          clear()
        }}
      />
    </TooltipProvider>
  )
}

/**
 * One unit's row.
 *
 * Memoised: the grid re-renders on every pointer move along a row being
 * chosen in, and without this that would be forty-eight rows of thirty cells
 * for a change that touches one of them.
 */
const GridRow = memo(function GridRow({
  row,
  columns,
  anchorColumn,
  span,
  onSelect,
  onPoint,
}: {
  row: Row
  columns: TapeChart['columns']
  anchorColumn: number | null
  span: NightSpan | null
  onSelect: (row: Row, column: number) => void
  /** Absent unless a stay is being chosen in this row. */
  onPoint?: (column: number) => void
}) {
  const startsWeek = (column: number) => columns[column]?.startsWeek ?? false

  /**
   * Whether a column is part of what is being chosen — the arrival on its own
   * before a departure is picked, then every night the stay would hold.
   */
  const isBanded = (column: number) => isWithinSpan(span, column) || anchorColumn === column

  return (
    <TableRow className="group">
      <TableRowHead className="sticky left-0 z-10 h-9 border-t border-r border-t-divider border-r-divider bg-card px-md py-0 font-mono text-foreground tabular-nums group-hover:bg-muted/60">
        {row.unit.ref}
      </TableRowHead>

      {row.segments.map((segment) =>
        segment.type === 'bar' ? (
          <td
            key={segment.key}
            colSpan={segment.colEnd - segment.colStart}
            className={cn(
              'relative h-9 border-t border-t-divider p-0',
              // The week seam only. A night line under a bar would show in the
              // 6px of cell above and below it and cut one stay into a row of
              // boxes.
              startsWeek(segment.colStart) && segment.colStart > 0 && 'border-l border-l-divider',
            )}
          >
            <TapeChartBar bar={segment} />
          </td>
        ) : (
          <FreeNight
            key={segment.day}
            unitRef={row.unit.ref}
            day={segment.day}
            sellable={segment.sellable}
            // The day line is dropped *inside* a band so the nights read as
            // one stay rather than as a row of boxes — the seam at its left
            // edge stays, which is where the arrival is.
            rule={
              isBanded(segment.column) && isBanded(segment.column - 1)
                ? false
                : dayRule(startsWeek(segment.column), segment.column)
            }
            isBanded={isBanded(segment.column)}
            isBandStart={isBanded(segment.column) && !isBanded(segment.column - 1)}
            isBandEnd={isBanded(segment.column) && !isBanded(segment.column + 1)}
            onSelect={() => onSelect(row, segment.column)}
            onPoint={onPoint === undefined ? undefined : () => onPoint(segment.column)}
          />
        ),
      )}
    </TableRow>
  )
})

/**
 * A night nobody holds.
 *
 * Uncoloured at rest and showing a `+` under the pointer, as before. While a
 * stay is being chosen the nights fill with a band at the bar's own geometry —
 * the same 6px inset, the same radius at each end — so what is on screen is
 * the shape of the stay about to be created rather than a row of tinted cells.
 *
 * The band is ink at a tenth rather than `muted`: `muted` *is* `canvas-soft`,
 * which is what the row already fills with on hover, and a selection the same
 * colour as the hover under the pointer that made it is no selection at all.
 * Monochrome, because the operations surfaces are (design.md — two accents,
 * one system), and a choice in progress is not a status.
 *
 * A night that cannot be sold takes no pointer at all rather than refusing
 * one: there is nothing to explain, and a cursor that changes over half the
 * grid is noise.
 */
function FreeNight({
  unitRef,
  day,
  sellable,
  rule,
  isBanded,
  isBandStart,
  isBandEnd,
  onSelect,
  onPoint,
}: {
  unitRef: string
  day: string
  sellable: boolean
  rule: string | false
  isBanded: boolean
  isBandStart: boolean
  isBandEnd: boolean
  onSelect: () => void
  onPoint?: () => void
}) {
  return (
    <td className={cn('relative h-9 border-t border-t-divider p-0', rule)}>
      {sellable ? (
        <button
          type="button"
          // Not a tab stop, and never was: the same reasoning the links it
          // replaced carried. The accessible name still says what a click
          // would start, for a pointer user on a screen reader.
          tabIndex={-1}
          aria-label={`Choose ${formatStayDate(day)}, ${unitRef}`}
          onClick={onSelect}
          onMouseEnter={onPoint}
          onFocus={onPoint}
          className={cn(
            'relative flex h-full w-full cursor-pointer items-center justify-center outline-none',
            // The `+` is a pseudo-element on this button (globals.css) rather
            // than an icon child: there are up to fifteen hundred of these
            // cells, and the mark is invisible until pointed at.
            !isBanded && 'night-plus text-muted-foreground hover:bg-muted',
          )}
        >
          {isBanded ? (
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-y-[6px] right-0 left-0 bg-foreground/10',
                isBandStart && 'left-[2px] rounded-l-md',
                isBandEnd && 'right-[2px] rounded-r-md',
              )}
            />
          ) : null}
        </button>
      ) : null}
    </td>
  )
}

/**
 * A night column's left rule: the Monday seam, or the quieter line between two
 * days of one week.
 *
 * The first column draws neither — the unit column's own right seam is already
 * there, and in the separate border model two touching 1px borders draw a 2px
 * line.
 */
function dayRule(startsWeek: boolean, index: number): string | false {
  if (index === 0) {
    return false
  }

  return startsWeek ? 'border-l border-l-divider' : 'border-l border-l-grid-line'
}

/** The row a selection belongs to. */
function rowById(chart: TapeChart, unitId: string): Row {
  const row = chart.groups.flatMap((group) => group.rows).find((each) => each.unit.id === unitId)

  if (!row) {
    // Only reachable if the chart changed under a selection, which clears it.
    throw new Error(`No row for unit ${unitId}`)
  }

  return row
}

/** Shared by every row with no selection in it, so none allocates its own. */
const EMPTY_NIGHTS: ReadonlySet<number> = new Set()

/** The columns of a row that are free and could be sold. */
function sellableColumnsOf(row: Row): ReadonlySet<number> {
  const nights = new Set<number>()

  for (const segment of row.segments) {
    if (segment.type === 'free' && segment.sellable) {
      nights.add(segment.column)
    }
  }

  return nights
}
