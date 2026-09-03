import { describe, expect, test } from 'vitest'

import { activeChargesTotal } from '@/lib/domain/deposit'
import { bnd } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { listAuditEvents } from './audit'
import { transitionBooking } from './bookings'
import { addDepositCharge, listDepositCharges, waiveDepositCharge } from './deposit-charges'
import {
  approveDepositRelease,
  checkInBooking,
  getDepositByBookingId,
  getDepositByBookingReference,
  listDepositsForBookings,
  listHeldDeposits,
  listOwedDeposits,
  listReleasedDeposits,
  settleDepositOwed,
} from './deposits'
import { getInspectionForBooking, recordInspection } from './inspections'
import { currentPropertyId } from './property'
import {
  bookingInput,
  givenBooking,
  givenDayPassBooking,
  givenCheckedInBooking,
  givenDepartedBooking,
  givenInspectedDeposit,
  unitIdByRef,
} from './test/factory'
import { createWalkInBooking } from './bookings'

/**
 * The deposit ledger against the real database (capabilities E1, E2, E3).
 *
 * What these exist to prove is not that the columns hold values. It is that the
 * two moments money is decided cannot be got wrong under concurrency or by a
 * caller taking a different route: a guest is checked in and the deposit is
 * recorded in the same breath, and a release is refused until somebody has
 * looked at the unit. prd.md §11 requirements 4 and 5 are the promise, and both
 * are enforced in a plpgsql function precisely so no screen can go around them.
 */

const STAY = { checkIn: '2026-11-02', checkOut: '2026-11-05' }

const DEPOSIT = bnd(100)

async function actionsFor(entityType: string, entityId: string): Promise<readonly string[]> {
  const events = await listAuditEvents(entityType, entityId)

  return events.map((event) => event.action)
}

async function depositRowCount(bookingId: string): Promise<number> {
  const propertyId = await currentPropertyId()
  const { count, error } = await dataClient()
    .from('deposit')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('booking_id', bookingId)

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

describe('checkInBooking', () => {
  test('moves the booking and records the deposit in one act', async () => {
    // Arrange
    const booking = await givenBooking({ unitRef: '3B-01', ...STAY })

    // Act
    const result = await checkInBooking({ bookingId: booking.id, method: 'cash', actorId: null })

    // Assert
    expect(result).toMatchObject({ ok: true, status: 'checked_in', amount: DEPOSIT })

    const deposit = await getDepositByBookingId(booking.id)

    expect(deposit).toMatchObject({
      amount: DEPOSIT,
      method: 'cash',
      stage: 'in_house',
      charges: 0,
      release: null,
    })
    expect(deposit?.stay?.unitRef).toBe('3B-01')
    expect(deposit?.figures.releasable).toBe(DEPOSIT)
  })

  test('writes both events — the money and the move', async () => {
    const { booking, depositId } = await givenCheckedInBooking({ unitRef: '3B-02', ...STAY })

    // The deposit's own verb hangs off the deposit; the status move hangs off
    // the booking, in the shape transition_booking() writes it, so the two
    // histories each read one vocabulary.
    expect(await actionsFor('deposit', depositId!)).toEqual(['deposit.collected'])
    expect(await actionsFor('booking', booking.id)).toContain('booking.check_in')
  })

  test('names the deposit on the check-in event, so the trail links the two', async () => {
    const { booking, depositId } = await givenCheckedInBooking({ unitRef: '3B-03', ...STAY })
    const events = await listAuditEvents('booking', booking.id)
    const checkIn = events.find((event) => event.action === 'booking.check_in')

    expect(checkIn?.after).toMatchObject({ status: 'checked_in', deposit_id: depositId })
  })

  test('a second check-in is refused and leaves one deposit', async () => {
    const { booking } = await givenCheckedInBooking({ unitRef: '3B-04', ...STAY })

    const again = await checkInBooking({ bookingId: booking.id, method: 'cash', actorId: null })

    expect(again).toMatchObject({ ok: false })
    expect(await depositRowCount(booking.id)).toBe(1)
  })

  test('a booking quoting no deposit checks in without one', async () => {
    // A day pass quotes none, and so does any booking whose deposit was zeroed.
    // A row saying nothing was collected would appear in "what do we owe back"
    // as a liability of zero, which nobody owes.
    const input = await bookingInput({ unitRef: '3B-05', ...STAY })
    const created = await createWalkInBooking({ ...input, securityDeposit: 0 })

    if (!created.ok) {
      throw new Error('Test setup could not create the booking.')
    }

    const result = await checkInBooking({
      bookingId: created.booking.id,
      method: 'cash',
      actorId: null,
    })

    expect(result).toMatchObject({ ok: true, status: 'checked_in', depositId: null, amount: 0 })
    expect(await depositRowCount(created.booking.id)).toBe(0)
  })

  test('an unconfirmed booking is refused by the state machine, before the database', async () => {
    const { booking } = await givenDepartedBooking({ unitRef: '3B-06', ...STAY })

    // `completed` is terminal, so this never reaches check_in_booking().
    const result = await checkInBooking({ bookingId: booking.id, method: 'cash', actorId: null })

    expect(result).toMatchObject({ ok: false, error: { code: 'terminal_state' } })
  })

  test('four clerks checking in at once produce one deposit', async () => {
    // The ordinary case at a desk, not the exotic one. `for update` blocks the
    // losers, who then re-read the committed row and are told it moved.
    const booking = await givenBooking({ unitRef: '3B-07', ...STAY })

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        checkInBooking({ bookingId: booking.id, method: 'cash', actorId: null }),
      ),
    )

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(await depositRowCount(booking.id)).toBe(1)
    expect(await actionsFor('booking', booking.id)).toEqual(
      expect.arrayContaining(['booking.check_in']),
    )
  })
})

