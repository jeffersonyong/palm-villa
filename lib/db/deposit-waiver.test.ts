import { describe, expect, test } from 'vitest'

import { bnd } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { amendBooking, getBookingById, type Booking } from './bookings'
import { checkInBooking, getDepositByBookingId } from './deposits'
import { givenBooking } from './test/factory'
import { auditEventsFor } from './test/inspect'

/**
 * The security deposit, waived (capability B15), against the real database.
 *
 * What these prove is not that a column holds a string. It is that a waiver
 * cannot be half-recorded: a waived booking quotes nothing and checks in
 * taking nothing, the reason and the figure not taken are on the trail, and
 * nothing downstream — an amendment repricing the stay — can quietly put the
 * deposit back. The constraint doing that last job lives in the schema, so it
 * has to be exercised here rather than against a mock.
 */

const STAY = { checkIn: '2026-11-10', checkOut: '2026-11-12' }
const REASON = 'Extends PV-1000 — the deposit is already held on that booking'

/** The booking's own fields, as an amendment that changes nothing but the deposit. */
function unchanged(booking: Booking, securityDeposit: number) {
  if (!booking.stay) {
    throw new Error('Test setup expected a stay')
  }

  return {
    bookingId: booking.id,
    expectedUpdatedAt: booking.updatedAt,
    unitId: booking.stay.unitId,
    range: booking.stay.range,
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    vehicles: booking.vehicles,
    noVehicle: booking.noVehicle,
    chargeableGuests: booking.chargeableGuests,
    exemptGuests: booking.exemptGuests,
    lines: booking.lines,
    total: booking.total,
    securityDeposit,
    discount: booking.discount,
    reason: null,
    actorId: null,
  }
}

describe('a booking with the security deposit waived', () => {
  test('quotes nothing, keeps the reason, and records what was not taken', async () => {
    const booking = await givenBooking({ unitRef: '3B-01', ...STAY, depositWaiverReason: REASON })

    // The factory passes the quoted BND 100; the function zeroes it.
    expect(booking.securityDeposit).toBe(0)
    expect(booking.depositWaiverReason).toBe(REASON)

    const events = await auditEventsFor(booking.id)
    const waived = events.find((event) => event.action === 'deposit.waived')

    expect(waived).toBeDefined()
    expect(waived?.after).toMatchObject({
      reference: booking.reference,
      amount_cents: bnd(100),
      reason: REASON,
    })

    // The creation event says what the booking carries — zero — so the two
    // events read consistently: nothing quoted, and here is why.
    const created = events.find((event) => event.action === 'booking.created_walk_in')

    expect(created?.after).toMatchObject({ security_deposit_cents: 0 })
  })

  test('checks in without writing a deposit row', async () => {
    const booking = await givenBooking({ unitRef: '3B-02', ...STAY, depositWaiverReason: REASON })

    const result = await checkInBooking({ bookingId: booking.id, method: 'cash', actorId: null })

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.depositId).toBeNull()
      expect(result.amount).toBe(0)
    }

    expect(await getDepositByBookingId(booking.id)).toBeNull()

    const actions = (await auditEventsFor(booking.id)).map((event) => event.action)

    expect(actions).toContain('booking.check_in')
    expect(actions).not.toContain('deposit.collected')
  })

  test('a blank reason is no waiver: the deposit is quoted as normal', async () => {
    const booking = await givenBooking({ unitRef: '3B-03', ...STAY, depositWaiverReason: '   ' })

    expect(booking.securityDeposit).toBe(bnd(100))
    expect(booking.depositWaiverReason).toBeNull()

    const actions = (await auditEventsFor(booking.id)).map((event) => event.action)

    expect(actions).not.toContain('deposit.waived')
  })

  test('an unwaived booking carries no reason and no waiver event', async () => {
    const booking = await givenBooking({ unitRef: '3B-04', ...STAY })

    expect(booking.securityDeposit).toBe(bnd(100))
    expect(booking.depositWaiverReason).toBeNull()
  })
})

describe('an amendment against a waived booking', () => {
  test('carries the waiver through when it quotes nothing', async () => {
    const booking = await givenBooking({ unitRef: '3B-05', ...STAY, depositWaiverReason: REASON })

    const result = await amendBooking(unchanged(booking, 0))

    expect(result.ok).toBe(true)

    const after = await getBookingById(booking.id)

    expect(after?.securityDeposit).toBe(0)
    expect(after?.depositWaiverReason).toBe(REASON)
  })

  test('cannot quietly put the deposit back', async () => {
    const booking = await givenBooking({ unitRef: '3B-06', ...STAY, depositWaiverReason: REASON })

    // The schema refuses the combination rather than the function returning a
    // refusal: this is a caller that forgot the rule, and it should fail
    // loudly. The server action never reaches this — it passes 0 for a waived
    // booking — but the constraint is what makes that a courtesy, not the
    // guarantee.
    await expect(amendBooking(unchanged(booking, bnd(100)))).rejects.toThrow(
      /booking_deposit_waiver_quotes_nothing/,
    )

    const after = await getBookingById(booking.id)

    expect(after?.securityDeposit).toBe(0)
    expect(after?.depositWaiverReason).toBe(REASON)
  })
})

describe('deposit.waive', () => {
  test('is held by Admin and Front Office, and by nobody else', async () => {
    const { data, error } = await dataClient()
      .from('role_permission')
      .select('staff_role!inner(slug)')
      .eq('permission', 'deposit.waive')

    if (error) {
      throw new Error(error.message)
    }

    const slugs = (data as unknown as { staff_role: { slug: string } }[])
      .map((row) => row.staff_role.slug)
      .sort()

    expect(slugs).toEqual(['admin', 'front-office'])
  })
})
