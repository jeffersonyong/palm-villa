import { afterEach, beforeAll, describe, expect, test } from 'vitest'

import { planRegistry, type CurrentUnit } from '@/lib/domain/unit-ref'

import { listAuditEventWindow, listAuditEvents } from './audit'
import { countAvailableByType, findAvailableUnits } from './bookings'
import { getUnitCounts } from './inventory'
import {
  applyUnitRegistry,
  endUnitLease,
  getUnitStateByRef,
  listUnitRegistry,
  listUnitStates,
  markUnitLeased,
  markUnitOutOfService,
  returnUnitToService,
  setUnitNotes,
} from './units'
import { givenBooking, givenLease, givenUnitOutOfService, unitIdByRef } from './test/factory'
import { dataClient } from '@/lib/supabase/data'
import { currentPropertyId } from './property'

/**
 * The units board and the unit registry, against the real database
 * (capabilities B8, B9 and F6).
 *
 * Two of these tests exist because of a specific hazard rather than a feature,
 * and both say so where they sit: the lease-availability regression, and the
 * reference swap. Either one silently regressing costs a guest their room or a
 * building its names.
 */

const RANGE = { start: '2026-10-05', end: '2026-10-08' }

/**
 * The seeded registry, and putting it back.
 *
 * `clearTransactionalData` deliberately leaves the `unit` table alone — it is
 * seeded inventory, not transactional data, and every other test file depends
 * on the 48 units being there under the names the seed gave them. This file is
 * the one that renames and resizes the building on purpose, so it is the one
 * that has to put it back; leaving that to the shared setup would mean teaching
 * it the seed's numbering scheme, which is a copy that would drift.
 *
 * Snapshotted before the first test, so it captures the seed rather than
 * anything this file did.
 */
interface SeededUnit {
  id: string
  ref: string
  unit_type_id: string
  property_id: string
}

let seededUnits: SeededUnit[] = []

beforeAll(async () => {
  const { data, error } = await dataClient()
    .from('unit')
    .select('id, ref, unit_type_id, property_id')

  if (error) {
    throw new Error(`Could not snapshot the seeded units: ${error.message}`)
  }

  seededUnits = data as SeededUnit[]
})

afterEach(async () => {
  const db = dataClient()
  const propertyId = await currentPropertyId()
  const seededIds = seededUnits.map((unit) => unit.id)

  // Anything this file created. Safe to delete outright: a unit with occupancy
  // history could not have been created here and survived the same test.
  const removed = await db
    .from('unit')
    .delete()
    .eq('property_id', propertyId)
    .not('id', 'in', `(${seededIds.join(',')})`)

  if (removed.error) {
    throw new Error(`Could not remove test units: ${removed.error.message}`)
  }

  const { data, error } = await db.from('unit').select('id, ref').eq('property_id', propertyId)

  if (error) {
    throw new Error(`Could not re-read units: ${error.message}`)
  }

  const now = new Map((data as { id: string; ref: string }[]).map((u) => [u.id, u.ref]))

  // Restore in two passes, parked out of the way first: a rename back can cross
  // its own uniqueness exactly as the ones under test do, and this runs outside
  // apply_unit_registry() and so outside its deferral.
  for (const unit of seededUnits) {
    if (now.has(unit.id) && now.get(unit.id) !== unit.ref) {
      await db
        .from('unit')
        .update({ ref: `restoring-${unit.id.slice(0, 8)}` })
        .eq('id', unit.id)
    }
  }

  for (const unit of seededUnits) {
    if (!now.has(unit.id)) {
      const reinserted = await db.from('unit').insert({
        id: unit.id,
        property_id: unit.property_id,
        unit_type_id: unit.unit_type_id,
        ref: unit.ref,
      })

      if (reinserted.error) {
        throw new Error(`Could not restore unit ${unit.ref}: ${reinserted.error.message}`)
      }
    } else if (now.get(unit.id) !== unit.ref) {
      await db.from('unit').update({ ref: unit.ref }).eq('id', unit.id)
    }
  }
})

