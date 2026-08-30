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
  vehicleRegistration: 'BAA1234',
  guestName: 'Ali bin Hassan',
  guestPhone: '+673 712 3456',
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

  test('renders an absent vehicle as a dash rather than an empty cell', () => {
    const changes = describeAmendment(BEFORE, { ...BEFORE, vehicleRegistration: null })

    expect(changes[0]).toMatchObject({
      field: 'vehicleRegistration',
      from: 'BAA1234',
      to: '—',
    })
  })

  test('treats a newly added vehicle as a change', () => {
    const withoutCar = { ...BEFORE, vehicleRegistration: null }
    const changes = describeAmendment(withoutCar, { ...withoutCar, vehicleRegistration: 'BB5678' })

    expect(changes[0]).toMatchObject({ from: '—', to: 'BB5678' })
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
