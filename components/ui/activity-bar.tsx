import { cn } from '@/lib/utils'

/**
 * Work is happening, and nobody can say how long it will take.
 *
 * A 2px track with a solid segment travelling across it, spanning whatever it
 * is reporting on. The system had no way to say this: a button says
 * "Attaching…" while *you* wait for something you started, and a `Skeleton`
 * stands in for content that has not arrived — but neither covers a record
 * that is already on screen while the server rebuilds part of it. That state
 * was a caption with three dots, which is not a signal anybody reads as "wait".
 *
 * ── Why a bar and not a spinner ───────────────────────────────────────────
 *
 * A spinning circle is the reflex and it is the wrong shape here. This surface
 * is drawn in hairlines and rectangles, round is reserved for avatars and
 * status dots (design.md §Geometry), and a spinner floats in its own box
 * rather than belonging to anything. A bar spans the thing it is about, so it
 * reads as *this* is being worked on rather than *something* is loading.
 *
 * ── Why this is not the banned shimmer ────────────────────────────────────
 *
 * design.md rules out a shimmer sweep on skeletons, and the reason it gives is
 * that a gradient sweep is decoration and does not survive the theme flip. Both
 * halves are answered rather than dodged: the segment is a flat `muted`
 * foreground on a `muted` track — two tokens, no gradient, nothing to recut per
 * theme — and it is reporting a state rather than dressing one up.
 *
 * ── Reduced motion ────────────────────────────────────────────────────────
 *
 * The segment goes full width instead of stopping where it stood. A 40% bar
 * frozen mid-track reads as progress that has stalled at 40%, which is a claim
 * this makes nowhere else — nothing here knows a percentage.
 *
 * `aria-hidden`, always. It is the visual half of a sentence that is already
 * beside it in `aria-live` text, and a screen reader announcing the bar as
 * well would say the same thing twice.
 */
export function ActivityBar({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('h-[2px] w-full overflow-hidden bg-muted', className)}>
      <div className="h-full w-2/5 animate-indeterminate bg-muted-foreground motion-reduce:w-full motion-reduce:animate-none" />
    </div>
  )
}
