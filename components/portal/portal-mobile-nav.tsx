'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'

import { PortalAccount } from '@/components/portal/portal-account'
import { PortalNav, PortalNavFooterLinks } from '@/components/portal/portal-nav'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/**
 * The sidebar as a drawer, below `lg`.
 *
 * It fills with the page ground — the same surface the sidebar sits on, so the
 * nav reads identically in both places (design.md §Components — Drawers). In
 * dark that keeps it ink rather than the card's ink-deep.
 *
 * It closes when a link inside it is activated, caught by delegation rather
 * than by wrapping every link in a `SheetClose`: the nav is shared with the
 * desktop sidebar, where no such wrapper exists, so this keeps one nav
 * component instead of two. Keyboard activation fires a click too, so Enter on
 * a link closes the drawer the same way a tap does.
 */
export function PortalMobileNav() {
  const [isOpen, setIsOpen] = useState(false)

  function closeIfNavigating(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('a')) setIsOpen(false)
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger
        aria-label="Open navigation"
        className="inline-flex size-control items-center justify-center rounded-md text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden"
      >
        <Menu aria-hidden className="size-4" />
      </SheetTrigger>

      <SheetContent side="left" className="bg-background" showCloseButton={false}>
        <SheetTitle className="sr-only">Portal navigation</SheetTitle>

        <div className="px-xl pt-lg pb-md">
          <p className="micro-label text-muted-foreground">Palm Villa</p>
          <p className="mt-xs text-display-xs text-foreground">Operations</p>
        </div>

        {/* Delegation target: every interactive thing inside is itself a link. */}
        <div className="flex flex-1 flex-col overflow-y-auto" onClick={closeIfNavigating}>
          <PortalNav />

          <div className="mt-auto border-t border-divider px-md pt-md pb-lg">
            <PortalAccount />
            <PortalNavFooterLinks />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
