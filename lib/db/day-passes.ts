import type { DayHeadroom } from '@/lib/domain/day-pass-capacity'
import type { StayDate } from '@/lib/domain/dates'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'

/**
 * What a day pass has left (capability A3, and the denominator E5 has been
 * missing).
 *
 * One read, because there is one question: how many places are sold on each
 * date, against the ceiling that binds. The arithmetic on top of it —
 * `placesLeft`, `hasRoomFor` — is in `lib/domain/day-pass-capacity.ts`, which
 * is the arrangement the reporting reads already have: the query returns
 * facts, the domain applies the rule, and the rule is the tested half.
 *
 * The capacity the function reports is the same figure
 * `create_public_day_pass_booking()` enforces under its lock, because both
 * call `day_pass_headroom()`. That matters more than it looks: a screen
 * offering a place the writer then refuses is exactly the failure the
 * availability read and the exclusion constraint spend so much care avoiding
 * for units.
 */
export async function listDayPassHeadroom(window: {
  from: StayDate
  to: StayDate
}): Promise<readonly DayHeadroom[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('day_pass_headroom', {
    p_property_id: propertyId,
    p_from: window.from,
    p_to: window.to,
  })

  if (error) {
    throw new Error(`Could not read day-pass capacity: ${error.message}`)
  }

  return (data as { pass_date: StayDate; capacity: number | null; taken: number }[]).map((row) => ({
    date: row.pass_date,
    capacity: row.capacity,
    taken: row.taken,
  }))
}

/** Headroom by date, for a screen that asks one day at a time. */
export function headroomByDate(
  headroom: readonly DayHeadroom[],
): ReadonlyMap<StayDate, DayHeadroom> {
  return new Map(headroom.map((day) => [day.date, day]))
}
