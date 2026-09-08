import type { Metadata, Route } from 'next'
import { Plus } from 'lucide-react'
import Link from 'next/link'

import { BookingStatusBadge } from '@/components/portal/booking-status-badge'
import { EmptyState } from '@/components/portal/empty-state'
import { readChoices } from '@/components/portal/list-params'
import { PageHeader } from '@/components/portal/page-header'
import { StatusLegend, type StatusLegendItem } from '@/components/portal/status-legend'
import { UnitStatusBadge } from '@/components/portal/unit-status-badge'
import { Button } from '@/components/ui/button'
import { monthOf } from '@/components/ui/calendar-month'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listOccupanciesInWindow } from '@/lib/db/calendar'
import { getUnits } from '@/lib/db/inventory'
import { getPropertyConfig } from '@/lib/db/property-config'
import { todayInBrunei } from '@/lib/domain/dates'

import { CalendarControls } from './calendar-controls'
import { calendarHref, readMonth } from './calendar-params'
import { buildTapeChart, monthWindow, type TapeChartSummary } from './tape-chart'
import { TapeChartGrid } from './tape-chart-grid'

export const metadata: Metadata = {
  title: 'Booking calendar',
}

/**
 * The booking calendar (capability B1, the calendar half).
 *
 * The units board generalised across a date axis, which architecture.md §5.1
 * anticipated: one row per unit, one column per night, a bar for everything
 * that holds the unit. It answers the question the register cannot — not
 * "which bookings exist" but "what is free, and when" — which is the one the
 * desk opens the spreadsheet for.
 *
 * ── What is drawn ───────────────────────────────────────────────────────────
 *
 * Exactly what the exclusion constraint blocks: every booking not expired or
 * cancelled, every lease, and every out-of-service period. That is a wider
 * set than the units board colours — a completed stay whose last night has
 * not arrived is *available* there and a bar here, because the constraint
 * still blocks it. The board's reading is the recorded divergence that the
 * inspection flow (C2–C3) owns (architecture.md §5.2); this screen shows the
 * database's, since a calendar that offered a night the database would refuse
 * is worse than one that looks fuller than the board.
 *
 * Day passes occupy no unit (prd.md §6.1) and are not on the grid; the
 * description says so rather than leaving a reader to wonder where they went.
 *
 * ── Read together ───────────────────────────────────────────────────────────
 *
 * Units, occupancies and the advance-booking window in one `Promise.all`, so
 * rows, bars and which free nights are linked all describe the same moment.
 */

interface PageProps {
  searchParams: Promise<{ month?: string; type?: string | string[] }>
}

export default async function BookingCalendarPage({ searchParams }: PageProps) {
  const params = await searchParams
  const actor = await getActor()

  // Gated per-permission server-side (architecture.md §3), on the permission
  // the register answers to: this is the other half of the same capability.
  if (!actor || !hasPermission(actor.permissions, 'booking.view')) {
    return (
      <>
        <PageHeader title="Booking calendar" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Seeing the calendar needs the "View bookings" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const mayCreate = hasPermission(actor.permissions, 'booking.create')

  const today = todayInBrunei()
  const month = readMonth(params.month, today)
  const window = monthWindow(month)

  const [units, occupancies, config] = await Promise.all([
    getUnits(),
    listOccupanciesInWindow(window),
    getPropertyConfig(),
  ])

  const typeIds = config.unitTypes.map((type) => type.id)
  const isKnownType = (candidate: string): candidate is string => typeIds.includes(candidate)
  const types = readChoices(params.type, typeIds, isKnownType)

  const visibleUnits =
    types.length === 0 ? units : units.filter((unit) => types.includes(unit.unitTypeId))

  const chart = buildTapeChart({
    month,
    today,
    units: visibleUnits,
    occupancies,
    create: { enabled: mayCreate, maxAdvanceDays: config.maxAdvanceBookingDays },
  })

  const unitTypes = config.unitTypes.map((type) => ({ id: type.id, name: type.name }))

  return (
    <>
      <PageHeader
        title="Booking calendar"
        description="Every stay, hold and lease across the building, by unit and by night. Day passes occupy no unit and are not on this grid."
      />

      {/* The control line: what is being shown on the left — the month, then
          the type narrowing — and on the right the count, the key to the
          colours, and the screen's one primary fill. The legend sits here
          rather than on a column header because this grid has no status
          column; the colour *is* the column. */}
      <div className="mt-md flex flex-wrap items-center gap-md">
        <CalendarControls
          month={month}
          todayMonth={monthOf(today)}
          types={types}
          unitTypes={unitTypes}
        />

        <div className="ml-auto flex items-center gap-md">
          <p className="micro-label text-muted-foreground tabular-nums">
            {summaryText(chart.summary)}
          </p>

          <StatusLegend label="What the colours mean" items={LEGEND} />

          {mayCreate ? (
            <Button asChild>
              <Link href="/portal/bookings/new">
                <Plus aria-hidden />
                New booking
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <section aria-label="Booking calendar" className="mt-md">
        {units.length === 0 ? (
          <EmptyState
            title="No units yet"
            description="The building has no units on record. An administrator sets them up on the unit registry screen."
          />
        ) : visibleUnits.length === 0 ? (
          <EmptyState
            title="No units match this filter"
            description="Try a different unit type, or clear the filter to see the whole building."
            action={
              <Button asChild variant="tertiary">
                {/* Keeps the month: the filter is what emptied the grid. */}
                <Link href={calendarHref(month === monthOf(today) ? null : month, []) as Route}>
                  Clear filters
                </Link>
              </Button>
            }
          />
        ) : (
          <TapeChartGrid chart={chart} />
        )}
      </section>
    </>
  )
}

/** "48 units · 7 stays · 1 lease" — a part that is zero is left out. */
function summaryText(summary: TapeChartSummary): string {
  const parts = [
    count(summary.units, 'unit', 'units'),
    summary.bookings > 0 ? count(summary.bookings, 'stay', 'stays') : null,
    summary.leases > 0 ? count(summary.leases, 'lease', 'leases') : null,
    summary.outOfService > 0 ? `${summary.outOfService} out of service` : null,
  ]

  return parts.filter((part): part is string => part !== null).join(' · ')
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * Every state a bar can be, drawn as the real badges (design.md — a legend
 * lists them all, never just the ones on screen). One line each, saying what
 * the state is.
 */
const LEGEND: readonly StatusLegendItem[] = [
  { badge: <BookingStatusBadge status="draft" />, description: 'Started, not yet held.' },
  {
    badge: <BookingStatusBadge status="held" />,
    description: 'Held for a guest who has not paid yet.',
  },
  {
    badge: <BookingStatusBadge status="awaiting_payment_verification" />,
    description: 'A bank transfer is waiting to be verified.',
  },
  {
    badge: <BookingStatusBadge status="confirmed" />,
    description: 'Paid, or secured by the deposit.',
  },
  { badge: <BookingStatusBadge status="checked_in" />, description: 'The guest is in the unit.' },
  {
    badge: <BookingStatusBadge status="completed" />,
    description: 'The stay has ended; its booked nights stay blocked.',
  },
  {
    badge: <BookingStatusBadge status="no_show" />,
    description: 'Nobody arrived; the booked nights stay blocked.',
  },
  {
    badge: <UnitStatusBadge status="leased_long_term" />,
    description: 'Let on a long lease — month to month if it has no end date.',
  },
  {
    badge: <UnitStatusBadge status="out_of_service" />,
    description: 'Nobody can be put in it until it is returned to service.',
  },
]
