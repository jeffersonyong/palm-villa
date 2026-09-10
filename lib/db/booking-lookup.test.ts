import { describe, expect, test } from 'vitest'

import { ACCESS_TOKEN_PATTERN } from '@/lib/domain/public-booking'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'
import { findBookingLink, getBookingByAccessToken } from './public-bookings'
import { givenBooking } from './test/factory'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Finding a booking again by reference and phone (capability A9).
 *
 * The one read on the customer surface with no token behind it, so these
 * tests are about two things rather than about screens: that both halves of
 * the credential actually have to match, and that minting a link for a
 * booking that never had one is safe to do twice at once.
 *
 * `givenBooking` writes a walk-in, which is exactly the case that matters —
 * `access_token` is null on it, so every mint here is the real path.
 *
 * ── How to see the concurrency one fail ────────────────────────────────────
 *
 *   npm run db:start
 *   Edit issue_booking_access_token() in
 *     supabase/migrations/20260916000100_the_link_found_again.sql,
 *     removing the `for update` from the select.
 *   npm run db:reset
 *   npx vitest run --project integration lib/db/booking-lookup.test.ts
 *
 * Several callers then read a null token together, each mints its own, and
 * the last write wins — so the other callers hold links that do not open the
 * booking, and the trail carries an issue event for every one of them.
 * ═══════════════════════════════════════════════════════════════════════════
 */

async function linkEventCount(bookingId: string): Promise<number> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('audit_event')
    .select('id')
    .eq('property_id', propertyId)
    .eq('entity_id', bookingId)
    .eq('action', 'booking.link_issued')

  if (error) {
    throw new Error(`Could not read the trail: ${error.message}`)
  }

  return (data ?? []).length
}

describe('findBookingLink', () => {
  test('finds a booking taken at the desk and gives it a link it never had', async () => {
    const booking = await givenBooking({
      checkIn: '2026-11-02',
      checkOut: '2026-11-04',
      guestPhone: '8959798',
    })

    expect(booking.accessToken).toBeNull()

    const found = await findBookingLink({ reference: booking.reference, phone: '8959798' })

    expect(found.ok).toBe(true)

    if (!found.ok) {
      return
    }

    expect(found.data.token).toMatch(ACCESS_TOKEN_PATTERN)
    expect(found.data.reference).toBe(booking.reference)

    // The link has to open the page, which is the only claim a customer cares
    // about.
    const reached = await getBookingByAccessToken(found.data.token)

    expect(reached?.id).toBe(booking.id)
  })

  test('gives the same link back on a second lookup, and records the issue once', async () => {
    const booking = await givenBooking({
      checkIn: '2026-11-06',
      checkOut: '2026-11-08',
      guestPhone: '8959700',
    })

    const first = await findBookingLink({ reference: booking.reference, phone: '8959700' })
    const second = await findBookingLink({ reference: booking.reference, phone: '8959700' })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)

    if (first.ok && second.ok) {
      // One URL, not two — and the second lookup writes no second line into
      // an append-only table.
      expect(second.data.token).toBe(first.data.token)
    }

    expect(await linkEventCount(booking.id)).toBe(1)
  })

  /**
   * The property the whole screen rests on: a number written one way at the
   * desk and another way by the customer is one number. Both directions,
   * because either side can be the odd spelling.
   */
  test.each([
    ['8959798', '+673 8959798'],
    ['8959798', '673 8959798'],
    ['8959798', '08959798'],
    ['8959798', '+6738959798'],
    ['+673 8959798', '8959798'],
    ['673-895-9798', '8959798'],
  ])('a booking stored as %j is found by %j', async (stored, typed) => {
    const booking = await givenBooking({
      checkIn: '2026-11-14',
      checkOut: '2026-11-16',
      guestPhone: stored,
    })

    const found = await findBookingLink({ reference: booking.reference, phone: typed })

    expect(found.ok).toBe(true)
  })

  test('finds a booking from the bare digits of its reference', async () => {
    const booking = await givenBooking({
      checkIn: '2026-11-18',
      checkOut: '2026-11-20',
      guestPhone: '8959702',
    })

    const found = await findBookingLink({
      reference: booking.reference.replace('PV-', ''),
      phone: '8959702',
    })

    expect(found.ok).toBe(true)
  })

  /**
   * Every refusal is the same refusal. A caller must not be able to tell an
   * unknown reference from a wrong number from a string that was never a
   * reference — whether a booking exists is the only thing worth learning
   * from this endpoint, and this is what withholds it.
   */
  test('refuses a wrong number, an unknown reference and a malformed one alike', async () => {
    const booking = await givenBooking({
      checkIn: '2026-11-22',
      checkOut: '2026-11-24',
      guestPhone: '8959703',
    })

    const results = await Promise.all([
      findBookingLink({ reference: booking.reference, phone: '7111111' }),
      findBookingLink({ reference: 'PV-999999', phone: '8959703' }),
      findBookingLink({ reference: 'not-a-reference', phone: '8959703' }),
    ])

    const refusals = results.map((result) => (result.ok ? null : result.error))

    expect(refusals.every((error) => error?.code === 'not_found')).toBe(true)
    expect(new Set(refusals.map((error) => error?.message)).size).toBe(1)

    // A refused lookup mints nothing.
    expect(await linkEventCount(booking.id)).toBe(0)
  })

  test('still finds a cancelled booking, because its guest is who needs the reason', async () => {
    const booking = await givenBooking({
      checkIn: '2026-11-26',
      checkOut: '2026-11-28',
      guestPhone: '8959704',
    })

    const propertyId = await currentPropertyId()
    const { error } = await dataClient()
      .from('booking')
      .update({ status: 'cancelled' })
      .eq('property_id', propertyId)
      .eq('id', booking.id)

    expect(error).toBeNull()

    const found = await findBookingLink({ reference: booking.reference, phone: '8959704' })

    expect(found.ok).toBe(true)
  })

  test('records the issue with no actor and no token in the payload', async () => {
    const booking = await givenBooking({
      checkIn: '2026-11-30',
      checkOut: '2026-12-02',
      guestPhone: '8959705',
    })

    const found = await findBookingLink({ reference: booking.reference, phone: '8959705' })

    expect(found.ok).toBe(true)

    const propertyId = await currentPropertyId()
    const { data, error } = await dataClient()
      .from('audit_event')
      .select('actor_id, entity_type, after')
      .eq('property_id', propertyId)
      .eq('entity_id', booking.id)
      .eq('action', 'booking.link_issued')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    const event = (data ?? [])[0] as {
      actor_id: string | null
      entity_type: string
      after: Record<string, unknown>
    }

    expect(event.actor_id).toBeNull()
    expect(event.entity_type).toBe('booking')

    // A live credential does not belong in a second, append-only place.
    expect(event.after).toEqual({ issued: true })
  })

  test('mints exactly one link when several lookups race for it', async () => {
    const booking = await givenBooking({
      checkIn: '2026-12-04',
      checkOut: '2026-12-06',
      guestPhone: '8959706',
    })

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        findBookingLink({ reference: booking.reference, phone: '8959706' }),
      ),
    )

    expect(results.every((result) => result.ok)).toBe(true)

    const tokens = new Set(results.map((result) => (result.ok ? result.data.token : 'refused')))

    // One token, held by all six callers, and one line in the trail.
    expect(tokens.size).toBe(1)
    expect(await linkEventCount(booking.id)).toBe(1)

    const reached = await getBookingByAccessToken([...tokens][0] as string)

    expect(reached?.id).toBe(booking.id)
  })
})