/**
 * The newest `count` audit actions against an entity.
 *
 * Unit ids are seeded and therefore stable across tests, and `audit_event` is
 * append-only and never cleared between them (architecture.md §4) — so the
 * trail against 3B-04 accumulates through the file. Asserting on the newest few
 * is what makes these assertions about the action just taken rather than about
 * the order the file happens to run in.
 */
async function latestActions(entityId: string, count: number): Promise<readonly string[]> {
  const events = await listAuditEvents('unit', entityId)

  return events.slice(0, count).map((event) => event.action)
}

describe('taking a unit out of service (B9)', () => {
  test('the unit leaves availability entirely', async () => {
    await givenUnitOutOfService('3B-04', 'Aircon fault')

    const available = await findAvailableUnits({ range: RANGE })

    // The condition architecture.md §5.1 set for this column existing at all:
    // availability reads it. A flag the availability query ignored would be
    // exactly the "unread status column" that section refuses.
    expect(available.map((unit) => unit.ref)).not.toContain('3B-04')
    expect(available).toHaveLength(47)
  })

  test('the per-type count drops with it', async () => {
    await givenUnitOutOfService('3B-04', 'Aircon fault')

    expect((await countAvailableByType(RANGE))['three-bedroom']).toBe(35)
  })

  test('the serviceable inventory count drops, and the plain one does not', async () => {
    await givenUnitOutOfService('3B-04', 'Aircon fault')

    // These answer two different questions. "How many units are there" is 36;
    // "how many could take a guest" is 35, and that is the denominator of
    // "3 of 36 free" on the booking screen.
    expect((await getUnitCounts())['three-bedroom']).toBe(36)
    expect((await getUnitCounts({ serviceableOnly: true }))['three-bedroom']).toBe(35)
  })

  test('is refused while the unit still has a booking on it, naming the booking', async () => {
    const booking = await givenBooking({
      unitRef: '3B-05',
      checkIn: RANGE.start,
      checkOut: RANGE.end,
    })

    const result = await markUnitOutOfService({
      unitId: await unitIdByRef('3B-05'),
      reason: 'Aircon fault',
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('unit_has_bookings')
    // The refusal has to be actionable: a clerk who is told "no" without being
    // told which booking is in the way has to go and find it.
    expect(result.error.message).toContain(booking.reference)
  })

  test('succeeds once that booking is cancelled', async () => {
    const booking = await givenBooking({
      unitRef: '3B-05',
      checkIn: RANGE.start,
      checkOut: RANGE.end,
    })

    const unitId = await unitIdByRef('3B-05')
    expect((await markUnitOutOfService({ unitId, reason: 'x', actorId: null })).ok).toBe(false)

    const { transitionBooking } = await import('./bookings')
    await transitionBooking(booking.id, 'cancel', null, 'Making way for maintenance')

    // A cancelled occupancy releases its unit — the same predicate the
    // exclusion constraint uses — so the refusal lifts with it.
    expect((await markUnitOutOfService({ unitId, reason: 'x', actorId: null })).ok).toBe(true)
  })

  test('cannot be done twice', async () => {
    const unitId = await givenUnitOutOfService('3B-04')

    const result = await markUnitOutOfService({ unitId, reason: 'Again', actorId: null })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('already_out_of_service')
  })

  test('returning it to service puts it back in availability', async () => {
    const unitId = await givenUnitOutOfService('3B-04', 'Aircon fault')

    expect((await returnUnitToService({ unitId, actorId: null })).ok).toBe(true)
    expect((await findAvailableUnits({ range: RANGE })).map((u) => u.ref)).toContain('3B-04')
  })

  test('returning a unit that is already in service is refused', async () => {
    const result = await returnUnitToService({
      unitId: await unitIdByRef('3B-04'),
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not_out_of_service')
  })

  test('records one audit event against the unit each way', async () => {
    const unitId = await givenUnitOutOfService('3B-04', 'Aircon fault')
    await returnUnitToService({ unitId, actorId: null })

    expect(await latestActions(unitId, 2)).toEqual([
      'unit.returned_to_service',
      'unit.marked_out_of_service',
    ])
  })
})

describe('a long lease (B9)', () => {
  test('THE REGRESSION: a leased unit is not offered as free', async () => {
    // ── Why this test is worth its weight ─────────────────────────────────
    //
    // available_units() filtered occupancies with
    //   `o.booking_id is distinct from p_exclude_booking_id`
    // which was correct while every occupancy had a booking. A lease has none,
    // and on an ordinary call p_exclude_booking_id is null — so the predicate
    // became `null is distinct from null`, which is FALSE, and every lease row
    // was skipped. The unit would have been reported free and sold out from
    // under its tenant.
    //
    // 20260904000100 guards the exclusion on there being a booking to exclude.
    // Delete that guard and this test fails; nothing else in the suite would.
    await givenLease({ unitRef: '3B-01', start: '2026-10-01', end: '2027-04-01' })

    const available = await findAvailableUnits({ range: RANGE })

    expect(available.map((unit) => unit.ref)).not.toContain('3B-01')
  })

  test('and is still not offered while another booking is being amended', async () => {
    const booking = await givenBooking({
      unitRef: '3B-02',
      checkIn: RANGE.start,
      checkOut: RANGE.end,
    })
    await givenLease({ unitRef: '3B-01', start: '2026-10-01', end: '2027-04-01' })

    const available = await findAvailableUnits({
      range: RANGE,
      excludeBookingId: booking.id,
    })

    // The exclusion means "skip this one booking's own row", never "skip every
    // row without a booking".
    expect(available.map((unit) => unit.ref)).not.toContain('3B-01')
    expect(available.map((unit) => unit.ref)).toContain('3B-02')
  })

  test('the per-type count sees it gone too', async () => {
    await givenLease({ unitRef: '3B-01', start: '2026-10-01', end: '2027-04-01' })

    expect((await countAvailableByType(RANGE))['three-bedroom']).toBe(35)
  })

  test('the unit is free again for dates before the lease begins', async () => {
    await givenLease({ unitRef: '3B-01', start: '2026-11-01', end: '2027-04-01' })

    const before = await findAvailableUnits({ range: { start: '2026-10-05', end: '2026-10-08' } })

    expect(before.map((unit) => unit.ref)).toContain('3B-01')
  })

  test('a booking over the lease is refused, by the same constraint that refuses a double booking', async () => {
    await givenLease({ unitRef: '3B-01', start: '2026-10-01', end: '2027-04-01' })

    const { createWalkInBooking } = await import('./bookings')
    const { bookingInput } = await import('./test/factory')

    const result = await createWalkInBooking(
      await bookingInput({ unitRef: '3B-01', checkIn: RANGE.start, checkOut: RANGE.end }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unit_unavailable')
  })

  test('a lease over an existing booking is refused', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: RANGE.start, checkOut: RANGE.end })

    const result = await markUnitLeased({
      unitId: await unitIdByRef('3B-01'),
      occupantName: 'Tan Family',
      start: '2026-10-01',
      end: '2027-04-01',
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unit_unavailable')
  })

  test('a lease on an out-of-service unit is refused', async () => {
    const unitId = await givenUnitOutOfService('3B-01', 'Aircon fault')

    const result = await markUnitLeased({
      unitId,
      occupantName: 'Tan Family',
      start: '2026-10-01',
      end: '2027-04-01',
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unit_out_of_service')
  })

  test('a lease that ends before it starts is refused', async () => {
    const result = await markUnitLeased({
      unitId: await unitIdByRef('3B-01'),
      occupantName: 'Tan Family',
      start: '2026-10-08',
      end: '2026-10-05',
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid_dates')
  })

  test('ending it after it started frees the unit from that date onwards', async () => {
    const { occupancyId } = await givenLease({
      unitRef: '3B-01',
      start: '2026-10-01',
      end: '2027-04-01',
    })

    const result = await endUnitLease({ occupancyId, end: '2026-12-01', actorId: null })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.outcome).toBe('ended')

    const after = await findAvailableUnits({ range: { start: '2026-12-05', end: '2026-12-08' } })
    const during = await findAvailableUnits({ range: { start: '2026-11-05', end: '2026-11-08' } })

    expect(after.map((unit) => unit.ref)).toContain('3B-01')
    expect(during.map((unit) => unit.ref)).not.toContain('3B-01')
  })

  test('ending it on or before its start unwinds it instead, and frees the unit at once', async () => {
    // occupancy_covers_at_least_one_night means a lease cannot be given an end
    // on its own start date. An end that early is not an ending — it is a lease
    // recorded in error — so it is cancelled rather than shortened.
    const { occupancyId } = await givenLease({
      unitRef: '3B-01',
      start: '2026-10-01',
      end: '2027-04-01',
    })

    const result = await endUnitLease({ occupancyId, end: '2026-10-01', actorId: null })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.outcome).toBe('cancelled')

    expect((await findAvailableUnits({ range: RANGE })).map((u) => u.ref)).toContain('3B-01')
  })

  test('records the lease and its ending against the unit', async () => {
    const { occupancyId, unitId } = await givenLease({
      unitRef: '3B-01',
      start: '2026-10-01',
      end: '2027-04-01',
    })
    await endUnitLease({ occupancyId, end: '2026-12-01', actorId: null })

    expect(await latestActions(unitId, 2)).toEqual(['unit.lease_ended', 'unit.leased'])
  })
})

describe('the board (B8)', () => {
  test('returns every unit, whatever it is doing', async () => {
    expect(await listUnitStates()).toHaveLength(48)
  })

  test('a unit nothing covers is available', async () => {
    const unit = await getUnitStateByRef('3B-20')

    expect(unit?.status).toBe('available')
    expect(unit?.occupant).toBeNull()
  })

  test('a confirmed booking over today makes the unit booked, and names the guest', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: today,
      checkOut: '2027-01-01',
      guestName: 'Lim Wei',
    })

    const unit = await getUnitStateByRef('3B-01')

    expect(unit?.status).toBe('booked')
    expect(unit?.occupant?.name).toBe('Lim Wei')
    expect(unit?.occupant?.bookingReference).toBe(booking.reference)
  })

  test('a lease names its tenant and carries no booking reference', async () => {
    const today = new Date().toISOString().slice(0, 10)
    await givenLease({
      unitRef: '3B-01',
      occupantName: 'Tan Family',
      start: today,
      end: '2027-04-01',
    })

    const unit = await getUnitStateByRef('3B-01')

    expect(unit?.status).toBe('leased_long_term')
    expect(unit?.occupant?.name).toBe('Tan Family')
    // A lease is not a booking, so there is nothing to link to.
    expect(unit?.occupant?.bookingReference).toBeNull()
  })

  test('an out-of-service unit carries its reason', async () => {
    await givenUnitOutOfService('3B-04', 'Aircon fault')

    const unit = await getUnitStateByRef('3B-04')

    expect(unit?.status).toBe('out_of_service')
    expect(unit?.outOfService?.reason).toBe('Aircon fault')
  })

  test('a free unit says when it stops being free', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: '2026-12-01', checkOut: '2026-12-04' })

    const unit = await getUnitStateByRef('3B-01')

    expect(unit?.status).toBe('available')
    expect(unit?.nextStart).toBe('2026-12-01')
  })
})

describe('the unit registry (F6)', () => {
  const currentUnits = async (): Promise<readonly CurrentUnit[]> =>
    (await listUnitRegistry()).map((unit) => ({
      id: unit.id,
      ref: unit.ref,
      unitTypeId: unit.unitTypeId,
      hasHistory: unit.hasHistory,
    }))

  test('reports which units have hosted a stay', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: RANGE.start, checkOut: RANGE.end })

    const registry = await listUnitRegistry()

    expect(registry.find((unit) => unit.ref === '3B-01')?.hasHistory).toBe(true)
    expect(registry.find((unit) => unit.ref === '3B-02')?.hasHistory).toBe(false)
  })

  test('THE SWAP: two units may exchange references in one save', async () => {
    // ── Why this test is worth its weight ─────────────────────────────────
    //
    // Postgres checks a non-deferrable unique index as each ROW's index tuple
    // is written, not at the end of the statement — so a swap raises 23505, or
    // does not, depending on the order the rows happened to be scanned in.
    // 20260904000100 part 7 makes `unit_ref_unique` deferrable so the
    // constraint means what it was always for: references are unique when the
    // work is finished.
    //
    // Make it non-deferrable again and this test fails outright. It is also
    // the smallest case of the thing the editor exists to do — renumbering a
    // floor walks through references the old scheme still holds.
    const current = await currentUnits()
    const plan = planRegistry(current, [
      {
        unitTypeId: 'three-bedroom',
        refs: current
          .filter((unit) => unit.unitTypeId === 'three-bedroom')
          .map((unit) => unit.ref)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .map((ref, index, all) => (index === 0 ? all[1]! : index === 1 ? all[0]! : ref)),
      },
    ])

    expect(plan.renames).toHaveLength(2)

    const result = await applyUnitRegistry({ plan, actorId: null })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.outcome.renamed).toBe(2)

    const after = await listUnitRegistry()
    expect(after.filter((unit) => unit.ref === '3B-01')).toHaveLength(1)
    expect(after.filter((unit) => unit.ref === '3B-02')).toHaveLength(1)
  })

  test('renaming a whole type keeps every unit and every booking on it', async () => {
    const booking = await givenBooking({
      unitRef: 'SD-01',
      checkIn: RANGE.start,
      checkOut: RANGE.end,
    })

    const current = await currentUnits()
    const plan = planRegistry(current, [
      {
        unitTypeId: 'semi-detached',
        refs: ['Villa 1', 'Villa 2', 'Villa 3', 'Villa 4', 'Villa 5', 'Villa 6'],
      },
    ])

    expect((await applyUnitRegistry({ plan, actorId: null })).ok).toBe(true)

    const { getBookingByReference } = await import('./bookings')
    const reread = await getBookingByReference(booking.reference)

    // A rename is retrospective by construction: booking_summary reads the
    // unit's ref live, so a past stay is relabelled with the door's new name.
    // Recorded in prd.md §7.1 as [A]; the unit.renamed events are the trail.
    expect(reread?.stay?.unitRef).toBe('Villa 1')
  })

  test('adding units is how the 2-bedroom count gets answered', async () => {
    const plan = planRegistry(await currentUnits(), [
      { unitTypeId: 'two-bedroom', refs: ['2B-01', '2B-02', '2B-03'] },
    ])

    const result = await applyUnitRegistry({ plan, actorId: null })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.outcome.added).toBe(3)

    // And they are immediately bookable, which is the whole point.
    expect((await countAvailableByType(RANGE))['two-bedroom']).toBe(3)
  })

  test('removes a unit that has never been occupied', async () => {
    const added = planRegistry(await currentUnits(), [
      { unitTypeId: 'two-bedroom', refs: ['2B-01', '2B-02'] },
    ])
    await applyUnitRegistry({ plan: added, actorId: null })

    const removal = planRegistry(await currentUnits(), [
      { unitTypeId: 'two-bedroom', refs: ['2B-01'] },
    ])

    const result = await applyUnitRegistry({ plan: removal, actorId: null })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.outcome.removed).toBe(1)
    expect((await listUnitRegistry()).some((unit) => unit.ref === '2B-02')).toBe(false)
  })

  test('refuses to remove a unit that has hosted a booking, and removes nothing', async () => {
    await givenBooking({ unitRef: 'SD-06', checkIn: RANGE.start, checkOut: RANGE.end })

    // planRegistry would have put SD-06 in `blocked` rather than `removals`, so
    // the plan is built by hand: this asserts the database refuses it too,
    // which is what protects a plan built from stale data.
    const registry = await listUnitRegistry()
    const target = registry.find((unit) => unit.ref === 'SD-06')!

    const result = await applyUnitRegistry({
      plan: {
        renames: [],
        additions: [],
        removals: [{ unitId: target.id, ref: target.ref }],
        blocked: [],
      },
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('unit_has_history')
    expect(result.error.message).toContain('out of service')
    expect((await listUnitRegistry()).some((unit) => unit.ref === 'SD-06')).toBe(true)
  })

  test('a duplicate reference is refused and the registry is left untouched', async () => {
    const registry = await listUnitRegistry()
    const target = registry.find((unit) => unit.ref === '3B-03')!

    const result = await applyUnitRegistry({
      plan: {
        renames: [{ unitId: target.id, fromRef: '3B-03', toRef: '3B-05' }],
        additions: [{ unitTypeId: 'two-bedroom', ref: '2B-01' }],
        removals: [],
        blocked: [],
      },
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('duplicate_ref')

    // The partial-write proof. The addition sits AFTER the rename in the
    // function, so if a refusal did not unwind the transaction, 2B-01 would
    // exist and 3B-03 would be gone.
    const after = await listUnitRegistry()
    expect(after.some((unit) => unit.ref === '3B-03')).toBe(true)
    expect(after.some((unit) => unit.ref === '2B-01')).toBe(false)
    expect(after).toHaveLength(48)
  })

  test('a stale rename is refused rather than applied to the wrong unit', async () => {
    const registry = await listUnitRegistry()
    const target = registry.find((unit) => unit.ref === '3B-03')!

    const result = await applyUnitRegistry({
      plan: {
        renames: [{ unitId: target.id, fromRef: 'SOMETHING-ELSE', toRef: 'A-101' }],
        additions: [],
        removals: [],
        blocked: [],
      },
      actorId: null,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('changed')
  })

  test('records what happened to each unit, and one summary', async () => {
    const plan = planRegistry(await currentUnits(), [
      { unitTypeId: 'two-bedroom', refs: ['2B-01'] },
    ])
    await applyUnitRegistry({ plan, actorId: null })

    const added = (await listUnitRegistry()).find((unit) => unit.ref === '2B-01')!
    const events = await listAuditEvents('unit', added.id)

    expect(events.map((event) => event.action)).toEqual(['unit.added'])
    expect(events[0]?.after).toMatchObject({ ref: '2B-01', unitType: 'two-bedroom' })
  })
})

describe("the unit's standing note (N18)", () => {
  test('starts empty, and a unit with no note reads as null rather than blank', async () => {
    expect((await getUnitStateByRef('3B-01'))?.notes).toBeNull()
  })

  test('is saved, and comes back on the board', async () => {
    const unitId = await unitIdByRef('3B-01')

    const result = await setUnitNotes({
      unitId,
      notes: 'Shower door sticks — lift slightly to close.',
      actorId: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(true)
    expect((await getUnitStateByRef('3B-01'))?.notes).toBe(
      'Shower door sticks — lift slightly to close.',
    )
  })

  test('outlives the booking that was in the unit when it was written', async () => {
    // The whole reason N18 refused to hang this off a booking: it is true long
    // after the guest has gone.
    const unitId = await unitIdByRef('3B-01')
    const booking = await givenBooking({
      unitRef: '3B-01',
      checkIn: RANGE.start,
      checkOut: RANGE.end,
    })
    await setUnitNotes({ unitId, notes: 'Spare key with security.', actorId: null })

    const { transitionBooking } = await import('./bookings')
    await transitionBooking(booking.id, 'cancel', null, 'Test')

    expect((await getUnitStateByRef('3B-01'))?.notes).toBe('Spare key with security.')
  })

  test('blank clears it, and that is recorded as an edit of its own', async () => {
    const unitId = await unitIdByRef('3B-01')
    await setUnitNotes({ unitId, notes: 'Something', actorId: null })

    const cleared = await setUnitNotes({ unitId, notes: '   ', actorId: null })

    expect(cleared.ok).toBe(true)
    // Whitespace is not a note. Stored as null so "no note" is one value, not
    // two that render alike and compare differently.
    expect((await getUnitStateByRef('3B-01'))?.notes).toBeNull()
    expect(await latestActions(unitId, 1)).toEqual(['unit.note_cleared'])
  })

  test('saving the same text again changes nothing and records nothing', async () => {
    // Opening the field and closing it should not leave an audit event saying
    // something happened.
    const unitId = await unitIdByRef('3B-01')
    await setUnitNotes({ unitId, notes: 'Same', actorId: null })
    const before = (await listAuditEvents('unit', unitId)).length

    const again = await setUnitNotes({ unitId, notes: 'Same', actorId: null })

    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.changed).toBe(false)
    expect(await listAuditEvents('unit', unitId)).toHaveLength(before)
  })

  test('is windowed for the screen, newest first, with the whole length alongside', async () => {
    // A unit outlives every booking in it, so its trail is the one that grows
    // without limit. The screen asks for a page and has to be told how much it
    // is not showing, or "show older" is a guess.
    const unitId = await unitIdByRef('3B-01')

    for (const note of ['One', 'Two', 'Three', 'Four']) {
      await setUnitNotes({ unitId, notes: note, actorId: null })
    }

    const whole = await listAuditEvents('unit', unitId)
    const page = await listAuditEventWindow('unit', unitId, 2)

    expect(page.total).toBe(whole.length)
    expect(page.events).toHaveLength(2)
    expect(page.events.map((event) => event.id)).toEqual(whole.slice(0, 2).map((e) => e.id))
  })

  test('a window wider than the trail returns the trail, not a promise of more', async () => {
    const unitId = await unitIdByRef('3B-01')
    await setUnitNotes({ unitId, notes: 'Only one thing has happened', actorId: null })

    const page = await listAuditEventWindow('unit', unitId, 500)

    expect(page.events).toHaveLength(page.total)
  })

  test('pages do not overlap or drop an event when timestamps collide', async () => {
    // Two events written in the same statement can share a timestamp to the
    // microsecond. Ordered by `at` alone the second page could repeat a row
    // from the first and lose one behind it, which for an append-only record
    // is the one failure that must not be quiet.
    const unitId = await unitIdByRef('3B-01')

    for (const note of ['A', 'B', 'C', 'D', 'E', 'F']) {
      await setUnitNotes({ unitId, notes: note, actorId: null })
    }

    const first = await listAuditEventWindow('unit', unitId, 3)
    const both = await listAuditEventWindow('unit', unitId, 6)
    const ids = both.events.map((event) => event.id)

    expect(first.events.map((event) => event.id)).toEqual(ids.slice(0, 3))
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('records the text before and after, so the trail is the history a thread would be', async () => {
    const unitId = await unitIdByRef('3B-01')
    await setUnitNotes({ unitId, notes: 'Door sticks', actorId: null })
    await setUnitNotes({ unitId, notes: 'Door fixed', actorId: null })

    const [newest] = await listAuditEvents('unit', unitId)

    expect(newest?.action).toBe('unit.note_changed')
    expect(newest?.before).toMatchObject({ notes: 'Door sticks' })
    expect(newest?.after).toMatchObject({ notes: 'Door fixed' })
  })
})
