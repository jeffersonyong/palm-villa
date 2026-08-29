import { PortalAccount } from '@/components/portal/portal-account'
import { PortalNav, PortalNavFooterLinks } from '@/components/portal/portal-nav'
import { PortalTopbar } from '@/components/portal/portal-topbar'

/**
 * Portal chrome: left nav on the white ground, a topbar for what belongs to no
 * single screen, content to ~1440px, calm tone. The sidebar and the topbar
 * share the page ground — structure is the hairline, not a fill (design.md
 * §Layout). The portal never goes above `display-sm`.
 *
 * Below `lg` the sidebar becomes a drawer, opened from the topbar.
 *
 * No auth here yet. Middleware gating of (portal) and (field) lands with the
 * auth slice (architecture.md §3), which is also when the account row below
 * stops being a placeholder and gains a real menu.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden lg:flex lg:min-h-dvh lg:w-[220px] lg:shrink-0 lg:flex-col lg:border-r lg:border-divider">
        <div className="px-xl py-lg">
          <p className="micro-label text-muted-foreground">Palm Villa</p>
          <p className="mt-xs text-display-xs text-foreground">Operations</p>
        </div>

        <PortalNav />

        {/* Pushed to the bottom of the sidebar: who is signed in, and leaving
            the portal, are chrome rather than navigation. */}
        <div className="border-divider px-md pt-md pb-lg lg:mt-auto lg:border-t">
          <PortalAccount />
          <PortalNavFooterLinks />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <PortalTopbar />

        <main className="flex-1 px-lg py-xl lg:px-xl">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
