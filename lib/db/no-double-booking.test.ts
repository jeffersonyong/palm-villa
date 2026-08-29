import { describe, expect, test } from 'vitest'

import { createWalkInBooking, transitionBooking } from './bookings'
import { bookingInput, givenBooking, unitIdByRef } from './test/factory'
import { givenGuestNames } from './test/inspect'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAPABILITY G1 — double booking is structurally impossible.
 *
 * scope-of-capabilities.md G1 promises the client, in writing, that this is
 * "enforced by the database itself, not by staff vigilance or an approval
 * step". prd.md §15 and architecture.md §5.2 both require a database-level
 * constraint and both explicitly reject application logic. This file is the
 * evidence for that promise.
 *
 * ── How to see it fail ─────────────────────────────────────────────────────
 *
 * A concurrency test nobody has watched fail proves nothing, so verify it
 * against a database with the constraint removed:
 *
 *   npm run db:start
 *   npx supabase db reset
 *   npx supabase --workdir . db  # or psql on 127.0.0.1:54322, user postgres
 *     alter table occupancy drop constraint no_overlapping_occupancy;
 *   npx vitest run --project integration lib/db/no-double-booking.test.ts
 *
 * The first test below fails, reporting several winners instead of one: every
 * caller passes whatever application-level check exists, and nothing is left to
 * refuse the losers. Then `npm run db:reset` restores the constraint.
 *
 * That is exactly the race the deleted fixture layer lost, and why its own
 * header said an overlap check in TypeScript was not capability G1.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CHECK_IN = '2026-09-14'
const CHECK_OUT = '2026-09-17'

describe('the exclusion constraint', () => {
  test('lets exactly one of eight simultaneous bookings take the unit', async () => {
    const unitId = await unitIdByRef('3B-01')

    // Built up front so the calls contend rather than queue behind their own
    // setup, and all eight are in flight before any of them commits.
    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        bookingInput({
          unitId,
          checkIn: CHECK_IN,
          checkOut: CHECK_OUT,
          guestName: `Racer ${index + 1}`,
        }),
      ),
    )

    const results = await Promise.all(attempts.map((input) => createWalkInBooking(input)))

    const winners = results.filter((result) => result.ok)
    const losers = results.filter((result) => !result.ok)

    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(7)
    expect(losers.every((result) => !result.ok && result.error.code === 'unit_unavailable')).toBe(
      true,
    )
  })

  test('leaves nothing behind when a booking loses the race', async () => {
    const unitId = await unitIdByRef('3B-02')

    await givenBooking({ unitId, checkIn: CHECK_IN, checkOut: CHECK_OUT })

    const loser = await createWalkInBooking(
      await bookingInput({
        unitId,
        checkIn: CHECK_IN,
        checkOut: CHECK_OUT,
        guestName: 'Rolled Back',
      }),
    )

    expect(loser.ok).toBe(false)

    // The guest, the booking, its lines and its occupancy row are written in
    // one transaction, so a refusal takes all of them back. A guest row left
    // behind by a booking that never existed would be a data-protection
    // liability with no purpose (prd.md §13).
    expect(await givenGuestNames()).not.toContain('Rolled Back')
  })
})

describe('half-open ranges', () => {
  test('allows a check-in on the day the previous guest checks out', async () => {
    const unitId = await unitIdByRef('3B-03')

    await givenBooking({ unitId, checkIn: '2026-09-10', checkOut: '2026-09-14' })

    // architecture.md §5.2: `daterange(start_date, end_date, '[)')` makes
    // back-to-back bookings legal by construction. Turning over a unit on the
    // same day is ordinary operations, not an edge case.
    const backToBack = await createWalkInBooking(
      await bookingInput({ unitId, checkIn: '2026-09-14', checkOut: '2026-09-17' }),
    )

    expect(backToBack.ok).toBe(true)
  })

  test('refuses a stay that overlaps by a single night', async () => {
    const unitId = await unitIdByRef('3B-04')

    await givenBooking({ unitId, checkIn: '2026-09-10', checkOut: '2026-09-14' })

    const overlapping = await createWalkInBooking(
      await bookingInput({ unitId, checkIn: '2026-09-13', checkOut: '2026-09-17' }),
    )

    expect(overlapping.ok).toBe(false)
  })
})

describe('releasing a unit', () => {
  test('a cancelled booking frees its unit for the same dates', async () => {
    const unitId = await unitIdByRef('3B-05')
    const booking = await givenBooking({ unitId, checkIn: CHECK_IN, checkOut: CHECK_OUT })

    const blocked = await createWalkInBooking(
      await bookingInput({ unitId, checkIn: CHECK_IN, checkOut: CHECK_OUT }),
    )

    expect(blocked.ok).toBe(false)

    // Status moves through the state machine, and the trigger carries it to the
    // occupancy row — which is what drops it out of the constraint's `where`
    // clause. Cancelled and expired are the only statuses that release a unit.
    const cancelled = await transitionBooking(booking.id, 'cancel')

    expect(cancelled.ok).toBe(true)

    const rebooked = await createWalkInBooking(
      await bookingInput({ unitId, checkIn: CHECK_IN, checkOut: CHECK_OUT }),
    )

    expect(rebooked.ok).toBe(true)
  })

  test('constrains one unit at a time, not the whole property', async () => {
    await givenBooking({ unitRef: '3B-06', checkIn: CHECK_IN, checkOut: CHECK_OUT })

    // The constraint keys on `unit_id`. Forty-eight units means forty-eight
    // independent calendars, and a booking on one must not block the next.
    const neighbour = await createWalkInBooking(
      await bookingInput({ unitRef: '3B-07', checkIn: CHECK_IN, checkOut: CHECK_OUT }),
    )

    expect(neighbour.ok).toBe(true)
  })
})
