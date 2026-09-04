import { randomUUID } from 'node:crypto'

import { describe, expect, test } from 'vitest'

import { HISTORY_PAGE_SIZE } from '@/components/portal/history-page'

import { listAuditEventPage, listAuditEvents, type AuditEvent } from './audit'
import { unitIdByRef } from './test/factory'
import { setUnitNotes } from './units'

/**
 * The paged read behind every history panel, against the real database.
 *
 * `audit_event` is append-only and the shared setup leaves it alone, so
 * nothing here assumes a trail starts empty: every expectation is relative to
 * `listAuditEvents`, the unbounded read, which is what a page has to agree
 * with.
 */

/** The order the panels show: newest first, ties broken by id. */
function newestFirst(events: readonly AuditEvent[]): readonly AuditEvent[] {
  return [...events].sort((a, b) => {
    if (a.at !== b.at) {
      return a.at < b.at ? 1 : -1
    }

    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  })
}

async function givenNotes(ref: string, notes: readonly string[]): Promise<string> {
  const unitId = await unitIdByRef(ref)

  for (const note of notes) {
    await setUnitNotes({ unitId, notes: note, actorId: null })
  }

  return unitId
}

describe('listAuditEventPage', () => {
  test('a page is the newest slice, and the count is the whole trail', async () => {
    const unitId = await givenNotes('3B-01', ['One', 'Two', 'Three'])

    const whole = await listAuditEvents('unit', unitId)
    const page = await listAuditEventPage([{ entityType: 'unit', entityIds: [unitId] }], 1, 2)

    expect(page.total).toBe(whole.length)
    expect(page.page).toBe(1)
    expect(page.events.map((event) => event.id)).toEqual(whole.slice(0, 2).map((e) => e.id))
  })

  test('a page wider than the trail returns the trail, not a promise of more', async () => {
    const unitId = await givenNotes('3B-01', ['Only one thing has happened'])

    const page = await listAuditEventPage([{ entityType: 'unit', entityIds: [unitId] }], 1, 500)

    expect(page.events).toHaveLength(page.total)
  })

  test('pages do not overlap or drop an event when timestamps collide', async () => {
    // Two events written in the same statement can share a timestamp to the
    // microsecond. Ordered by `at` alone the second page could repeat a row
    // from the first and lose one behind it, which for an append-only record
    // is the one failure that must not be quiet.
    const unitId = await givenNotes('3B-01', ['A', 'B', 'C', 'D', 'E', 'F'])
    const subjects = [{ entityType: 'unit', entityIds: [unitId] }]

    const whole = await listAuditEvents('unit', unitId)
    const first = await listAuditEventPage(subjects, 1, 3)
    const second = await listAuditEventPage(subjects, 2, 3)
    const ids = [...first.events, ...second.events].map((event) => event.id)

    expect(ids).toEqual(whole.slice(0, 6).map((event) => event.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('several subjects read as one trail, newest first', async () => {
    const first = await givenNotes('3B-01', ['Door sticks'])
    const second = await givenNotes('3B-02', ['Window rattles'])
    await givenNotes('3B-01', ['Door fixed'])

    const expected = newestFirst([
      ...(await listAuditEvents('unit', first)),
      ...(await listAuditEvents('unit', second)),
    ])
    const page = await listAuditEventPage(
      [{ entityType: 'unit', entityIds: [first, second] }],
      1,
      expected.length + 10,
    )

    expect(page.total).toBe(expected.length)
    expect(page.events.map((event) => event.id)).toEqual(expected.map((event) => event.id))
  })

  test('a page past the end lands on the last page that exists', async () => {
    // A bookmarked `?history=40` on a unit whose trail has twelve events
    // should show the last page, not an empty one with a control pointing at
    // page 40.
    const unitId = await givenNotes('3B-01', ['One', 'Two', 'Three'])
    const subjects = [{ entityType: 'unit', entityIds: [unitId] }]
    const whole = await listAuditEvents('unit', unitId)
    const lastPage = Math.ceil(whole.length / 2)

    const page = await listAuditEventPage(subjects, lastPage + 40, 2)

    expect(page.page).toBe(lastPage)
    expect(page.events.length).toBeGreaterThan(0)
    expect(page.events.map((event) => event.id)).toEqual(
      whole.slice((lastPage - 1) * 2).map((event) => event.id),
    )
  })

  test('a subject with no ids contributes nothing, and a list of them is not a query', async () => {
    const unitId = await givenNotes('3B-01', ['Something'])

    const alone = await listAuditEventPage([{ entityType: 'unit', entityIds: [unitId] }], 1, 50)
    const padded = await listAuditEventPage(
      [
        { entityType: 'unit', entityIds: [unitId] },
        { entityType: 'payment', entityIds: [] },
      ],
      1,
      50,
    )
    const nothing = await listAuditEventPage([{ entityType: 'payment', entityIds: [] }], 1, 50)

    expect(padded).toEqual(alone)
    expect(nothing).toEqual({ events: [], total: 0, page: 1 })
  })

  test('a record nothing has happened to has an empty first page, not an error', async () => {
    // A seeded unit nobody has touched. The read asks for rows 0–9 of none,
    // which is the other edge of the range PostgREST is strict about.
    const page = await listAuditEventPage(
      [{ entityType: 'unit', entityIds: [randomUUID()] }],
      1,
      HISTORY_PAGE_SIZE,
    )

    expect(page).toEqual({ events: [], total: 0, page: 1 })
  })

  test('refuses an id that is not a uuid before it reaches the filter', async () => {
    await expect(
      listAuditEventPage([{ entityType: 'unit', entityIds: ['1),entity_type.eq.staff'] }], 1, 10),
    ).rejects.toThrow(/not a uuid/)
  })
})
