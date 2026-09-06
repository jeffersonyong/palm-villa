import { describe, expect, test } from 'vitest'

import { PERMISSIONS, hasPermission, toPermissionSet } from './permissions'

describe('toPermissionSet', () => {
  test('unions rows from several roles into one set', () => {
    // Arrange — Front Office + Finance rows, overlapping on payment.verify.
    const rows = ['booking.create', 'payment.verify', 'payment.verify', 'deposit.approve_release']

    // Act
    const set = toPermissionSet(rows)

    // Assert
    expect(set.size).toBe(3)
    expect(hasPermission(set, 'booking.create')).toBe(true)
    expect(hasPermission(set, 'deposit.approve_release')).toBe(true)
  })

  test('drops strings outside the closed vocabulary', () => {
    // A permission this build cannot check is a permission it does not grant.
    const set = toPermissionSet(['booking.create', 'checkin.record', 'booking.*', ''])

    expect(set.size).toBe(1)
    expect(hasPermission(set, 'booking.create')).toBe(true)
  })

  test('returns an empty set for a user with no roles', () => {
    const set = toPermissionSet([])

    expect(set.size).toBe(0)
    expect(hasPermission(set, 'config.manage')).toBe(false)
  })

  test('accepts every string in the canonical list', () => {
    // Pins the vocabulary here against the CHECK constraint's copy (000400):
    // if a string is added to one list and not the other, this stops agreeing
    // with the seeded roles long before a screen does.
    const set = toPermissionSet([...PERMISSIONS])

    // 18 since `deposit.waive` (20260910000100, capability B15).
    expect(set.size).toBe(18)
  })
})

describe('hasPermission', () => {
  test('holding one permission grants nothing else', () => {
    const set = toPermissionSet(['booking.view'])

    expect(hasPermission(set, 'booking.view')).toBe(true)
    expect(hasPermission(set, 'booking.create')).toBe(false)
    expect(hasPermission(set, 'document.view_identity')).toBe(false)
  })
})
