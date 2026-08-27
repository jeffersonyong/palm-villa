/**
 * Field chrome: single column, mobile-first, nothing that competes with the
 * row-level primary action (design.md §Layout).
 */
export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      {/* Aqua belongs to the row-level Check in buttons on this surface, so the
          chrome stays neutral rather than competing with them. */}
      <header className="border-b border-divider bg-card px-lg py-md">
        <p className="text-body-sm-strong text-foreground">Palm Villa · Field</p>
      </header>
      <main className="mx-auto w-full max-w-[640px] px-lg py-lg">{children}</main>
    </div>
  )
}
