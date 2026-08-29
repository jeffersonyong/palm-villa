'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * Portal sidebar navigation.
 *
 * A client component only because the active state needs the pathname — the
 * portal is an application surface, not the zero-JS public site. Active is a
 * white card chip + full-strength ink on the gray ground, never a colour:
 * "where am I" is not an action.
 *
 * The groups map to how the work is divided rather than to the route tree, so
 * the shape of the operation is legible from the sidebar. Screens that are not
 * built yet are listed and render a planned-screen stub — the remaining work is
 * visible instead of hidden.
 */

interface NavItem {
  href: string
  label: string
}

interface NavGroup {
  /** Rendered as a micro label; `null` for the ungrouped lead item. */
  label: string | null
  items: readonly NavItem[]
}

// `as const` keeps the hrefs as literals so Next's typed routes can check them;
// `satisfies` still enforces the shape.
const groups = [
  { label: null, items: [{ href: '/portal', label: 'Overview' }] },
  {
    label: 'Bookings',
    items: [
      { href: '/portal/bookings', label: 'All bookings' },
      { href: '/portal/bookings/calendar', label: 'Calendar' },
      { href: '/portal/bookings/new', label: 'New booking' },
    ],
  },
  {
    label: 'Payments',
    items: [
      { href: '/portal/payments', label: 'Verification queue' },
      { href: '/portal/payments/cash', label: 'Cash payments' },
    ],
  },
  { label: 'Property', items: [{ href: '/portal/units', label: 'Units' }] },
  {
    label: 'Finance',
    items: [
      { href: '/portal/deposits', label: 'Deposits' },
      { href: '/portal/reports', label: 'Reports' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/portal/settings/pricing', label: 'Pricing' },
      { href: '/portal/settings/roles', label: 'Roles & staff' },
      { href: '/portal/settings/audit', label: 'Audit log' },
    ],
  },
] as const satisfies readonly NavGroup[]

const allHrefs = groups.flatMap((group) => group.items.map((item) => item.href))

/**
 * The active item is the longest listed route that prefixes the current path.
 *
 * A plain `startsWith` would light up both "All bookings" and "New booking" on
 * `/portal/bookings/new`; matching the longest wins picks the specific one. The
 * portal root only ever matches exactly, since every route is beneath it.
 */
function activeHref(pathname: string): string | null {
  return allHrefs.reduce<string | null>((best, href) => {
    const matches = href === '/portal' ? pathname === href : pathname.startsWith(href)

    if (!matches) return best

    return best === null || href.length > best.length ? href : best
  }, null)
}

const linkClasses = 'block rounded-md px-md py-sm text-body-sm transition-colors'
const activeClasses = 'bg-card font-medium text-foreground shadow-card'
const idleClasses = 'text-copy hover:bg-card hover:text-foreground'

export function PortalNav() {
  const pathname = usePathname()
  const active = activeHref(pathname)

  return (
    <nav aria-label="Portal navigation" className="px-md pb-lg">
      {/* Groups stack on desktop; below `lg` the whole nav collapses to one
          wrapping row, so the group labels would only add noise. */}
      <div className="flex flex-wrap gap-x-xs gap-y-md lg:flex-col lg:gap-lg">
        {groups.map((group, index) => (
          <div key={group.label ?? `group-${index}`} className="contents lg:block">
            {group.label ? (
              <p className="hidden px-md pb-xs micro-label text-muted-foreground lg:block">
                {group.label}
              </p>
            ) : null}
            <ul className="contents lg:block lg:space-y-xxs">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active === item.href ? 'page' : undefined}
                    className={cn(linkClasses, active === item.href ? activeClasses : idleClasses)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}

/**
 * Links out of the portal. Kept apart from the groups above because they are
 * escape hatches to the other two surfaces, not portal destinations — so they
 * sit in the sidebar footer and never take the active chip.
 */
export function PortalNavFooterLinks() {
  return (
    <ul className="flex gap-xs lg:flex-col lg:gap-xxs">
      {(
        [
          { href: '/', label: 'Public site' },
          { href: '/field', label: 'Field screens' },
        ] as const satisfies readonly NavItem[]
      ).map((item) => (
        <li key={item.href}>
          <Link href={item.href} className={cn(linkClasses, idleClasses)}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
