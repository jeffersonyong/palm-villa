import {
  BadgeCheck,
  Banknote,
  BarChart3,
  CalendarDays,
  DoorOpen,
  Globe,
  Landmark,
  LayoutDashboard,
  List,
  Plus,
  ScrollText,
  Settings,
  Smartphone,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react'

/**
 * The portal's route map — one source of truth for the sidebar, the mobile
 * drawer and the topbar breadcrumbs.
 *
 * The groups map to how the work is divided rather than to the route tree, so
 * the shape of the operation is legible from the sidebar. Screens that are not
 * built yet are listed and render a planned-screen stub — the remaining work is
 * visible instead of hidden.
 */

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export interface NavGroup {
  /** Rendered as a micro label above the group. */
  label: string
  items: readonly NavItem[]
}

// `as const` keeps the hrefs as literals so Next's typed routes can check them;
// `satisfies` still enforces the shape.
export const navGroups = [
  { label: 'Overview', items: [{ href: '/portal', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Bookings',
    items: [
      { href: '/portal/bookings', label: 'All bookings', icon: List },
      { href: '/portal/bookings/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/portal/bookings/new', label: 'New booking', icon: Plus },
    ],
  },
  {
    label: 'Payments',
    items: [
      { href: '/portal/payments', label: 'Verification queue', icon: BadgeCheck },
      { href: '/portal/payments/cash', label: 'Cash payments', icon: Banknote },
    ],
  },
  { label: 'Property', items: [{ href: '/portal/units', label: 'Units', icon: DoorOpen }] },
  {
    label: 'Finance',
    items: [
      { href: '/portal/deposits', label: 'Deposits', icon: Landmark },
      { href: '/portal/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    // Not "Settings": that is now one of the screens inside it.
    label: 'Admin',
    items: [
      { href: '/portal/settings', label: 'Settings', icon: Settings },
      { href: '/portal/settings/pricing', label: 'Pricing', icon: Tag },
      { href: '/portal/settings/roles', label: 'Roles & staff', icon: Users },
      { href: '/portal/settings/audit', label: 'Audit log', icon: ScrollText },
    ],
  },
] as const satisfies readonly NavGroup[]

/**
 * Links out of the portal. Kept apart from the groups above because they are
 * escape hatches to the other two surfaces, not portal destinations — so they
 * sit in the sidebar footer and never take the active chip.
 */
export const portalExitLinks = [
  { href: '/', label: 'Public site', icon: Globe },
  { href: '/field', label: 'Field screens', icon: Smartphone },
] as const satisfies readonly NavItem[]

const allHrefs = navGroups.flatMap((group) => group.items.map((item) => item.href))

/**
 * The active item is the longest listed route that prefixes the current path.
 *
 * A plain `startsWith` would light up both "All bookings" and "New booking" on
 * `/portal/bookings/new`; matching the longest wins picks the specific one. The
 * portal root only ever matches exactly, since every route is beneath it.
 *
 * The match is on whole segments: a bare `startsWith` would also treat
 * `/portal/bookings-report` as a child of `/portal/bookings` and light up the
 * wrong item.
 */
export function activeHref(pathname: string): string | null {
  return allHrefs.reduce<string | null>((best, href) => {
    const matches =
      href === '/portal' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

    if (!matches) return best

    return best === null || href.length > best.length ? href : best
  }, null)
}

/**
 * The literal union of every listed portal route, derived from the data above
 * so it cannot drift. Next's typed routes reject a widened `string`, and this
 * keeps crumb links checkable without restating the route list.
 */
type PortalHref = (typeof navGroups)[number]['items'][number]['href']

export interface Crumb {
  label: string
  /** Absent for the current page and for group names, which are not routes. */
  href?: PortalHref
}

/**
 * The trail for the topbar: Portal → group → screen.
 *
 * Group names carry no href — they organise the sidebar, they are not pages —
 * so they render as plain text. An unrecognised path yields just the root
 * crumb rather than guessing labels from URL segments.
 */
export function breadcrumbTrail(pathname: string): Crumb[] {
  const active = activeHref(pathname)

  if (active === null || active === '/portal') {
    return [{ label: 'Portal' }]
  }

  const group = navGroups.find((candidate) => candidate.items.some((item) => item.href === active))
  const item = group?.items.find((candidate) => candidate.href === active)

  if (!group || !item) {
    return [{ label: 'Portal' }]
  }

  return [{ label: 'Portal', href: '/portal' }, { label: group.label }, { label: item.label }]
}
