import type { DateRange } from '@/lib/domain/availability'
import type { StayDate } from '@/lib/domain/dates'
import type { BookingStream } from '@/lib/domain/stream'
import type { OccupancyStatus } from '@/lib/domain/unit-status'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'

/**
 * The read behind the booking calendar (capability B1, the calendar half).
 *
 * ── Why it reads `occupancy`, not `booking_summary` ─────────────────────────
 *
 * Every portal list sits on `booking_summary`, and the calendar would too if
 * it only had to show bookings. It has to show a **lease**, and a lease is an
 * occupancy row with no booking behind it (20260904000100, part 2) — the view
 * is driven from `booking`, so a tenant can never appear in it. The calendar's
 * subject is the unit's night, not the booking, and `occupancy` is the table
 * that says what holds a unit's night.
 *
 * ── Why the status rule is the constraint's, not the report's ───────────────
 *
 * `lib/db/reports.ts` narrows to `OCCUPIED_STATUSES` because a report answers
 * "how full was the building": a hold is somebody's intention, not a night
 * sold, so it does not count (prd.md §14 [A]). The calendar answers a
 * different question — "what stops me putting a guest here" — and the
 * authority on that is the exclusion constraint itself, which blocks every
 * status except `expired`, `cancelled` and `no_show` (architecture.md §5.2). So a hold is
 * drawn, and so is a completed stay whose last night has not arrived yet; the
 * board calls that unit available and the calendar does not, and the calendar
 * is the honest one (the divergence recorded in `lib/domain/unit-status.ts`).
 *
 * The `or` on the end is not optional. An open-ended lease has a null
 * `end_date`, and `end_date.gt.<date>` is null rather than true for one — the
 * rows occupying the most nights are exactly the ones a plain comparison drops
 * (architecture.md §5.2, N19). `reports.ts` says the same, and repeats it for
 * the same reason.
 */

export interface CalendarOccupancy {
  id: string
  unitId: string
  /** `leased` for a lease; otherwise the booking's own status, mirrored by trigger. */
  status: OccupancyStatus
  start: StayDate
  /** Null only for an open-ended lease (N19): unbounded above. */
  end: StayDate | null
  /** The guest's name on a booking, the tenant's on a lease. */
  occupantName: string
  /** Null for a lease — it is not a booking and has no reference. */
  booking: { reference: string; stream: BookingStream } | null
}

interface CalendarRow {
  id: string
  unit_id: string
  status: string
  start_date: string
  end_date: string | null
  occupant_name: string | null
  booking: { reference: string; stream: string; guest: { name: string } | null } | null
}

/**
 * Everything that holds a unit for at least one night inside `window`.
 *
 * `window` is half-open, like every range in this system: a stay ending on the
 * day the window starts does not touch it, and neither does one starting on
 * the day it ends. One bounded read for the whole grid — the building bounds
 * it, so nothing pages.
 */
export async function listOccupanciesInWindow(
  window: DateRange,
): Promise<readonly CalendarOccupancy[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('occupancy')
    .select(
      'id, unit_id, status, start_date, end_date, occupant_name, booking(reference, stream, guest(name))',
    )
    .eq('property_id', propertyId)
    // The constraint's own list (20260922000100): a no-show released its unit,
    // so drawing it would put a bar under whoever was sold the night after.
    .not('status', 'in', '(expired,cancelled,no_show)')
    .lt('start_date', window.end)
    .or(`end_date.is.null,end_date.gt.${window.start}`)
    .order('start_date')

  if (error) {
    throw new Error(`Could not read the calendar for the month: ${error.message}`)
  }

  return (data as unknown as CalendarRow[]).map(toCalendarOccupancy)
}

function toCalendarOccupancy(row: CalendarRow): CalendarOccupancy {
  return {
    id: row.id,
    unitId: row.unit_id,
    status: row.status as OccupancyStatus,
    start: row.start_date,
    end: row.end_date,
    // The same fallback the units board uses for a row that somehow names
    // nobody — a label rather than a blank, so the bar still reads as taken.
    occupantName: row.booking?.guest?.name ?? row.occupant_name ?? 'Unnamed',
    booking: row.booking
      ? { reference: row.booking.reference, stream: row.booking.stream as BookingStream }
      : null,
  }
}
