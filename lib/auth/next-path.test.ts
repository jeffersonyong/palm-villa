import { describe, expect, test } from 'vitest'

import { DEFAULT_SIGNED_IN_PATH, safeNextPath } from './next-path'

describe('safeNextPath', () => {
  test('honours operations paths, with sub-paths and query strings', () => {
    expect(safeNextPath('/portal')).toBe('/portal')
    expect(safeNextPath('/portal/bookings/new?checkIn=2026-08-29')).toBe(
      '/portal/bookings/new?checkIn=2026-08-29',
    )
    expect(safeNextPath('/field')).toBe('/field')
    expect(safeNextPath('/portal?tab=today')).toBe('/portal?tab=today')
  })

  test('rejects absolute and scheme-relative URLs', () => {
    // The open-redirect cases: a crafted login link must not be able to send
    // a signed-in staff member off-site.
    expect(safeNextPath('https://evil.example/portal')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNextPath('//evil.example/portal')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNextPath('javascript:alert(1)')).toBe(DEFAULT_SIGNED_IN_PATH)
  })

  test('rejects non-operations and look-alike paths', () => {
    expect(safeNextPath('/')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNextPath('/login')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNextPath('/portal-status')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNextPath('/fieldwork')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNextPath('portal')).toBe(DEFAULT_SIGNED_IN_PATH)
  })

  test('falls back to the portal when absent', () => {
    expect(safeNextPath(null)).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNextPath(undefined)).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNextPath('')).toBe(DEFAULT_SIGNED_IN_PATH)
  })
})
