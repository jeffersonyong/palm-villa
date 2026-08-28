import { transition, type BookingEvent, type BookingStatus } from '@/lib/domain/booking-state'
import { palmVillaConfig } from '@/lib/domain/config'
import { addDays, type StayDate } from '@/lib/domain/dates'
import { priceStay } from '@/lib/domain/pricing/stay'

import type { BookingFixture, UnitFixture } from './fixtures'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEMPORARY. THIS FILE IS NOT A SEED SCRIPT AND IS DELETED BY THE SCHEMA SLICE.
 *
 * These are demo bookings so the portal's list screens have something to show
 * before the database exists. The guests are invented, and the real seed script
 * — the one that creates the property, units and roles — is a different thing
 * that lives in supabase/ and is written against the schema.
 *
 * Nothing here is client data and none of it should survive into one.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DemoBooking {
  /** Nights offset from today; `start` may be negative for past stays. */
  start: number
  end: number
  unitIndex: number
  guestName: string
  guestPhone: string
  vehicleRegistration: string | null
  chargeableGuests: number
  exemptGuests: number
  /** Applied in order from `draft` to reach the intended status. */
  events: readonly BookingEvent[]
}

/**
 * The demo set, chosen to populate the screens that exist rather than to be
 * exhaustive: arrivals and departures for today, something waiting on payment,
 * something held, and one of each terminal outcome worth looking at.
 */
const DEMO_BOOKINGS: readonly DemoBooking[] = [
  {
    start: 0,
    end: 3,
    unitIndex: 4,
    guestName: 'Nurul Hasanah',
    guestPhone: '+673 712 4408',
    vehicleRegistration: 'BM 4471',
    // Over the three-bedroom's stated maximum, so this one carries an
    // extra-person line and the list shows a total that is not just the rate.
    chargeableGuests: 9,
    exemptGuests: 1,
    events: ['pay_in_full'],
  },
  {
    start: 0,
    end: 2,
    unitIndex: 11,
    guestName: 'Daniel Lim',
    guestPhone: '+673 888 1902',
    vehicleRegistration: null,
    chargeableGuests: 2,
    exemptGuests: 0,
    events: ['pay_in_full'],
  },
  {
    start: -2,
    end: 0,
    unitIndex: 19,
    guestName: 'Siti Rahmah',
    guestPhone: '+673 733 5510',
    vehicleRegistration: 'BK 2210',
    chargeableGuests: 6,
    exemptGuests: 2,
    events: ['pay_in_full', 'check_in'],
  },
  {
    start: -1,
    end: 2,
    unitIndex: 27,
    guestName: 'Chandra Bala',
    guestPhone: '+673 719 6633',
    vehicleRegistration: 'BAB 88',
    chargeableGuests: 3,
    exemptGuests: 0,
    events: ['pay_in_full', 'check_in'],
  },
  {
    start: 4,
    end: 6,
    unitIndex: 33,
    guestName: 'Amirah Zulkifli',
    guestPhone: '+673 892 7741',
    vehicleRegistration: null,
    chargeableGuests: 5,
    exemptGuests: 1,
    events: ['hold', 'submit_payment'],
  },
  {
    start: 6,
    end: 9,
    unitIndex: 41,
    guestName: 'Wong Mei Ling',
    guestPhone: '+673 715 3096',
    vehicleRegistration: 'BJ 1177',
    chargeableGuests: 8,
    exemptGuests: 0,
    events: ['hold'],
  },
  {
    start: -7,
    end: -4,
    unitIndex: 46,
    guestName: 'Hakim Abdullah',
    guestPhone: '+673 877 2214',
    vehicleRegistration: 'BN 9042',
    chargeableGuests: 4,
    exemptGuests: 0,
    events: ['pay_in_full', 'check_in', 'check_out'],
  },
  {
    start: 9,
    end: 11,
    unitIndex: 49,
    guestName: 'Farah Idris',
    guestPhone: '+673 724 8865',
    vehicleRegistration: null,
    chargeableGuests: 10,
    exemptGuests: 2,
    events: ['hold', 'cancel'],
  },
]

/**
 * Walks the state machine to the status an event chain produces.
 *
 * The seed never assigns a status, for the same reason no other code path does
 * (architecture.md §5.3) — a demo booking sitting in a state the machine cannot
 * actually reach would make the screens lie about what staff will see.
 */
function statusAfter(events: readonly BookingEvent[]): BookingStatus {
  return events.reduce<BookingStatus>((status, event) => {
    const result = transition(status, event)

    if (!result.ok) {
      throw new Error(`Demo seed has an illegal transition: ${result.error.message}`)
    }

    return result.status
  }, 'draft')
}

/**
 * Builds the demo bookings for a given day.
 *
 * Pure and deterministic: same `today` in, same bookings out. The date is a
 * parameter rather than a clock read so the output is testable, and so the
 * caller decides when "today" is fixed — see `ensureSeeded` in fixtures.ts.
 *
 * Prices come from the real pricing engine, so no figure here is invented.
 * Early check-in is left alone: it is unsellable while the standard check-in
 * time is an open question (prd.md §18 N6).
 */
export function buildDemoBookings(
  today: StayDate,
  units: readonly UnitFixture[],
): BookingFixture[] {
  return DEMO_BOOKINGS.map((demo, index) => {
    const unit = units[demo.unitIndex % units.length]

    if (!unit) {
      throw new Error('Demo seed needs at least one unit to place bookings in.')
    }

    const checkIn = addDays(today, demo.start)
    const checkOut = addDays(today, demo.end)

    const priced = priceStay(
      {
        unitTypeId: unit.unitTypeId,
        checkIn,
        checkOut,
        party: { chargeableGuests: demo.chargeableGuests, exemptGuests: demo.exemptGuests },
        sofaBeds: 0,
        earlyCheckInHours: 0,
        lateCheckOutHours: 0,
      },
      palmVillaConfig,
      // Past stays are priced as at their own check-in date: the engine refuses
      // dates behind "today", and a completed booking is a real thing to show.
      demo.start < 0 ? checkIn : today,
    )

    if (!priced.ok) {
      throw new Error(`Demo seed could not be priced: ${priced.error.message}`)
    }

    return {
      id: `demo-${index}-${unit.id}`,
      reference: `PV-${4821 + index}`,
      unitId: unit.id,
      unitRef: unit.ref,
      range: { start: checkIn, end: checkOut },
      status: statusAfter(demo.events),
      guestName: demo.guestName,
      guestPhone: demo.guestPhone,
      vehicleRegistration: demo.vehicleRegistration,
      chargeableGuests: demo.chargeableGuests,
      exemptGuests: demo.exemptGuests,
      lines: priced.lines,
      total: priced.total,
      securityDeposit: priced.securityDeposit,
      // Booked a few days before arrival; no clock read, so this stays stable.
      createdAt: `${addDays(checkIn, -3)}T02:00:00.000Z`,
    }
  })
}
