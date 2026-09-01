import type { BookingStream } from '@/lib/domain/stream'
import { cn } from '@/lib/utils'

/**
 * A booking's revenue stream at icon scale: a 6px dot.
 *
 * Deliberately **not** `StatusDot` with an extra tone, and the distinction is
 * the point. design.md holds semantic colour to one job — "status means
 * meaning, not brand" — so a stream cannot borrow a status hue without the row
 * quietly saying a day pass is a state a booking can be in. It is the third
 * colour register, the same way identity hues are: neither brand nor status,
 * kept apart by **form** rather than by hue alone.
 *
 * Which is why this register has mid hues and no tints (see globals.css). A
 * status is a chip *containing* a word; a stream is a dot *beside* one. There
 * is no token to build a stream badge from, so a row can never carry two
 * tinted rectangles where only one of them is the outcome.
 *
 * Like a `StatusDot`, it never appears without its label — a bare dot is a
 * mystery, not metadata — and it is identical on every surface, because which
 * product was sold is a fact about the booking rather than a brand flourish
 * the monochrome operations rule would forbid.
 */
const DOT_CLASSES: Record<BookingStream, string> = {
  short_stay: 'bg-stream-short-stay',
  day_pass: 'bg-stream-day-pass',
  tenancy: 'bg-stream-tenancy',
}

export function StreamDot({ stream, className }: { stream: BookingStream; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASSES[stream], className)}
    />
  )
}
