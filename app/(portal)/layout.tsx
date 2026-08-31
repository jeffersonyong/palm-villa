import { getAuthenticatedUser } from '@/lib/auth/session'
import { PortalAccount, type PortalAccountUser } from '@/components/portal/portal-account'
import { PortalNav, PortalNavFooterLinks } from '@/components/portal/portal-nav'
import { PortalPanel } from '@/components/portal/portal-panel'
import { OperationsSurface } from '@/components/operations-surface'
import { PortalBrand } from '@/components/portal/portal-brand'

/**
 * The operations shell (design.md §Layout, §Elevation).
 *
 * Two columns on the app background, and only one of them is a surface. The
 * **navigation column is not a container**: no fill, no border, no radius, no
 * shadow — it sits directly on the background, because two panels side by side
 * read as two documents where a tool is one document with its chrome beside it.
 * The **content panel is the only elevated surface**, and it earns that by
 * being the only thing holding content.
 *
 * The panel is **bottom-anchored and bleeds past the viewport**. It takes a
 * gutter at the top, left and right, and none at the bottom: its top corners
 * are rounded and its bottom corners are square and off-screen, so the sheet
 * reads as continuing below the fold rather than as a card that stops. That is
 * also why it carries no bottom border — a hairline ruled across the foot of
 * the screen would contradict the bleed.
 *
 * Scrolling belongs to the panel, not the window: the shell is exactly a
 * viewport tall and clips, so the sidebar never scrolls away and the panel's
 * own header can stick to the top of the content rather than to the browser.
 *
 * `h-dvh` rather than `h-screen`: on a phone `100vh` runs under the browser
 * chrome, and this layout has no window scroll to absorb the difference.
 *
 * Below `lg` the gutters and radii drop and the panel goes edge-to-edge — a
 * rounded corner against the viewport edge reads as a rendering error, and the
 * gutter is width the content needs. The sidebar becomes a drawer, opened from
 * the panel header.
 *
 * proxy.ts guarantees a session behind this layout, so the null case is a race
 * (signed out in another tab mid-render) — the chrome renders without an
 * account row and the next navigation lands on /login.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  const account: PortalAccountUser | null = user
    ? { id: user.id, name: user.displayName, email: user.email }
    : null

  return (
    <div className="flex h-dvh overflow-hidden bg-background lg:pt-sm lg:pr-sm lg:pl-sm">
      {/* Flips <html> to the monochrome operations register (globals.css). */}
      <OperationsSurface />

      {/* Not a surface: no fill, no border, no radius. The shell's top padding
          gives it the same top edge as the panel, so the brand lockup and the
          panel's breadcrumb sit on one line. */}
      <aside className="hidden w-[260px] shrink-0 flex-col lg:flex">
        {/* `px-lg` where the nav rows below use `px-sm` inside a `px-sm`
            container: both land the mark 16px from the column's edge. The
            brand block is inset once and the rows are inset twice, so the two
            numbers have to differ to produce one left edge. */}
        <div className="flex h-panel-header shrink-0 items-center px-lg">
          <PortalBrand />
        </div>

        {/* The nav is the only part of the column that may scroll; the brand
            block and the account footer stay put. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PortalNav />
        </div>

        {/* Pushed to the bottom: who is signed in, and leaving the portal, are
            chrome rather than navigation. */}
        <div className="shrink-0 border-t border-divider px-sm pt-md pb-md">
          {account ? <PortalAccount user={account} /> : null}
          <PortalNavFooterLinks />
        </div>
      </aside>

      <PortalPanel account={account}>{children}</PortalPanel>
    </div>
  )
}
