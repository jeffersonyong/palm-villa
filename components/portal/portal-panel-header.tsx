'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

import { PortalMobileNav } from '@/components/portal/portal-mobile-nav'
import type { PortalAccountUser } from '@/components/portal/portal-account'
import { breadcrumbTrail } from '@/components/portal/portal-routes'
import { PortalSearch } from '@/components/portal/portal-search'
import { PortalTools } from '@/components/portal/portal-tools'

/**
 * The panel's own header: where you are on the left, the tools that belong to
 * no single screen on the right (design.md §Components — Portal panel header).
 *
 * It is **inside the panel, not a bar above it**. The full-width topbar this
 * replaced spanned the whole application and severed the sidebar from the
 * content it navigates — the nav column and the screen sat on opposite sides
 * of a rule belonging to neither. This shares the panel's fill, spans only the
 * panel's width, and sticks to the top of the panel's scroll container rather
 * than to the window, so it holds its place while a long table runs under it.
 *
 * **It is separated by a permanent hairline, and by nothing else.** The rule
 * runs the panel's full width, so the header reads as a bar across the top of
 * the screen rather than as a floating line of text — which is what a portal
 * header is, and what the scroll-revealed version was not. It is `divider`
 * rather than `border`: a rule *inside* a surface, not the edge of one. No
 * shadow, no blur, no fill change — the page's whole shadow budget is the 4%
 * lift under the "where am I" chip and nothing else may borrow it (§Elevation).
 *
 * **It spans the panel edge to edge**, so the breadcrumb sits hard left and the
 * tools hard right. It deliberately does *not* share the content region's
 * `max-w`: on a very wide monitor that would float the breadcrumb inward and
 * leave the header's two ends empty, which is the one thing a header must not
 * do. Its horizontal padding matches the content's, so on any realistic width
 * the breadcrumb still lands on the `h1`'s left edge.
 *
 * It never carries the page title — that stays the screen's single `h1`.
 */
export function PortalPanelHeader({ account }: { account: PortalAccountUser | null }) {
  const pathname = usePathname()
  const crumbs = breadcrumbTrail(pathname)

  return (
    <header className="sticky top-0 z-10 flex h-panel-header items-center justify-between gap-lg border-b border-divider bg-surface-panel px-lg lg:px-xl">
      <div className="flex min-w-0 items-center gap-sm">
        {/* Below `lg` this is the only way to the navigation. */}
        <PortalMobileNav account={account} />

        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-xs text-body-sm">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1

              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {/* An <ol> may only contain <li>, so the separator is a
                        presentational item rather than a bare svg sibling. */}
                  {index > 0 ? (
                    <li role="presentation" aria-hidden className="flex">
                      <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
                    </li>
                  ) : null}
                  <li className="min-w-0">
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className="rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        aria-current={isLast ? 'page' : undefined}
                        className={
                          isLast
                            ? 'block truncate font-medium text-foreground'
                            : 'block truncate text-muted-foreground'
                        }
                      >
                        {crumb.label}
                      </span>
                    )}
                  </li>
                </Fragment>
              )
            })}
          </ol>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-sm">
        <PortalSearch />
        <PortalTools />
      </div>
    </header>
  )
}