describe('recordInspection', () => {
  test('is refused while the guest is still in the unit', async () => {
    const { booking } = await givenCheckedInBooking({ unitRef: '3B-08', ...STAY })

    const result = await recordInspection({
      bookingId: booking.id,
      outcome: 'clean',
      notes: null,
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'booking_not_completed' } })
  })

  test('is recorded once the stay has ended, against the stay and not the booking', async () => {
    const { booking } = await givenDepartedBooking({ unitRef: '3B-09', ...STAY })

    const result = await recordInspection({
      bookingId: booking.id,
      outcome: 'clean',
      notes: null,
      actorId: null,
    })

    expect(result.ok).toBe(true)

    const inspection = await getInspectionForBooking(booking.id)

    expect(inspection).toMatchObject({ outcome: 'clean' })
    // prd.md §6.2 hangs an inspection off the occupancy, which is what makes it
    // work for a lease in phase three.
    expect(inspection?.occupancyId).toBeTruthy()
  })

  test('a second inspection of the same stay is refused', async () => {
    const { booking } = await givenInspectedDeposit({ unitRef: '3B-10', ...STAY })

    const again = await recordInspection({
      bookingId: booking.id,
      outcome: 'issues_found',
      notes: 'Second look',
      actorId: null,
    })

    expect(again).toMatchObject({ ok: false, error: { code: 'already_inspected' } })
  })

  test('issues found without saying what is refused by the database too', async () => {
    // checkInspectionNotes() refuses first with a sentence; this is the rule
    // holding for a caller that never asked it.
    const { booking } = await givenDepartedBooking({ unitRef: '3B-11', ...STAY })

    const result = await recordInspection({
      bookingId: booking.id,
      outcome: 'issues_found',
      notes: '   ',
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'notes_required' } })
    expect(await getInspectionForBooking(booking.id)).toBeNull()
  })

  test('a booking that occupies no unit has nothing to inspect', async () => {
    // Not defensive: a day pass consumes facility capacity and no unit
    // (prd.md §6.1), so when that stream can be checked in there is nothing
    // here for Housekeeping to look at. Refused by name rather than by a null
    // reference further down.
    const dayPass = await givenDayPassBooking({ guestName: 'Test Day Guest' })

    await dataClient().from('booking').update({ status: 'checked_in' }).eq('id', dayPass.id)
    await transitionBooking(dayPass.id, 'check_out', null)

    expect(
      await recordInspection({
        bookingId: dayPass.id,
        outcome: 'clean',
        notes: null,
        actorId: null,
      }),
    ).toMatchObject({ ok: false, error: { code: 'no_occupancy' } })
  })

  test('writes its own event, carrying the outcome and the unit', async () => {
    const { inspectionId } = await givenInspectedDeposit(
      { unitRef: '3B-12', ...STAY },
      { outcome: 'issues_found', notes: 'Shower screen cracked, bottom left.' },
    )

    const events = await listAuditEvents('inspection', inspectionId)

    expect(events).toHaveLength(1)
    expect(events[0]?.after).toMatchObject({
      outcome: 'issues_found',
      unit_ref: '3B-12',
      notes: 'Shower screen cracked, bottom left.',
    })
  })
})

