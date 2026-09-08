import type { Route } from 'next'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { Fragment } from 'react'

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

import { DAY_COLUMN_WIDTH, UNIT_COLUMN_WIDTH, type TapeChart } from './tape-chart'
import { TapeChartBar } from './tape-chart-bar'

/**
 * The tape chart drawn (capability B1, the calendar half).
 *
 * design.md's matrix table over a date axis: a real `<table>` — units are row
 * headers, nights are column headers, a bar is a cell spanning the nights it
 * holds — so the structure a screen reader gets is the structure a sighted
 * reader sees, and a colspan is the exact primitive for a thing that can never
 * overlap its neighbour (G1). Layout is fixed and the container takes its
 * width from the declared columns, which is what lets the identifying column
 * pin while the nights scroll.
 *
 * ── Both axes scroll inside the grid ────────────────────────────────────────
 *
 * Forty-eight rows are taller than a screen, and a row thirty columns wide is
 * unreadable once its date headings have scrolled away. So this is the one
 * table on the surface that is its own scroller vertically as well: header
 * row and unit column both pin, and the body moves beneath them. The height
 * cap below is the panel's header, the page header and the control line —
 * roughly 15rem — which leaves the grid the rest of the viewport.
 *
 * ── Borders are on cells, not rows ──────────────────────────────────────────
 *
 * `border-separate`, because collapsed borders do not travel with a sticky
 * cell: the header's bottom rule and the unit column's seam would stay behind
 * as the body scrolled. In the separate model a row's own border never draws,
 * so every rule here — the row divider, the week seam on each Monday, the
 * header's edge — is a cell's border.
 *
 * ── What is coloured, and what is not ───────────────────────────────────────
 *
 * A free night is uncoloured. Availability is the resting state of a building
 * (design.md — `available` is neutral), and forty-eight rows of green would
 * be a wall in which the four that need attention vanish. Colour is spent on
 * bars. Today is a dot under its numeral, never a column fill, and hover is
 * the row alone — the matrix rule.
 *
 * A free night that can still be sold is a link to the new-booking screen
 * with the night filled in. It is not a tab stop: fifteen hundred of them would
 * make the grid impassable by keyboard, and the same action is the control
 * line's "New booking". Bars stay real tab stops, in reading order.
 */

interface TapeChartGridProps {
  chart: TapeChart
}

export function TapeChartGrid({ chart }: TapeChartGridProps) {
  const dayCount = chart.columns.length
  const width = UNIT_COLUMN_WIDTH + DAY_COLUMN_WIDTH * dayCount

  const startsWeek = (column: number) => chart.columns[column]?.startsWeek ?? false

  return (
    <TooltipProvider>
      <Table
        scrollX
        scrollY
        containerClassName="max-h-[calc(100dvh-15rem)]"
        className="w-auto table-fixed border-separate border-spacing-0"
        style={{ width }}
      >
        <caption className="sr-only">
          {formatCalendarMonth(chart.month)}, every unit by night
        </caption>

        <colgroup>
          <col style={{ width: UNIT_COLUMN_WIDTH }} />
          {chart.columns.map((column) => (
            <col key={column.day} style={{ width: DAY_COLUMN_WIDTH }} />
          ))}
        </colgroup>

        <TableHeader>
          <TableHeaderRow className="border-b-0">
            <TableHead className="sticky top-0 left-0 z-30 h-11 border-r border-b border-r-divider border-b-border bg-muted px-md align-middle">
              Unit
            </TableHead>

            {chart.columns.map((column) => (
              <th
                key={column.day}
                scope="col"
                className={cn(
                  'sticky top-0 z-20 h-11 border-b border-b-border bg-muted p-0 text-center align-middle font-normal',
                  column.startsWeek && 'border-l border-l-divider',
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
                       numeral stays where every other numeral is. */
                    <span className="absolute -bottom-[5px] left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-current opacity-70" />
                  ) : null}
                </span>
              </th>
            ))}
          </TableHeaderRow>
        </TableHeader>

        <TableBody className="divide-y-0">
          {chart.groups.map((group, groupIndex) => (
            <Fragment key={group.typeId}>
              {/* The type's name in the labelling voice, on white — the matrix's
                  group row. The first sits closer to the header strip so the
                  two do not double their air. */}
              <TableRow className="hover:bg-transparent">
                <TableRowHead
                  scope="rowgroup"
                  className={cn(
                    'sticky left-0 z-10 border-r border-r-divider bg-card px-md pb-xs micro-label whitespace-nowrap text-muted-foreground',
                    groupIndex === 0 ? 'pt-md' : 'pt-lg',
                  )}
                >
                  {group.name} · {group.rows.length} {group.rows.length === 1 ? 'unit' : 'units'}
                </TableRowHead>
                <td
                  colSpan={dayCount}
                  className={cn('pb-xs', groupIndex === 0 ? 'pt-md' : 'pt-lg')}
                />
              </TableRow>

              {group.rows.map((row) => (
                <TableRow key={row.unit.id} className="group">
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
                          startsWeek(segment.colStart) && 'border-l border-l-divider',
                        )}
                      >
                        <TapeChartBar bar={segment} />
                      </td>
                    ) : (
                      <td
                        key={segment.day}
                        className={cn(
                          'h-9 border-t border-t-divider p-0',
                          startsWeek(segment.column) && 'border-l border-l-divider',
                        )}
                      >
                        {segment.createHref ? (
                          <Link
                            href={segment.createHref as Route}
                            prefetch={false}
                            tabIndex={-1}
                            aria-label={`New booking, ${row.unit.ref}, ${formatStayDate(segment.day)}`}
                            className="flex h-full w-full items-center justify-center text-muted-foreground opacity-0 transition-opacity duration-150 hover:opacity-100 motion-reduce:transition-none"
                          >
                            <Plus className="size-3" aria-hidden />
                          </Link>
                        ) : null}
                      </td>
                    ),
                  )}
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </TooltipProvider>
  )
}
