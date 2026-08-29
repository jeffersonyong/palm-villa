'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { activeHref, navGroups, portalExitLinks } from '@/components/portal/portal-routes'
import { cn } from '@/lib/utils'

/**
 * Portal sidebar navigation. Rendered in the desktop sidebar and, unchanged,
 * inside the mobile drawer.
 *
 * A client component only because the active state needs the pathname — the
 * portal is an application surface, not the zero-JS public site. Active is a
 * muted chip + full-strength ink on the white ground, never a colour:
 * "where am I" is not an action. Icons follow the same rule — mute by default,
 * lifting to ink with the chip. Hover is the same chip at a whisper, matching
 * the table-row hover.
 */

/* py-1.5 = 6px on the 4px base: a 30px row — dense enough to feel like a
   tool, tall enough to hit. */
const linkClasses =
  'flex items-center gap-sm rounded-md px-md py-1.5 text-body-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0'
const activeClasses = 'bg-muted font-medium text-foreground [&_svg]:text-foreground'
const idleClasses =
  'text-copy hover:bg-muted/60 hover:text-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground'

export function PortalNav() {
  const pathname = usePathname()
  const active = activeHref(pathname)

  // pt-lg clears the brand block's rule — the first group label sat on it once
  // that hairline arrived.
  return (
    <nav aria-label="Portal navigation" className="px-md pt-lg pb-lg">
      <div className="flex flex-col gap-md">
        {navGroups.map((group) => (
          <div key={group.label}>
            {/* Group headers sit in `copy`, a step above the `mute` that labels
                table headers and stats: here the label is doing structural
                work, splitting the nav into readable blocks. It stops short of
                `foreground` so it never out-weighs the active item. */}
            <p className="px-md pb-xs micro-label text-copy">{group.label}</p>
            <ul className="space-y-xxs">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active === item.href ? 'page' : undefined}
                    className={cn(linkClasses, active === item.href ? activeClasses : idleClasses)}
                  >
                    <item.icon aria-hidden />
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
 * Links out of the portal — escape hatches to the other two surfaces, not
 * portal destinations, so they never take the active chip.
 */
export function PortalNavFooterLinks() {
  return (
    <ul className="space-y-xxs">
      {portalExitLinks.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className={cn(linkClasses, idleClasses)}>
            <item.icon aria-hidden />
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