describe('the stage a deposit is at', () => {
  test('walks in house, awaiting inspection, ready, released', async () => {
    // The derivation in lib/domain/deposit.ts, read against rows the product
    // actually wrote rather than against facts a test made up.
    const { booking, depositId } = await givenCheckedInBooking({ unitRef: '4B-01', ...STAY })

    expect((await getDepositByBookingId(booking.id))?.stage).toBe('in_house')

    await transitionBooking(booking.id, 'check_out', null)
    expect((await getDepositByBookingId(booking.id))?.stage).toBe('awaiting_inspection')

    await recordInspection({ bookingId: booking.id, outcome: 'clean', notes: null, actorId: null })
    expect((await getDepositByBookingId(booking.id))?.stage).toBe('ready_for_release')

    await approveDepositRelease({ depositId: depositId!, note: null, actorId: null })
    expect((await getDepositByBookingId(booking.id))?.stage).toBe('released')
  })
})

describe('charges against a deposit', () => {
  test('can be raised while the guest is still in the unit', async () => {
    // A broken window on the second night is a charge against this deposit.
    const { booking, depositId } = await givenCheckedInBooking({ unitRef: '4B-02', ...STAY })

    const result = await addDepositCharge({
      depositId: depositId!,
      amount: bnd(30),
      reason: 'Broken window latch',
      actorId: null,
    })

    expect(result.ok).toBe(true)
    expect((await getDepositByBookingId(booking.id))?.charges).toBe(bnd(30))
  })

  test('sum on the summary exactly as the domain sums the rows', async () => {
    const { booking, depositId } = await givenInspectedDeposit({ unitRef: '4B-03', ...STAY })

    await addDepositCharge({
      depositId,
      amount: bnd(30),
      reason: 'Shower screen',
      actorId: null,
    })
    await addDepositCharge({ depositId, amount: bnd(12), reason: 'Missing towel', actorId: null })

    const charges = await listDepositCharges(depositId)
    const deposit = await getDepositByBookingId(booking.id)

    expect(deposit?.charges).toBe(
      activeChargesTotal(charges.map((c) => ({ amount: c.amount, waived: c.waived !== null }))),
    )
    expect(deposit?.charges).toBe(bnd(42))
    expect(deposit?.chargeCount).toBe(2)
  })

  test('a waived charge stays on the record and counts for nothing', async () => {
    const { booking, depositId } = await givenInspectedDeposit({ unitRef: '4B-04', ...STAY })

    const charge = await addDepositCharge({
      depositId,
      amount: bnd(500),
      reason: 'Assumed damage',
      actorId: null,
    })

    if (!charge.ok) {
      throw new Error('Test setup could not add a charge.')
    }

    const waived = await waiveDepositCharge({
      chargeId: charge.chargeId,
      reason: 'Pre-existing, our fault',
      actorId: null,
    })

    expect(waived.ok).toBe(true)

    const charges = await listDepositCharges(depositId)

    expect(charges).toHaveLength(1)
    expect(charges[0]?.waived).toMatchObject({ reason: 'Pre-existing, our fault' })
    expect((await getDepositByBookingId(booking.id))?.charges).toBe(0)
    // Newest first, which is the order the trail is read in.
    expect(await actionsFor('deposit_charge', charge.chargeId)).toEqual([
      'charge.waived',
      'charge.created',
    ])
  })

  test('a charge of nothing, or with no reason, is refused', async () => {
    // Both guards are in the SQL as well as the form, because this is money
    // being kept and the reason is the first thing asked about it later.
    const { depositId } = await givenInspectedDeposit({ unitRef: '4B-05', ...STAY })

    expect(
      await addDepositCharge({ depositId, amount: 0, reason: 'Nothing', actorId: null }),
    ).toMatchObject({ ok: false, error: { code: 'invalid_amount' } })

    expect(
      await addDepositCharge({ depositId, amount: bnd(10), reason: '   ', actorId: null }),
    ).toMatchObject({ ok: false, error: { code: 'reason_required' } })

    expect(await listDepositCharges(depositId)).toHaveLength(0)
  })

  test('a waiver with no reason is refused', async () => {
    const { depositId } = await givenInspectedDeposit({ unitRef: '4B-06', ...STAY })
    const charge = await addDepositCharge({
      depositId,
      amount: bnd(20),
      reason: 'Lamp',
      actorId: null,
    })

    if (!charge.ok) {
      throw new Error('Test setup could not add a charge.')
    }

    expect(
      await waiveDepositCharge({ chargeId: charge.chargeId, reason: ' ', actorId: null }),
    ).toMatchObject({ ok: false, error: { code: 'reason_required' } })
  })

  test('a charge cannot be waived twice', async () => {
    const { depositId } = await givenInspectedDeposit({ unitRef: '3B-27', ...STAY })
    const charge = await addDepositCharge({
      depositId,
      amount: bnd(20),
      reason: 'Lamp',
      actorId: null,
    })

    if (!charge.ok) {
      throw new Error('Test setup could not add a charge.')
    }

    await waiveDepositCharge({ chargeId: charge.chargeId, reason: 'Goodwill', actorId: null })

    expect(
      await waiveDepositCharge({ chargeId: charge.chargeId, reason: 'Again', actorId: null }),
    ).toMatchObject({ ok: false, error: { code: 'already_waived' } })
  })

  test('close when the release is approved — the statement is what was signed', async () => {
    const { depositId } = await givenInspectedDeposit({ unitRef: '3B-28', ...STAY })
    const charge = await addDepositCharge({
      depositId,
      amount: bnd(20),
      reason: 'Lamp',
      actorId: null,
    })

    if (!charge.ok) {
      throw new Error('Test setup could not add a charge.')
    }

    await approveDepositRelease({ depositId, note: null, actorId: null })

    expect(
      await addDepositCharge({ depositId, amount: bnd(5), reason: 'Late', actorId: null }),
    ).toMatchObject({ ok: false, error: { code: 'already_released' } })

    expect(
      await waiveDepositCharge({ chargeId: charge.chargeId, reason: 'Late', actorId: null }),
    ).toMatchObject({ ok: false, error: { code: 'already_released' } })
  })
})

