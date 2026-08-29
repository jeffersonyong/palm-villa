'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronRight } from 'lucide-react'

import { PortalMobileNav } from '@/components/portal/portal-mobile-nav'
import { breadcrumbTrail } from '@/components/portal/portal-routes'
import { PortalSearch } from '@/components/portal/portal-search'
import { ThemeToggle } from '@/components/theme-toggle'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The portal's chrome bar: where you are on the left, the tools that belong to
 * no single screen on the right.
 *
 * It shares the page ground and is separated by a hairline — the sidebar's
 * construction, continued across the top. It never carries the page title:
 * that stays the screen's single `h1` below it (design.md §Components).
 */
export function PortalTopbar() {
  const pathname = usePathname()
  const crumbs = breadcrumbTrail(pathname)

  return (
    // 56px: the 36px controls inside need real air above and below — at 48px
    // the search bar reads as suffocated.
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-lg border-b border-divider bg-background px-lg lg:px-xl">
      <div className="flex min-w-0 items-center gap-sm">
        <PortalMobileNav />

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

      {/* One provider for the bar, so tooltips added here later share the
          skip-delay rather than each re-paying the open delay. */}
      <TooltipProvider>
        <div className="flex shrink-0 items-center gap-sm">
          <PortalSearch />

          {/* No notification backend exists. A disabled control says so
              honestly; the span carries the tooltip because a disabled button
              fires no pointer events, and keeps it keyboard-reachable. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <button
                  type="button"
                  disabled
                  aria-label="Notifications (not available yet)"
                  className="pointer-events-none inline-flex size-control items-center justify-center rounded-md text-muted-foreground opacity-50"
                >
                  <Bell aria-hidden className="size-4" />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Notifications — not built yet</TooltipContent>
          </Tooltip>

          <ThemeToggle />
        </div>
      </TooltipProvider>
    </header>
  )
}
