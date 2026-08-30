import { describe, expect, test } from 'vitest'

import { activeHref, breadcrumbTrail, navGroups } from './portal-routes'

describe('activeHref', () => {
  test('matches a listed route exactly', () => {
    expect(activeHref('/portal/payments')).toBe('/portal/payments')
  })

  test('prefers the longest match so a child route does not light up its parent', () => {
    expect(activeHref('/portal/bookings/new')).toBe('/portal/bookings/new')
    expect(activeHref('/portal/payments/cash')).toBe('/portal/payments/cash')
    // The Admin landing page is itself a route, so its children must still win.
    expect(activeHref('/portal/settings')).toBe('/portal/settings')
    expect(activeHref('/portal/settings/pricing')).toBe('/portal/settings/pricing')
  })

  test('keeps a deeper unlisted route on its nearest listed ancestor', () => {
    expect(activeHref('/portal/bookings/abc123')).toBe('/portal/bookings')
  })

  test('matches whole segments, so a sibling sharing a prefix does not match', () => {
    expect(activeHref('/portal/bookings-report')).toBeNull()
    expect(activeHref('/portal/payments-history')).toBeNull()
  })

  test('matches the portal root only exactly, since every route is beneath it', () => {
    expect(activeHref('/portal')).toBe('/portal')
    expect(activeHref('/portal/reports')).toBe('/portal/reports')
  })

  test('returns null outside the portal', () => {
    expect(activeHref('/field')).toBeNull()
    expect(activeHref('/')).toBeNull()
  })
})

describe('breadcrumbTrail', () => {
  test('is the root alone on the overview screen', () => {
    expect(breadcrumbTrail('/portal')).toEqual([{ label: 'Portal' }])
  })

  test('reads Portal / group / screen, with the group unlinked', () => {
    expect(breadcrumbTrail('/portal/settings/audit')).toEqual([
      { label: 'Portal', href: '/portal' },
      { label: 'Admin' },
      { label: 'Audit log' },
    ])
  })

  test('names Others as the group for the account screen', () => {
    expect(breadcrumbTrail('/portal/settings')).toEqual([
      { label: 'Portal', href: '/portal' },
      { label: 'Others' },
      { label: 'Settings' },
    ])
  })

  test('keeps Settings out of Admin, whose screens are the permission-gated ones', () => {
    const admin = navGroups.find((group) => group.label === 'Admin')

    expect(admin?.items.map((item) => item.href)).not.toContain('/portal/settings')
  })

  test('closes the nav on Others, so the catch-all does not sit mid-list', () => {
    expect(navGroups.at(-1)?.label).toBe('Others')
  })

  test('names the specific screen rather than its parent', () => {
    expect(breadcrumbTrail('/portal/bookings/new')).toEqual([
      { label: 'Portal', href: '/portal' },
      { label: 'Bookings' },
      { label: 'New booking' },
    ])
  })

  test('falls back to the root crumb rather than guessing labels from the URL', () => {
    expect(breadcrumbTrail('/portal/nothing-here')).toEqual([{ label: 'Portal' }])
  })

  test('marks only the last crumb as the current page by leaving it unlinked', () => {
    const trail = breadcrumbTrail('/portal/payments/cash')

    expect(trail.at(-1)?.href).toBeUndefined()
    expect(trail[0]?.href).toBe('/portal')
  })
})
