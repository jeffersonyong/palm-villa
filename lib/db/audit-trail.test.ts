import { describe, expect, test } from 'vitest'

import { todayInBrunei } from '@/lib/domain/dates'

import { SYSTEM_ACTOR } from '@/lib/domain/audit-label'

import { listAuditTrail } from './audit-trail'
import { setUnitNotes } from './units'
import { givenBooking, unitIdByRef } from './test/factory'

/**
 * The property-wide audit trail (capability F4).
 *
 * `audit_event` is deliberately never cleared between tests — it is append-only
 * by design, and setup.ts says so — so every assertion here is about events
 * this test itself caused, found by filtering rather than by counting. A test
 * that asserted a total would be measuring every run that came before it.
 */

const TODAY = todayInBrunei()

describe('listAuditTrail', () => {
  test('reads the newest events first, with the count of everything behind them', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: '2026-11-02', checkOut: '2026-11-04' })

    const trail = await listAuditTrail({}, 1, 5)

    expect(trail.events).toHaveLength(5)
    expect(trail.total).toBeGreaterThan(5)
    expect(trail.page).toBe(1)

    const times = trail.events.map((event) => event.at)

    expect([...times].sort().reverse()).toEqual(times)
  })

  test('resolves a booking event to its reference', async () => {
    const booking = await givenBooking({
      unitRef: '3B-02',
      checkIn: '2026-11-05',
      checkOut: '2026-11-07',
    })

    const trail = await listAuditTrail({ search: booking.reference }, 1, 25)

    expect(trail.events.length).toBeGreaterThan(0)
    expect(trail.events.every((event) => event.subjectLabel === booking.reference)).toBe(true)
    expect(trail.events.map((event) => event.action)).toContain('booking.created_walk_in')
  })

  test('resolves a unit event to the reference on the door', async () => {
    const unitId = await unitIdByRef('3B-03')

    await setUnitNotes({ unitId, notes: 'The shower door sticks.', actorId: null })

    const trail = await listAuditTrail({ entityTypes: ['unit'], search: '3B-03' }, 1, 25)

    expect(trail.events[0]).toMatchObject({
      action: 'unit.note_added',
      entityType: 'unit',
      subjectLabel: '3B-03',
    })
  })

  test('narrows to one family', async () => {
    await givenBooking({ unitRef: '3B-04', checkIn: '2026-11-08', checkOut: '2026-11-10' })

    const trail = await listAuditTrail({ families: ['payment'] }, 1, 25)

    expect(trail.events.length).toBeGreaterThan(0)
    expect(trail.events.every((event) => event.actionFamily === 'payment')).toBe(true)
  })

  test('narrows to a day, in Brunei time', async () => {
    await givenBooking({ unitRef: '3B-05', checkIn: '2026-11-11', checkOut: '2026-11-12' })

    const today = await listAuditTrail({ window: { from: TODAY, to: TODAY } }, 1, 25)

    expect(today.events.length).toBeGreaterThan(0)

    // A window that ended before the property existed matches nothing. The
    // conversion is the point: a bare date compared against a timestamptz would
    // put the first eight hours of every Brunei day on the day before.
    const before = await listAuditTrail({ window: { from: '2020-01-01', to: '2020-01-02' } }, 1, 25)

    expect(before.events).toHaveLength(0)
    expect(before.total).toBe(0)
  })

  test('separates what a person did from what the system did', async () => {
    await givenBooking({ unitRef: '3B-06', checkIn: '2026-11-13', checkOut: '2026-11-14' })

    // The factory acts as nobody, so everything it writes is the system's.
    const system = await listAuditTrail({ actor: SYSTEM_ACTOR }, 1, 25)

    expect(system.events.length).toBeGreaterThan(0)
    expect(system.events.every((event) => event.actorId === null)).toBe(true)
  })

  test('ignores a filter value that is not one of the offered ones', async () => {
    // A hand-edited URL narrows or does nothing; it never breaks the screen.
    const trail = await listAuditTrail(
      { families: ['nonsense'], entityTypes: ['nonsense'], actor: 'not-a-uuid' },
      1,
      5,
    )

    expect(trail.events.length).toBeGreaterThan(0)
  })

  test('keeps the total the same whichever page is read', async () => {
    await givenBooking({ unitRef: '3B-07', checkIn: '2026-11-15', checkOut: '2026-11-16' })

    const first = await listAuditTrail({}, 1, 3)
    const second = await listAuditTrail({}, 2, 3)

    expect(second.total).toBe(first.total)
    expect(second.page).toBe(2)

    const ids = new Set([...first.events, ...second.events].map((event) => event.id))

    expect(ids.size).toBe(first.events.length + second.events.length)
  })

  test('lands on the last page when asked for one past the end', async () => {
    const trail = await listAuditTrail({}, 9_999, 25)

    expect(trail.page).toBeLessThan(9_999)
    expect(trail.events.length).toBeGreaterThan(0)
  })

  test('answers an empty page for a filter nothing matches', async () => {
    const trail = await listAuditTrail({ search: 'PV-nothing-like-this' }, 1, 25)

    expect(trail.events).toHaveLength(0)
    expect(trail.total).toBe(0)
    expect(trail.page).toBe(1)
  })
})
