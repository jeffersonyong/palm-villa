/**
 * Revenue streams (prd.md §1).
 *
 * Palm Villa sells three things: facility day passes, short stays, and
 * long-term tenancies. `booking.stream` records which one a booking is, and
 * the check constraint in 20260829000200 lists exactly these values.
 *
 * ── Why this lives in lib/domain and not beside the read model ─────────────
 *
 * It used to be a type in lib/db/bookings, on the grounds that nothing in
 * lib/domain branched on it. The bookings register changed that: its filter row
 * is a client island, and lib/db imports the service-role Supabase client,
 * which throws on sight of a browser (lib/supabase/data.ts). A client component
 * that needs to name a stream therefore cannot reach one from there — and a
 * stream is a fact about the business, not about the view that reads it.
 *
 * No behaviour branches on a stream yet, deliberately. Day passes are phase two
 * and tenancy is phase three; when they land, what differs between them is
 * pricing and occupancy, both of which already have their own modules.
 */

export type BookingStream = 'short_stay' | 'day_pass' | 'tenancy'

/**
 * The streams in reading order — the order they appear in a filter panel and a
 * stat strip, and the order a list sorts them into whatever the URL said.
 *
 * Short stays first because they are the volume today; tenancy last because it
 * is the longest-lived and the least often looked at.
 */
export const BOOKING_STREAMS = ['short_stay', 'day_pass', 'tenancy'] as const

/**
 * How each stream is named on screen.
 *
 * The client's own words from prd.md §1, singular: a table cell labels one
 * booking, and "Day passes" in a column of one reads as a category heading that
 * wandered into the body.
 */
export const BOOKING_STREAM_LABELS: Record<BookingStream, string> = {
  short_stay: 'Short stay',
  day_pass: 'Day pass',
  tenancy: 'Tenancy',
}

/** True when the value is one of the three streams — for reading a URL param. */
export function isBookingStream(value: string): value is BookingStream {
  return (BOOKING_STREAMS as readonly string[]).includes(value)
}
