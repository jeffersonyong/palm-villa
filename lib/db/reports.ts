import { OCCUPIED_STATUSES, type OccupancyRow } from '@/lib/domain/reports/occupancy'
import type { RevenueSource } from '@/lib/domain/reports/revenue'
import { bruneiWindowBounds, type StayWindow } from '@/lib/domain/dates'
import type { DateRange } from '@/lib/domain/availability'
import { dataClient } from '@/lib/supabase/data'

import { listPayments } from './payments'
import { currentPropertyId } from './property'

/**
 * The reads behind the reports screen (capability E5, prd.md §14).
 *
 * Both readers here return **facts**, and the arithmetic that turns them into
 * a report lives in lib/domain/reports. That split is deliberate and it is the
 * one the deposits ledger established: a figure the client will act on should
 * be produced by a function with tests around it, not by a `sum()` in a view
 * nobody can run in isolation.
 *
 * Both sets are bounded by the window the screen asks for, so neither pages.
 * A period long enough for that to matter is a period nobody reads a table of.
 */

/**
 * Every occupancy row touching the range, in the statuses that count as
 * occupied.
 *
 * The status filter repeats `OCCUPIED_STATUSES` rather than reading everything
 * and narrowing in TypeScript: the domain applies the same list again, so the
 * rule is enforced in one place and the database is simply not asked for rows
 * that would be discarded.
 *
 * The `or` on the end is not optional. An open-ended lease has a null
 * `end_date` (architecture.md §5.2, N19), and `end_date.gt.<date>` is null
 * rather than true for one — so a plain comparison drops exactly the rows that
 * occupy the most nights. `available_units()` was bitten by the same null once
 * already, which is why it is called out here.
 */
export async function listOccupanciesOverlapping(
  range: DateRange,
): Promise<readonly OccupancyRow[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('occupancy')
    .select('unit_id, status, start_date, end_date')
    .eq('property_id', propertyId)
    .in('status', [...OCCUPIED_STATUSES])
    .lt('start_date', range.end)
    .or(`end_date.is.null,end_date.gt.${range.start}`)

  if (error) {
    throw new Error(`Could not read occupancy for the period: ${error.message}`)
  }

  return (data as OccupancyRowShape[]).map((row) => ({
    unitId: row.unit_id,
    status: row.status,
    start: row.start_date,
    end: row.end_date,
  }))
}

interface OccupancyRowShape {
  unit_id: string
  status: string
  start_date: string
  end_date: string | null
}

/**
 * Verified payments whose money **may** have landed inside the window.
 *
 * A superset, deliberately. Which day a payment counts on depends on its
 * method and on whether anybody recorded the date they saw in the bank
 * (`revenueDateOf`), and expressing that rule as a PostgREST filter would put
 * half of it in a query string and half in a module — the arrangement that
 * left the accounting pack's staleness rule disagreeing with itself. So the
 * query casts wide on the three columns the rule can use, and
 * `revenueInWindow` decides.
 *
 * `verified_at` is included on its own account because it is the fallback for
 * a transfer with no observed date. Rows the domain then discards are the
 * price of the rule living in one place, and the window bounds keep that
 * price small.
 */
export async function listRevenuePayments(window: StayWindow): Promise<readonly RevenueSource[]> {
  const bounds = bruneiWindowBounds(window)

  const payments = await listPayments({
    statuses: ['verified'],
    collectedOrObserved: { bounds, from: window.from, to: window.to },
  })

  return payments.map((payment) => ({
    stream: payment.bookingStream,
    method: payment.method,
    status: payment.status,
    amount: payment.amount,
    collectedAt: payment.collectedAt,
    observedOn: payment.observedOn,
    verifiedAt: payment.verifiedAt,
  }))
}
