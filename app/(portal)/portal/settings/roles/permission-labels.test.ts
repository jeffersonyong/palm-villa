import { describe, expect, test } from 'vitest'

import { PERMISSIONS } from '@/lib/auth/permissions'

import { PERMISSION_GROUPS, PERMISSION_LABELS } from './permission-labels'

/**
 * The roles matrix renders a permission only when a group lists it, while the
 * labels are exhaustive by type. A string added to the vocabulary and left out
 * of every group would be impossible to grant from the screen, with nothing
 * failing — which is what `site_image.manage` (capability F7) would have been.
 */
describe('PERMISSION_GROUPS', () => {
  test('lists every permission exactly once', () => {
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.permissions)

    expect([...grouped].sort()).toEqual([...PERMISSIONS].sort())
    expect(new Set(grouped).size, 'a permission is listed in two groups').toBe(grouped.length)
  })

  test('every permission has a label in staff language', () => {
    for (const permission of PERMISSIONS) {
      expect(PERMISSION_LABELS[permission]).toBeTruthy()
    }
  })
})