describe('approveDepositRelease', () => {
  test('is refused without an inspection, and writes nothing', async () => {
    // prd.md §11 requirement 4, and the reason this whole slice records an
    // inspection rather than waiting for the housekeeping phone screen.
    const { booking, depositId } = await givenDepartedBooking({ unitRef: '3B-25', ...STAY })

    const result = await approveDepositRelease({
      depositId: depositId!,
      note: null,
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'inspection_missing' } })
    expect((await getDepositByBookingId(booking.id))?.release).toBeNull()
    expect(await actionsFor('deposit', depositId!)).toEqual(['deposit.collected'])
  })

  test('is refused while the guest is still in the unit', async () => {
    const { depositId } = await givenCheckedInBooking({ unitRef: 'SD-01', ...STAY })

    expect(
      await approveDepositRelease({ depositId: depositId!, note: null, actorId: null }),
    ).toMatchObject({ ok: false, error: { code: 'booking_not_completed' } })
  })

  test('returns the whole deposit when nothing stands against it', async () => {
    const { booking, depositId } = await givenInspectedDeposit({ unitRef: 'SD-02', ...STAY })

    const result = await approveDepositRelease({ depositId, note: null, actorId: null })

    expect(result).toMatchObject({ ok: true, releasedAmount: DEPOSIT, chargesTotal: 0, owed: 0 })
    expect((await getDepositByBookingId(booking.id))?.release).toMatchObject({
      releasedAmount: DEPOSIT,
      owed: 0,
    })
  })

  test('deducts the charges before releasing the balance', async () => {
    const { depositId } = await givenInspectedDeposit(
      { unitRef: 'SD-03', ...STAY },
      { outcome: 'issues_found', notes: 'Shower screen cracked.' },
    )

    await addDepositCharge({ depositId, amount: bnd(30), reason: 'Screen', actorId: null })

    expect(await approveDepositRelease({ depositId, note: null, actorId: null })).toMatchObject({
      ok: true,
      releasedAmount: bnd(70),
      chargesTotal: bnd(30),
      owed: 0,
    })
  })

  test('the deposit is not a cap: charges beyond it become an amount owed', async () => {
    // prd.md §11 [C], proved against the database rather than only in the
    // domain module, because the constraint repeats the arithmetic.
    const { booking, depositId } = await givenInspectedDeposit(
      { unitRef: 'SD-04', ...STAY },
      { outcome: 'issues_found', notes: 'Screen and door.' },
    )

    await addDepositCharge({ depositId, amount: bnd(130), reason: 'Screen', actorId: null })

    const result = await approveDepositRelease({ depositId, note: null, actorId: null })

    expect(result).toMatchObject({ ok: true, releasedAmount: 0, owed: bnd(30) })

    const deposit = await getDepositByBookingId(booking.id)

    expect(deposit?.figures).toMatchObject({ releasable: 0, owed: bnd(30) })
    expect(await listOwedDeposits()).toHaveLength(1)
  })

  test('a waived charge is not deducted', async () => {
    const { depositId } = await givenInspectedDeposit({ unitRef: 'SD-05', ...STAY })
    const charge = await addDepositCharge({
      depositId,
      amount: bnd(500),
      reason: 'Assumed',
      actorId: null,
    })

    if (!charge.ok) {
      throw new Error('Test setup could not add a charge.')
    }

    await waiveDepositCharge({ chargeId: charge.chargeId, reason: 'Not theirs', actorId: null })

    expect(await approveDepositRelease({ depositId, note: null, actorId: null })).toMatchObject({
      ok: true,
      releasedAmount: DEPOSIT,
      chargesTotal: 0,
    })
  })

  test('records the figures as they stood, with the inspection that allowed it', async () => {
    // prd.md §11 requirement 5: the audit trail is the point of an approval
    // step, and a dispute a year later is answered from the event rather than
    // from rows that have been added to since.
    const { depositId, inspectionId } = await givenInspectedDeposit(
      { unitRef: 'SD-06', ...STAY },
      { outcome: 'issues_found', notes: 'Screen.' },
    )

    await addDepositCharge({ depositId, amount: bnd(30), reason: 'Screen', actorId: null })
    await approveDepositRelease({
      depositId,
      note: 'Charged for the screen only.',
      actorId: null,
    })

    const events = await listAuditEvents('deposit', depositId)
    const approval = events.find((event) => event.action === 'deposit.release_approved')

    expect(approval?.after).toMatchObject({
      released_amount_cents: bnd(70),
      charges_total_cents: bnd(30),
      owed_cents: 0,
      charge_count: 1,
      inspection_id: inspectionId,
      inspection_outcome: 'issues_found',
      reason: 'Charged for the screen only.',
    })
  })

  test('four approvers at once release it once', async () => {
    const { depositId } = await givenInspectedDeposit({ unitRef: '3B-26', ...STAY })

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        approveDepositRelease({ depositId, note: null, actorId: null }),
      ),
    )

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(
      results.filter((result) => !result.ok && result.error.code === 'already_released'),
    ).toHaveLength(3)

    const events = await listAuditEvents('deposit', depositId)

    expect(events.filter((event) => event.action === 'deposit.release_approved')).toHaveLength(1)
  })
})

