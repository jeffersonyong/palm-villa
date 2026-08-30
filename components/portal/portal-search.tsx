'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'

/**
 * Global search — the affordance, not the feature.
 *
 * There is no search backend yet, so this deliberately promises nothing it
 * cannot do: the trigger opens a real dialog that says plainly what is missing
 * and what it will cover. No results list is rendered at all, because an empty
 * or faked one would read as "found nothing" rather than "not built".
 *
 * The trigger is a button styled as an input rather than an actual input: it
 * cannot be typed into, so it should not look focusable in place.
 */
export function PortalSearch() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return

      event.preventDefault()
      setIsOpen((open) => !open)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="hidden h-control w-56 items-center gap-sm rounded-md border border-border bg-card px-md text-body-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:flex"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        Search
        <kbd className="ml-auto rounded-sm border border-border bg-muted px-xs py-xxs text-caption text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {/* Below `md` the faux input costs more width than it earns. */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Search"
        className="inline-flex size-control items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
      >
        <Search aria-hidden className="size-4" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {/* Anchored high rather than centred: a search panel belongs near the
            bar that opened it. */}
        <DialogContent className="top-[15%] max-w-[560px] translate-y-0 gap-md">
          <DialogHeader>
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>
              Not connected yet. Once the data layer lands this will search bookings, guests and
              payments.
            </DialogDescription>
          </DialogHeader>

          <Input autoFocus placeholder="Search bookings, guests, payments…" disabled />

          <Notice>
            Nothing is wired behind this box yet — it is here so the shortcut and its place in the
            bar are settled before the screens that need it are built.
          </Notice>
        </DialogContent>
      </Dialog>
    </>
  )
}
