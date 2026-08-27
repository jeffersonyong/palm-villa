import { PortalNav } from '@/components/portal-nav'

/**
 * Portal chrome: left nav, full-width content to ~1440px, calm tone.
 * design.md — the portal never goes above `display-sm`.
 *
 * No auth here yet. Middleware gating of (portal) and (field) lands with the
 * auth slice (architecture.md §3).
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="border-b border-divider bg-card lg:min-h-dvh lg:w-[240px] lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="px-xl py-lg">
          <p className="text-body-sm-strong text-muted-foreground">Palm Villa</p>
          <p className="text-display-xs text-foreground">Operations</p>
        </div>
        <PortalNav />
      </aside>

      <main className="flex-1 px-xl py-xl">
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
    </div>
  )
}