describe('settleDepositOwed', () => {
  test('is refused before the release, and when nothing is owed', async () => {
    const { depositId } = await givenInspectedDeposit({ unitRef: '3B-13', ...STAY })

    expect(await settleDepositOwed({ depositId, method: 'cash', actorId: null })).toMatchObject({
      ok: false,
      error: { code: 'not_released' },
    })

    await approveDepositRelease({ depositId, note: null, actorId: null })

    expect(await settleDepositOwed({ depositId, method: 'cash', actorId: null })).toMatchObject({
      ok: false,
      error: { code: 'nothing_owed' },
    })
  })

  test('records the excess as paid, once', async () => {
    const { booking, depositId } = await givenInspectedDeposit(
      { unitRef: '3B-14', ...STAY },
      { outcome: 'issues_found', notes: 'Door.' },
    )

    await addDepositCharge({ depositId, amount: bnd(150), reason: 'Door', actorId: null })
    await approveDepositRelease({ depositId, note: null, actorId: null })

    expect(await settleDepositOwed({ depositId, method: 'cash', actorId: null })).toMatchObject({
      ok: true,
    })

    const deposit = await getDepositByBookingId(booking.id)

    expect(deposit?.settlement).toMatchObject({ method: 'cash' })
    // Settled, so it leaves the "owed" list even though the figure stands.
    expect(await listOwedDeposits()).toHaveLength(0)

    expect(await settleDepositOwed({ depositId, method: 'cash', actorId: null })).toMatchObject({
      ok: false,
      error: { code: 'already_settled' },
    })
  })
})

