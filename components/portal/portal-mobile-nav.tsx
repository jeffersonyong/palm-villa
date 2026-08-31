'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'

import { PortalAccount, type PortalAccountUser } from '@/components/portal/portal-account'
import { PortalBrand } from '@/components/portal/portal-brand'
import { PortalNav, PortalNavFooterLinks } from '@/components/portal/portal-nav'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/**
 * The sidebar as a drawer, below `lg`.
 *
 * It fills with the app background — the surface the desktop sidebar sits
 * directly on, that column being no surface of its own, so the nav reads
 * identically in both places (design.md §Components — Drawers). In dark that
 * keeps it ink rather than the card's raised tone.
 *
 * It closes when a link inside it is activated, caught by delegation rather
 * than by wrapping every link in a `SheetClose`: the nav is shared with the
 * desktop sidebar, where no such wrapper exists, so this keeps one nav
 * component instead of two. Keyboard activation fires a click too, so Enter on
 * a link closes the drawer the same way a tap does.
 */
export function PortalMobileNav({ account }: { account: PortalAccountUser | null }) {
  const [isOpen, setIsOpen] = useState(false)

  function closeIfNavigating(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('a')) setIsOpen(false)
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {/* The trigger sits on the content panel rather than the shell, so its
          focus ring offsets against the panel's white. */}
      <SheetTrigger
        aria-label="Open navigation"
        className="inline-flex size-control items-center justify-center rounded-md text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel lg:hidden"
      >
        <Menu aria-hidden className="size-4" />
      </SheetTrigger>

      <SheetContent side="left" className="bg-background" showCloseButton={false}>
        <SheetTitle className="sr-only">Portal navigation</SheetTitle>

        {/* Matches the sidebar's brand block. The hairline under it went with
            the topbar it used to line up with (design.md v1.2) — there is no
            rule inside the nav. */}
        <div className="flex h-panel-header shrink-0 items-center px-lg">
          <PortalBrand />
        </div>

        {/* Delegation target: every interactive thing inside is itself a link. */}
        <div className="flex flex-1 flex-col overflow-y-auto" onClick={closeIfNavigating}>
          <PortalNav />

          <div className="mt-auto border-t border-divider px-sm pt-md pb-lg">
            {account ? <PortalAccount user={account} /> : null}
            <PortalNavFooterLinks />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
