import { signOutAction } from '@/app/(auth)/actions'
import { OperationsSurface } from '@/components/operations-surface'
import { Button } from '@/components/ui/button'

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
      <header className="flex items-center justify-between border-b border-divider bg-card py-xs pr-xs pl-lg">
        <p className="text-body-sm-strong text-foreground">Palm Villa · Field</p>
        {/* Ghost, not primary — and `touch` size, like everything interactive
            on this surface (design.md §Field). */}
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="touch">
            Sign out
          </Button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-[640px] px-lg py-lg">{children}</main>
    </div>
  )
}