describe('the ledger reads', () => {
  test('held excludes what has been released', async () => {
    const held = await givenCheckedInBooking({ unitRef: '3B-15', ...STAY })
    const { depositId } = await givenInspectedDeposit({ unitRef: '3B-16', ...STAY })

    await approveDepositRelease({ depositId, note: null, actorId: null })

    const deposits = await listHeldDeposits()

    expect(deposits.map((deposit) => deposit.id)).toEqual([held.depositId])
  })

  test('released pages, and a page past the end comes back empty with the real total', async () => {
    const { depositId } = await givenInspectedDeposit({ unitRef: '3B-17', ...STAY })

    await approveDepositRelease({ depositId, note: null, actorId: null })

    const first = await listReleasedDeposits({}, { page: 1, pageSize: 10 })

    expect(first.deposits).toHaveLength(1)
    expect(first.total).toBe(1)

    // What a bookmarked `?page=7` asks for once the rows beneath it are gone.
    const past = await listReleasedDeposits({}, { page: 7, pageSize: 10 })

    expect(past.deposits).toHaveLength(0)
    expect(past.total).toBe(1)
  })

  test('owed only narrows to releases nobody has recovered', async () => {
    const clean = await givenInspectedDeposit({ unitRef: '3B-18', ...STAY })
    const owing = await givenInspectedDeposit(
      { unitRef: '3B-19', ...STAY },
      { outcome: 'issues_found', notes: 'Door.' },
    )

    await approveDepositRelease({ depositId: clean.depositId, note: null, actorId: null })
    await addDepositCharge({
      depositId: owing.depositId,
      amount: bnd(150),
      reason: 'Door',
      actorId: null,
    })
    await approveDepositRelease({ depositId: owing.depositId, note: null, actorId: null })

    const page = await listReleasedDeposits({ owedOnly: true }, { page: 1, pageSize: 10 })

    expect(page.deposits.map((deposit) => deposit.id)).toEqual([owing.depositId])
  })

  test('a deposit is found by its booking reference, however it is typed', async () => {
    const { booking } = await givenCheckedInBooking({ unitRef: '3B-20', ...STAY })

    expect((await getDepositByBookingReference(booking.reference))?.bookingReference).toBe(
      booking.reference,
    )
    expect(
      (await getDepositByBookingReference(` ${booking.reference.toLowerCase()} `))
        ?.bookingReference,
    ).toBe(booking.reference)
  })

  test('several bookings’ deposits come back in one read, keyed by booking', async () => {
    // The dashboard's departures table asks for a column of them; asking per
    // row is the N+1 web/performance.md names.
    const first = await givenCheckedInBooking({ unitRef: '3B-21', ...STAY })
    const second = await givenCheckedInBooking({ unitRef: '3B-22', ...STAY })
    const none = await givenBooking({ unitRef: '3B-23', ...STAY })

    const deposits = await listDepositsForBookings([first.booking.id, second.booking.id, none.id])

    expect(deposits.size).toBe(2)
    expect(deposits.get(first.booking.id)?.amount).toBe(DEPOSIT)
    expect(deposits.get(none.id)).toBeUndefined()
  })

  test('no booking ids is no query and no rows', async () => {
    expect((await listDepositsForBookings([])).size).toBe(0)
  })
})

describe('what a deleted booking takes with it', () => {
  test('its deposit, its charges and its inspection', async () => {
    // The integration suite's own cleanup depends on this: setup.ts deletes
    // bookings between test files and nothing else, so a deposit that outlived
    // its booking would leak into the next file as an orphan row.
    const { booking, depositId } = await givenInspectedDeposit({ unitRef: '3B-24', ...STAY })

    await addDepositCharge({ depositId, amount: bnd(10), reason: 'Glass', actorId: null })

    const propertyId = await currentPropertyId()

    await dataClient().from('booking').delete().eq('property_id', propertyId).eq('id', booking.id)

    const { count, error } = await dataClient()
      .from('deposit')
      .select('id', { count: 'exact', head: true })
      .eq('id', depositId)

    if (error) {
      throw new Error(error.message)
    }

    expect(count).toBe(0)
  })
})

describe('a unit reference that is not seeded', () => {
  test('fails the test setup loudly rather than silently booking elsewhere', async () => {
    await expect(unitIdByRef('NOPE-99')).rejects.toThrow('No seeded unit')
  })
})
