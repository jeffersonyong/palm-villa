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
 * portal is an application surface, not the zero-JS public site.
 *
 * **Active is a card-white chip lifted off the ground**, never a colour:
 * "where am I" is not an action. The construction inverted when the ground
 * did (2026-08-31) — it used to be a `muted` chip on a white ground, and with
 * the ground now a step below `muted` the same chip would have been a darker
 * patch, which reads as pressed rather than as current. So the chip takes the
 * card tone and rises out of the sidebar instead of sinking into it, carrying
 * `shadow-lift` — 4% of shade, the page's entire shadow budget — in place of a
 * hairline, because an edge drawn around the current item competes with the
 * rules that structure the surface.
 *
 * Icons follow the item's state, mute lifting to ink with the chip. Hover is
 * the panel tone: present, but a clear step under the chip.
 */

/* py-1.5 = 6px on the 4px base: a 30px row — dense enough to feel like a
   tool, tall enough to hit.

   `px-sm` inside the nav's own `px-sm` puts every icon 16px from the sidebar's
   edge. Both were `px-md` until the two 12px insets were seen stacked: 24px of
   lead-in on a 260px column reads as a wide margin rather than as a tight
   tool, and it left the brand mark — inset once, not twice — on a different
   left edge from the icons beneath it. One inset per level, and everything in
   the column lines up. */
const linkClasses =
  'flex items-center gap-sm rounded-md px-sm py-1.5 text-body-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0'
const activeClasses = 'bg-card shadow-lift font-medium text-foreground [&_svg]:text-foreground'

/**
 * Idle items are the secondary step in both themes. The light/dark asymmetry
 * this used to carry went away with the text ladder: `copy` and
 * `muted-foreground` were two different values, so light needed the first and
 * dark the second to keep idle from reading as bright as selected. There is
 * one secondary now, and it sits a clear distance below `foreground` on both
 * grounds.
 */
const idleClasses =
  'text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground'

export function PortalNav() {
  const pathname = usePathname()
  const active = activeHref(pathname)

  // pt-lg clears the brand block's rule — the first group label sat on it once
  // that hairline arrived.
  return (
    <nav aria-label="Portal navigation" className="px-sm pt-lg pb-lg">
      <div className="flex flex-col gap-md">
        {navGroups.map((group) => (
          <div key={group.label}>
            {/* Group headers sit one step below the items they label, so they
                organise the nav rather than competing with it. Idle items and
                labels now resolve to the same secondary, so the separation is
                carried by the label's own voice — 11px uppercase against 13px
                sentence case — plus an alpha step, which reads at that size
                where a colour step would not. */}
            <p className="px-sm pb-xs micro-label text-muted-foreground/75">{group.label}</p>
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
