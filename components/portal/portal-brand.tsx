import { TreePalm } from 'lucide-react'

/**
 * The operations lockup: a mark, then "Palm Villa" over "Operations".
 *
 * One component for the three places it appears — the sidebar's brand block,
 * the mobile drawer's, and the sign-in screen — so the three cannot drift
 * apart. Callers own the surrounding block (its height and hairline); this is
 * the lockup only.
 *
 * The mark is a placeholder for real artwork, and it is deliberately
 * monochrome: ink fill with the ground knocked out of it, inverting with the
 * theme. The operations surfaces carry no teal (design.md §Two accents, one
 * system), and an ink square reads as a mark rather than a control — the
 * portal's own chips are `canvas-soft`, so nothing else here is a solid fill.
 *
 * The wordmark is 14px at 600 rather than `display-xs` — the lockup is chrome
 * beside a 28px mark, not a heading, and at 17px the two lines outweighed the
 * thing they sit next to. `micro` stays at 11px: that is the system's floor,
 * and the pair reads smaller because the dominant line came down.
 *
 * The two lines are pulled `xxs` closer than their line-heights leave them,
 * so they lock up as one object rather than as a label with a heading under it.
 */
export function PortalBrand() {
  return (
    <div className="flex items-center gap-sm">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background"
      >
        <TreePalm className="size-4" />
      </span>

      <div className="min-w-0">
        <p className="micro-label text-muted-foreground">Palm Villa</p>
        <p className="-mt-xxs text-body-md font-semibold text-foreground">Operations</p>
      </div>
    </div>
  )
}
