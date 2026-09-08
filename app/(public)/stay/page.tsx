import type { Metadata } from 'next'

import { listOccupanciesInWindow } from '@/lib/db/calendar'
import { getUnits } from '@/lib/db/inventory'
import { getPropertyConfig } from '@/lib/db/property-config'
import {
  nightlyFreeCounts,
  publicBookingWindow,
  type CalendarUnit,
} from '@/lib/domain/availability-calendar'
import { todayInBrunei, type StayDate } from '@/lib/domain/dates'

import { StayBooking } from './stay-booking'

export const metadata: Metadata = {
  title: 'Book a stay — Palm Villa',
  description:
    'Check availability and book a whole apartment or the semi-detached house at Palm Villa, Bandar Seri Begawan.',
}

/**
 * Live availability and a real price for a short stay (capabilities A1, A2,
 * A4).
 *
 * This replaces the stub that reserved the URL, which said "online booking
 * opens soon" and pointed at WhatsApp — the thing prd.md §3's goal G2 exists
 * to remove.
 *
 * Server-rendered, and the reason is the page's whole point: what is free and
 * what it costs are facts about the building at this second, and a screen that
 * loaded them in the browser would flash a price before it had one. Nothing
 * here is cached — `force-dynamic` — because an availability calendar served
 * from a cache is a calendar that offers a room somebody took an hour ago.
 *
 * The client island below it owns only what a customer is choosing. The counts
 * it paints and the config it prices with both come from here, so the figure
 * on the screen and the figure the server re-derives on submit come from one
 * read.
 */
export const dynamic = 'force-dynamic'

export default async function StayPage() {
  const today = todayInBrunei()
  const config = await getPropertyConfig()
  const window = publicBookingWindow(today, config.maxAdvanceBookingDays)

  const [units, occupancies] = await Promise.all([getUnits(), listOccupanciesInWindow(window)])

  const calendarUnits: CalendarUnit[] = units.map((unit) => ({
    id: unit.id,
    unitTypeSlug: unit.unitTypeId,
    // A unit out of service is not inventory: it is neither free nor taken.
    serviceable: unit.outOfServiceSince === null,
  }))

  const counts = nightlyFreeCounts({
    window,
    units: calendarUnits,
    occupancies: occupancies.map((occupancy) => ({
      unitId: occupancy.unitId,
      start: occupancy.start,
      end: occupancy.end,
      status: occupancy.status,
    })),
  })

  // Serialised as a plain object, because a Map does not cross the server /
  // client boundary. Sixty-two nights by four types is a few hundred integers.
  const nightsFree: Record<StayDate, Record<string, number>> = {}

  for (const [night, byType] of counts) {
    nightsFree[night] = Object.fromEntries(byType)
  }

  // A type the building has no units of cannot be sold, so it is not offered.
  // The 2-bedroom is exactly that until open question N1 is answered — it
  // exists and prices correctly with zero units — and a customer landing on a
  // calendar that says "Full" on all sixty-two nights would read it as a
  // property with nothing free rather than a type nobody has counted yet.
  const sellableTypes = config.unitTypes.filter((type) =>
    calendarUnits.some((unit) => unit.serviceable && unit.unitTypeSlug === type.id),
  )

  return (
    <StayBooking
      config={config}
      unitTypes={sellableTypes}
      today={today}
      lastNight={window.end}
      nightsFree={nightsFree}
    />
  )
}
