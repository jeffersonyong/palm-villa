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
 */
const items = [
  { href: '/portal', label: 'Overview', exact: true },
  { href: '/portal/bookings/new', label: 'New booking', exact: true },
  { href: '/', label: 'Public site', exact: true },
  { href: '/field', label: 'Field screens', exact: false },
] as const

export function PortalNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Portal navigation" className="px-md pb-lg">
      <ul className="flex gap-xs lg:flex-col">
        {items.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-md py-sm text-body-sm transition-colors',
                  isActive
                    ? 'bg-card font-medium text-foreground shadow-card'
                    : 'text-copy hover:bg-card hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
