import { describe, expect, test } from 'vitest'

import { adminRoleKeepsConfigManage, roleUnionHasPermission, wouldLockSelfOut } from './role-guards'

const PERMISSIONS_BY_ROLE: ReadonlyMap<string, readonly string[]> = new Map([
  ['role-admin', ['config.manage', 'booking.view']],
  ['role-front-office', ['booking.view', 'booking.create']],
  ['role-finance', ['payment.verify', 'report.view']],
])

describe('roleUnionHasPermission', () => {
  test('finds a permission held by any of the roles', () => {
    expect(
      roleUnionHasPermission(['role-front-office', 'role-admin'], PERMISSIONS_BY_ROLE, 'config.manage'),
    ).toBe(true)
  })

  test('misses a permission held by none of them', () => {
    expect(
      roleUnionHasPermission(['role-front-office', 'role-finance'], PERMISSIONS_BY_ROLE, 'config.manage'),
    ).toBe(false)
  })

  test('an unknown role id contributes nothing', () => {
    expect(roleUnionHasPermission(['role-gone'], PERMISSIONS_BY_ROLE, 'booking.view')).toBe(false)
    expect(roleUnionHasPermission([], PERMISSIONS_BY_ROLE, 'booking.view')).toBe(false)
  })
})

describe('wouldLockSelfOut', () => {
  test('refuses removing your own path to config.manage', () => {
    expect(wouldLockSelfOut(true, ['role-front-office'], PERMISSIONS_BY_ROLE)).toBe(true)
    expect(wouldLockSelfOut(true, [], PERMISSIONS_BY_ROLE)).toBe(true)
  })

  test('allows any self-edit that keeps it', () => {
    expect(wouldLockSelfOut(true, ['role-admin', 'role-finance'], PERMISSIONS_BY_ROLE)).toBe(false)
  })

  test('never blocks edits to someone else', () => {
    // Another admin demoting you is legitimate — only self-lockout is guarded.
    expect(wouldLockSelfOut(false, [], PERMISSIONS_BY_ROLE)).toBe(false)
  })
})

describe('adminRoleKeepsConfigManage', () => {
  test('the admin role must keep config.manage', () => {
    expect(adminRoleKeepsConfigManage('admin', ['booking.view'])).toBe(false)
    expect(adminRoleKeepsConfigManage('admin', ['booking.view', 'config.manage'])).toBe(true)
  })

  test('every other role may drop it freely', () => {
    expect(adminRoleKeepsConfigManage('front-office', [])).toBe(true)
    expect(adminRoleKeepsConfigManage('finance', ['payment.verify'])).toBe(true)
  })
})
