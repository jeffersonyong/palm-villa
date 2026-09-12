import type { Metadata } from 'next'

import { listDayPassHeadroom } from '@/lib/db/day-passes'
import { readPropertySettings } from '@/lib/db/settings'
import { addDays, todayInBrunei, type StayDate } from '@/lib/domain/dates'
import { configFromSettings } from '@/lib/domain/settings'

import { DayPassBooking } from './day-pass-booking'

export const metadata: Metadata = {
  title: 'Day passes — Palm Villa',
  description:
    'Book a facility day pass at Palm Villa, Bandar Seri Begawan. Per-person rates with family bundles applied automatically.',
}

/**
 * Booking a facility day pass (capability A3).
 *
 * The first screen anywhere that sells one — `priceDayPass` has been written
 * and tested since the pricing slice with nothing calling it, and `day_pass`
 * did not exist as a table until this one.
 *
 * Two things come from the database rather than from copy. **What the pass
 * admits** is the facility list with its `included_in_day_pass` ticks, which
 * capability F3 made a setting precisely so the two facilities the client has
 * not settled (C1: the water park and the sauna) cost nothing to leave as they
 * are. **How many places are left** is the headroom read, which is null on
 * every date today because no capacity has ever been agreed (C2) — so nothing
 * is limited, and the screen says nothing about limits it cannot enforce.
 */
export const dynamic = 'force-dynamic'

export default async function DayPassPage() {
  const today = todayInBrunei()

  // One read of the settings, not two. `getPropertyConfig()` IS
  // `configFromSettings(await readPropertySettings())`, so calling it and then
  // reading the settings again — which this did, for the facility names — ran
  // the same RPC twice per visit to derive two views of one answer.
  const settings = await readPropertySettings()
  const config = configFromSettings(settings)
  const lastDay = addDays(today, config.maxAdvanceBookingDays)

  // Genuinely sequential: the window it reads is derived from the settings.
  const headroom = await listDayPassHeadroom({ from: today, to: lastDay })

  // Serialised as a plain object for the client island: a Map does not cross
  // the boundary, and only the dates with nothing left actually matter to it.
  const soldOut: Record<StayDate, number> = {}

  for (const day of headroom) {
    if (day.capacity !== null) {
      soldOut[day.date] = Math.max(day.capacity - day.taken, 0)
    }
  }

  const included = settings.facilities
    .filter((facility) => facility.includedInDayPass)
    .map((facility) => facility.name)

  return (
    <DayPassBooking
      config={config}
      today={today}
      lastDay={lastDay}
      placesLeft={soldOut}
      included={included}
    />
  )
}
