import { OperationsSurface } from '@/components/operations-surface'

import { PrintButton } from './print-button'

/**
 * Documents meant to leave the building.
 *
 * A fourth route group, and it exists for a mechanical reason rather than a
 * stylistic one. The operations shell is `h-dvh overflow-hidden` with the
 * content panel owning the scroll (app/(portal)/layout.tsx) — which is what
 * keeps the sidebar in place and lets the panel header stick — and a browser
 * printing a page whose content lives inside a scroll container prints exactly
 * one screenful of it. A nested layout cannot remove its parent, so a statement
 * rendered inside the portal shell could never print past the fold.
 *
 * It keeps the portal's **URL space** — `/portal/deposits/PV-4821/statement` —
 * so `proxy.ts`, which gates on `/portal/:path*`, still requires a session.
 * The route group is a layout boundary and nothing else.
 *
 * The page is a document rather than a screen: one column, ordinary flow, and
 * a toolbar that is `print:hidden` because a printed page has no buttons on it.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface-panel">
      {/* The monochrome register, like every other operations surface — a
          statement is staff output, and design.md keeps the brand hue off it. */}
      <OperationsSurface />

      <div className="mx-auto w-full max-w-[760px] px-lg py-xl">
        <div className="flex items-center justify-between gap-md print:hidden">
          <PrintButton />
        </div>

        <div className="mt-xl print:mt-0">{children}</div>
      </div>
    </div>
  )
}
