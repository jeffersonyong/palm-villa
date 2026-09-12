import { describe, expect, test } from 'vitest'

import { todayInBrunei } from '@/lib/domain/dates'
import { bnd } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { listAuditEvents } from './audit'
import { getBookingById } from './bookings'
import { cancelBooking, markBookingNoShow } from './close-booking'
import { addDepositCharge } from './deposit-charges'
import {
  getDepositByBookingId,
  listHeldDeposits,
  listPendingDeposits,
  topUpBookingDeposit,
  verifyDeposit,
} from './deposits'
import { currentPropertyId } from './property'
import { listKeptDeposits } from './reports'
import { givenBooking, givenTransferBooking } from './test/factory'

/**
 * Closing a booking without a stay, against the real database (prd.md §9.5;
 * capabilities B3 and B16).
 *
 * What these exist to prove is that the deposit cannot be left behind: a
 * cancellation or a no-show settles it in the same transaction as the status
 * move, the settled deposit leaves the ledger and — if kept — joins revenue,
 * and nothing afterwards can put money into a booking that closed. Each of those
 * is enforced in SQL (`close_booking()` and its trigger) precisely so a screen
 * cannot go around it, which is why they are tested here and not only in
 * lib/domain.
 */

const STAY = { checkIn: '2026-11-02', checkOut: '2026-11-05' } as const

/** A stay whose first night has already come, so a no-show is recordable. */
const ARRIVED = { checkIn: '2026-08-28', checkOut: '2026-08-31' } as const

const DEPOSIT = bnd(100)

async function actionsFor(entityType: string, entityId: string): Promise<readonly string[]> {
  const events = await listAuditEvents(entityType, entityId)

  return events.map((event) => event.action)
}

describe('cancelBooking', () => {
  test('keeping the deposit forfeits what is held, off the ledger and into revenue', async () => {
    const booking = await givenBooking({ unitRef: '3B-01', ...STAY })

    const result = await cancelBooking({
      bookingId: booking.id,
      actorId: null,
      reason: 'Guest cancelled by phone',
      depositOutcome: 'keep',
    })

    expect(result).toMatchObject({
      ok: true,
      status: 'cancelled',
      deposit: 'kept',
      amount: DEPOSIT,
    })

    const deposit = await getDepositByBookingId(booking.id)

    expect(deposit?.stage).toBe('forfeited')
    expect(deposit?.forfeiture?.amount).toBe(DEPOSIT)
    expect(deposit?.release).toBeNull()

    // E1's question is what the property owes back, and it no longer owes this.
    expect((await listHeldDeposits()).map((held) => held.bookingId)).not.toContain(booking.id)

    const today = todayInBrunei()
    const kept = await listKeptDeposits({ from: today, to: today })

    expect(kept).toEqual([expect.objectContaining({ stream: 'short_stay', amount: DEPOSIT })])

    expect(await actionsFor('deposit', deposit!.id)).toContain('deposit.forfeited')
    expect(await actionsFor('booking', booking.id)).toContain('booking.cancel')
  })

  test('giving it back records a release at the close, with no inspection', async () => {
    const booking = await givenBooking({ unitRef: '3B-02', ...STAY })

    const result = await cancelBooking({
      bookingId: booking.id,
      actorId: null,
      reason: 'Booked on the wrong unit by mistake',
      depositOutcome: 'return',
    })

    expect(result).toMatchObject({ ok: true, deposit: 'returned', amount: DEPOSIT })

    const deposit = await getDepositByBookingId(booking.id)

    expect(deposit?.stage).toBe('released')
    expect(deposit?.forfeiture).toBeNull()
    expect(deposit?.release).toMatchObject({
      releasedAmount: DEPOSIT,
      chargesTotal: 0,
      owed: 0,
      note: 'Booked on the wrong unit by mistake',
    })
    expect(deposit?.inspection).toBeNull()

    // Given back is not revenue.
    const today = todayInBrunei()

    expect(await listKeptDeposits({ from: today, to: today })).toEqual([])
    expect(await actionsFor('deposit', deposit!.id)).toContain('deposit.returned')
  })

  test('a promised transfer nobody verified keeps nothing, and leaves the queue', async () => {
    const { booking, deposit: promise } = await givenTransferBooking({
      unitRef: '3B-03',
      ...STAY,
    })

    expect(promise?.collectedAt).toBeNull()

    const result = await cancelBooking({
      bookingId: booking.id,
      actorId: null,
      reason: 'Guest never sent the money',
      depositOutcome: 'keep',
    })

    expect(result).toMatchObject({ ok: true, deposit: 'promise_lapsed', amount: 0 })
    expect((await getDepositByBookingId(booking.id))?.stage).toBe('lapsed')
    expect((await listPendingDeposits()).map((pending) => pending.bookingId)).not.toContain(
      booking.id,
    )

    // And the money turning up afterwards cannot be verified onto a booking
    // that is closed — the guard refuses it with a sentence, not a crash.
    const verified = await verifyDeposit({
      depositId: promise!.id,
      observedAmount: DEPOSIT,
      match: 'reference',
      actorId: null,
    })

    expect(verified).toMatchObject({ ok: false, error: { code: 'booking_closed' } })
    expect((await getDepositByBookingId(booking.id))?.collectedAt).toBeNull()
  })

  test('a deposit that arrived short is kept at what arrived, and cannot be topped up after', async () => {
    const { booking, deposit: promise } = await givenTransferBooking({
      unitRef: '3B-04',
      ...STAY,
    })

    await verifyDeposit({
      depositId: promise!.id,
      observedAmount: bnd(50),
      match: 'reference',
      overrideReason: 'Guest sent half now, the rest on Friday.',
      actorId: null,
    })

    const result = await cancelBooking({
      bookingId: booking.id,
      actorId: null,
      reason: 'Guest cancelled before sending the rest',
      depositOutcome: 'keep',
    })

    expect(result).toMatchObject({ ok: true, deposit: 'kept', amount: bnd(50) })
    expect((await getDepositByBookingId(booking.id))?.forfeiture?.amount).toBe(bnd(50))

    const toppedUp = await topUpBookingDeposit({
      bookingId: booking.id,
      amount: bnd(50),
      method: 'cash',
      actorId: null,
    })

    expect(toppedUp).toMatchObject({ ok: false, error: { code: 'deposit_kept' } })
    expect((await getDepositByBookingId(booking.id))?.amount).toBe(bnd(50))
  })

  test('a kept deposit closes its charges', async () => {
    const booking = await givenBooking({ unitRef: '3B-05', ...STAY })

    await cancelBooking({
      bookingId: booking.id,
      actorId: null,
      reason: 'Guest cancelled',
      depositOutcome: 'keep',
    })

    const deposit = await getDepositByBookingId(booking.id)
    const charged = await addDepositCharge({
      depositId: deposit!.id,
      amount: bnd(20),
      reason: 'Late key return',
      actorId: null,
    })

    expect(charged).toMatchObject({ ok: false, error: { code: 'deposit_kept' } })
  })

  test('a booking quoting no deposit closes with nothing to settle', async () => {
    const booking = await givenBooking({ unitRef: '3B-06', ...STAY, securityDeposit: 0 })

    const result = await cancelBooking({
      bookingId: booking.id,
      actorId: null,
      reason: 'Guest cancelled',
      depositOutcome: 'keep',
    })

    expect(result).toMatchObject({ ok: true, deposit: 'none', amount: 0 })
    expect(await getDepositByBookingId(booking.id)).toBeNull()
  })

  test('the plain transition refuses to cancel, so nothing closes around the deposit', async () => {
    const booking = await givenBooking({ unitRef: '3B-07', ...STAY })

    const { data, error } = await dataClient().rpc('transition_booking', {
      p_property_id: await currentPropertyId(),
      p_booking_id: booking.id,
      p_from_status: 'confirmed',
      p_to_status: 'cancelled',
      p_event: 'cancel',
      p_actor_id: null,
      p_reason: null,
    })

    expect(error).toBeNull()
    expect(data).toEqual({ ok: false, error: 'closes_through_close_booking' })
    expect((await getBookingById(booking.id))?.status).toBe('confirmed')
    expect((await getDepositByBookingId(booking.id))?.stage).toBe('secured')
  })
})

