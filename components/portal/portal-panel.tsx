import type { PortalAccountUser } from '@/components/portal/portal-account'
import { PortalPanelHeader } from '@/components/portal/portal-panel-header'

/**
 * The content panel: the only elevated surface in the operations shell, and
 * the thing that scrolls (design.md §Layout).
 *
 * Two nested boxes, and each one is doing a job the other cannot. The **outer
 * box owns the shape** — the fill, the hairline and the top radius — and clips
 * with `overflow-hidden`, which is what keeps the sticky header from painting
 * square corners over the rounded ones. The **inner box owns the scroll**, so
 * the header inside it is sticky against the panel's own content rather than
 * against the window; the window does not scroll at all here.
 *
 * The panel takes no bottom border and no bottom radius because its foot is
 * off-screen: it is anchored to the viewport bottom and bleeds past it, so the
 * sheet reads as continuing below the fold. The content region carries `3xl` of
 * bottom padding so the last row of a table is not flush against the edge when
 * you reach the end.
 *
 * This is a server component, and stays one. It briefly ran an
 * IntersectionObserver to reveal the header's hairline on scroll; the hairline
 * is permanent now (a header is a bar, not a line of text that acquires an edge
 * once you move), so the sentinel, the observer and the client boundary all
 * went with it. Only the header below is client, and only because a breadcrumb
 * needs the pathname.
 */
export function PortalPanel({
  account,
  children,
}: {
  account: PortalAccountUser | null
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-panel lg:ml-sm lg:rounded-t-xl lg:border-x lg:border-t lg:border-border">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PortalPanelHeader account={account} />

        {/* `2xl` at the head: the header is chrome and the `h1` beneath it
            starts the content, so the boundary between them is a break between
            clusters and takes the section measure, not the 16px it had — at
            `lg` the title sat close enough to the hairline to read as part of
            the bar. `3xl` at the foot so the last row of a table is not flush
            against the viewport edge at the end of a scroll — the panel bleeds
            past it, so nothing else would stop the content there. */}
        <main className="pt-2xl pb-3xl">
          <div className="mx-auto w-full max-w-[1440px] px-lg lg:px-xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
