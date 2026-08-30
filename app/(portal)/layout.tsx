import { getAuthenticatedUser } from '@/lib/auth/session'
import { PortalAccount, type PortalAccountUser } from '@/components/portal/portal-account'
import { PortalNav, PortalNavFooterLinks } from '@/components/portal/portal-nav'
import { PortalTopbar } from '@/components/portal/portal-topbar'
import { OperationsSurface } from '@/components/operations-surface'
import { PortalBrand } from '@/components/portal/portal-brand'

/**
 * Portal chrome: left nav on the white ground, a topbar for what belongs to no
 * single screen, content to ~1440px, calm tone. The sidebar and the topbar
 * share the page ground — structure is the hairline, not a fill (design.md
 * §Layout). The portal never goes above `display-sm`.
 *
 * Below `lg` the sidebar becomes a drawer, opened from the topbar.
 *
 * proxy.ts guarantees a session behind this layout, so the null case is a
 * race (signed out in another tab mid-render) — the chrome renders without an
 * account row and the next navigation lands on /login.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  const account: PortalAccountUser | null = user
    ? { id: user.id, name: user.displayName, email: user.email }
    : null

  return (
    <div className="min-h-dvh lg:flex">
      {/* Flips <html> to the monochrome operations register (globals.css). */}
      <OperationsSurface />
      <aside className="hidden lg:flex lg:min-h-dvh lg:w-[220px] lg:shrink-0 lg:flex-col lg:border-r lg:border-divider">
        {/* Exactly the topbar's height with the same bottom hairline, so the
            rule runs unbroken across both and separates the brand from the
            navigation (design.md §Components — Portal topbar). */}
        <div className="flex h-14 shrink-0 items-center border-b border-divider px-xl">
          <PortalBrand />
        </div>

        <PortalNav />

        {/* Pushed to the bottom of the sidebar: who is signed in, and leaving
            the portal, are chrome rather than navigation. */}
        <div className="border-divider px-md pt-md pb-lg lg:mt-auto lg:border-t">
          {account ? <PortalAccount user={account} /> : null}
          <PortalNavFooterLinks />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <PortalTopbar account={account} />

        <main className="flex-1 px-lg py-xl lg:px-xl">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
