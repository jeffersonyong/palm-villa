import { PortalNav } from '@/components/portal-nav'

/**
 * Portal chrome: left nav on the gray ground, content to ~1440px, calm tone.
 * The sidebar shares the page ground — structure is the hairline, not a fill
 * (design.md §Layout). The portal never goes above `display-sm`.
 *
 * No auth here yet. Middleware gating of (portal) and (field) lands with the
 * auth slice (architecture.md §3).
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="border-b border-divider lg:min-h-dvh lg:w-[220px] lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="px-xl py-lg">
          <p className="micro-label text-muted-foreground">Palm Villa</p>
          <p className="mt-xs text-display-xs text-foreground">Operations</p>
        </div>
        <PortalNav />
      </aside>

      <main className="flex-1 px-xl py-xl">
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
    </div>
  )
}
