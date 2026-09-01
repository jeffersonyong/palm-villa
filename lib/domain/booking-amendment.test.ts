import { describe, expect, test } from 'vitest'

import { describeAmendment, type AmendmentSnapshot } from './booking-amendment'

/**
 * The diff a staff member confirms before an amendment is written.
 *
 * It is not decoration: it is the sentence that appears in the confirm dialog
 * of a change to what a guest pays, and it is what gates the Save button
 * (design.md — an edit form's Save is dirty-gated). A field that silently fails
 * to appear here is a change nobody was shown and nobody approved.
 */

const BEFORE: AmendmentSnapshot = {
  unitRef: 'A-12',
  checkIn: '2026-09-14',
  checkOut: '2026-09-17',
  chargeableGuests: 4,
  exemptGuests: 1,
  vehicles: ['BAA1234'],
  noVehicle: false,
  guestName: 'Ali bin Hassan',
  guestPhone: '+673 712 3456',
  discount: null,
  total: 56800,
}

describe('describeAmendment', () => {
  test('reports nothing when nothing moved', () => {
    expect(describeAmendment(BEFORE, { ...BEFORE })).toEqual([])
  })

  test('names the check-out change in dates a guest would recognise', () => {
    const changes = describeAmendment(BEFORE, { ...BEFORE, checkOut: '2026-09-18' })

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      field: 'checkOut',
      label: 'Check-out',
      from: 'Thu 17 Sept',
      to: 'Fri 18 Sept',
    })
  })

  test('formats money as BND with two decimals', () => {
    const changes = describeAmendment(BEFORE, { ...BEFORE, total: 74800 })

    expect(changes[0]).toMatchObject({
      field: 'total',
      label: 'Total',
      from: 'BND 568.00',
      to: 'BND 748.00',
    })
  })

  test('reports every field that moved, and only those', () => {
    const changes = describeAmendment(BEFORE, {
      ...BEFORE,
      unitRef: 'B-04',
      chargeableGuests: 5,
      total: 60000,
    })

    expect(changes.map((change) => change.field)).toEqual(['unitRef', 'chargeableGuests', 'total'])
  })

  test('orders the changes so the price consequence reads last', () => {
    const changes = describeAmendment(BEFORE, {
      ...BEFORE,
      total: 60000,
      checkOut: '2026-09-18',
      unitRef: 'B-04',
    })

    expect(changes.map((change) => change.field)).toEqual(['unitRef', 'checkOut', 'total'])
  })

  test('renders a booking with nothing recorded as a dash, not an empty cell', () => {
    const changes = describeAmendment(BEFORE, { ...BEFORE, vehicles: [] })

    expect(changes[0]).toMatchObject({
      field: 'vehicles',
      from: 'BAA1234',
      to: '—',
    })
  })

  test('distinguishes "no car" from "nobody asked"', () => {
    // The two look identical in the data — an empty list — and mean different
    // things to the guard at the gate, so the diff has to say which one the
    // staff member is choosing.
    const changes = describeAmendment(BEFORE, { ...BEFORE, vehicles: [], noVehicle: true })

    expect(changes[0]).toMatchObject({ field: 'vehicles', from: 'BAA1234', to: 'None' })
  })

  test('treats a newly added vehicle as a change', () => {
    const withoutCar = { ...BEFORE, vehicles: [] }
    const changes = describeAmendment(withoutCar, { ...withoutCar, vehicles: ['BB5678'] })

    expect(changes[0]).toMatchObject({ from: '—', to: 'BB5678' })
  })

  test('reports a second car joining the first', () => {
    const changes = describeAmendment(BEFORE, { ...BEFORE, vehicles: ['BAA1234', 'BB5678'] })

    expect(changes[0]).toMatchObject({
      field: 'vehicles',
      from: 'BAA1234',
      to: 'BAA1234 · BB5678',
    })
  })

  test('does not report an unchanged vehicle list, which is a different array', () => {
    // The list is compared on what it renders, not by identity. Comparing the
    // arrays with `!==` would mark every save as a vehicle change and make the
    // dirty-gated Save button permanently enabled.
    expect(describeAmendment(BEFORE, { ...BEFORE, vehicles: ['BAA1234'] })).toEqual([])
  })

  test('counts guests separately, because they price differently', () => {
    const changes = describeAmendment(BEFORE, {
      ...BEFORE,
      chargeableGuests: 5,
      exemptGuests: 0,
    })

    expect(changes.map((change) => change.field)).toEqual(['chargeableGuests', 'exemptGuests'])
    expect(changes.map((change) => change.label)).toEqual(['Chargeable guests', 'Exempt guests'])
  })
})

describe('describeAmendment — the discount row', () => {
  const discount = { kind: 'amount', value: 4000, reason: 'Repeat guest' } as const

  test('names a discount being given', () => {
    const changes = describeAmendment(BEFORE, { ...BEFORE, discount, total: 52800 })

    expect(changes.map((change) => change.field)).toEqual(['discount', 'total'])
    expect(changes[0]).toMatchObject({
      label: 'Discount',
      from: 'None',
      to: 'BND 40.00 — Repeat guest',
    })
  })

  test('names a discount being taken away', () => {
    const changes = describeAmendment({ ...BEFORE, discount, total: 52800 }, BEFORE)

    expect(changes[0]).toMatchObject({ from: 'BND 40.00 — Repeat guest', to: 'None' })
  })

  test('a reworded reason at the same figure is still a change', () => {
    // The total does not move, so without its own row this amendment would
    // look clean and Save would stay disabled.
    const changes = describeAmendment(
      { ...BEFORE, discount },
      { ...BEFORE, discount: { ...discount, reason: 'Owner authorised' } },
    )

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ field: 'discount' })
  })

  test('a percentage reads as a percentage, not as the cents it produced', () => {
    const changes = describeAmendment(BEFORE, {
      ...BEFORE,
      discount: { kind: 'percent', value: 10, reason: 'Long stay' },
      total: 51120,
    })

    expect(changes[0]).toMatchObject({ to: '10% — Long stay' })
  })

  test('the discount is named before the total it caused', () => {
    const changes = describeAmendment(BEFORE, { ...BEFORE, discount, total: 52800 })

    expect(changes.map((change) => change.field)).toEqual(['discount', 'total'])
  })
})
