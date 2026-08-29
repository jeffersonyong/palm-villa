import { OperationsSurface } from '@/components/operations-surface'

/**
 * Field chrome: single column, mobile-first, nothing that competes with the
 * row-level primary action (design.md §Layout).
 *
 * An operations surface like the portal — same product, different hardware,
 * never seen by a customer — so it takes the monochrome register too.
 */
export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <OperationsSurface />
      {/* The primary fill belongs to the row-level Check in buttons on this
          surface, so the chrome stays neutral rather than competing. */}
      <header className="border-b border-divider bg-card px-lg py-md">
        <p className="text-body-sm-strong text-foreground">Palm Villa · Field</p>
      </header>
      <main className="mx-auto w-full max-w-[640px] px-lg py-lg">{children}</main>
    </div>
  )
}