describe('markBookingNoShow', () => {
  test('keeps the deposit and puts the unit back on sale for the unused nights', async () => {
    const booking = await givenBooking({ unitRef: '3B-08', ...ARRIVED })

    const result = await markBookingNoShow({ bookingId: booking.id, actorId: null })

    expect(result).toMatchObject({ ok: true, status: 'no_show', deposit: 'kept', amount: DEPOSIT })
    expect((await getDepositByBookingId(booking.id))?.stage).toBe('forfeited')

    const kept = await listAuditEvents('deposit', (await getDepositByBookingId(booking.id))!.id)

    expect(kept.find((event) => event.action === 'deposit.forfeited')?.after).toMatchObject({
      booking_event: 'mark_no_show',
    })

    // The same unit and the same nights sell again. Before `no_show` joined
    // the exclusion constraint's `where`, this was refused.
    const resold = await givenBooking({ unitRef: '3B-08', ...ARRIVED })

    expect(resold.status).toBe('confirmed')
  })

  test('is refused before the arrival day, and nothing moves', async () => {
    const booking = await givenBooking({
      unitRef: '3B-09',
      checkIn: '2027-01-10',
      checkOut: '2027-01-12',
    })

    const result = await markBookingNoShow({ bookingId: booking.id, actorId: null })

    expect(result).toMatchObject({ ok: false, error: { code: 'before_arrival_day' } })
    expect((await getBookingById(booking.id))?.status).toBe('confirmed')
    expect((await getDepositByBookingId(booking.id))?.stage).toBe('secured')
  })

  test('only a confirmed booking can be a no-show', async () => {
    const { booking } = await givenTransferBooking({ unitRef: '3B-10', ...ARRIVED })

    const result = await markBookingNoShow({ bookingId: booking.id, actorId: null })

    expect(result).toMatchObject({ ok: false, error: { code: 'illegal_transition' } })
  })
})

describe('a booking closed before deposits were settled on close', () => {
  test('takes no charge against the deposit it still holds', async () => {
    const booking = await givenBooking({ unitRef: '3B-11', ...STAY })

    // The shape a cancellation left before 20260922000100: status moved, the
    // deposit untouched. Written directly because no path can produce it now.
    const { error } = await dataClient()
      .from('booking')
      .update({ status: 'cancelled' })
      .eq('id', booking.id)

    expect(error).toBeNull()

    const deposit = await getDepositByBookingId(booking.id)

    expect(deposit?.stage).toBe('secured')

    const charged = await addDepositCharge({
      depositId: deposit!.id,
      amount: bnd(20),
      reason: 'Late key return',
      actorId: null,
    })

    expect(charged).toMatchObject({ ok: false, error: { code: 'booking_closed' } })
  })
})
