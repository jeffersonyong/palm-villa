import Link from 'next/link'

import { Stat } from '@/components/portal/stat'
import { StreamDot } from '@/components/portal/stream-dot'
import { Card } from '@/components/ui/card'
import type { BookingStreamCounts } from '@/lib/db/bookings'
import { BOOKING_STREAMS, BOOKING_STREAM_LABELS, type BookingStream } from '@/lib/domain/stream'
import { cn } from '@/lib/utils'

/**
 * The register's per-stream breakdown — one tile per revenue stream (prd.md §1).
 *
 * A stat strip, so it follows design.md §Components: one tile per figure, cards
 * standing directly on the ground, no container around them. What is added
 * here is that each tile is also the way *into* its stream — the figure and the
 * filter are the same object, because a staff member who reads "6 day passes"
 * wants to see those six, and making them hunt for a chip that says the same
 * word is a screen that answered a question and then hid the follow-up.
 *
 * They are plain links, which keeps this a server component with no island on
 * it: the filter is URL state (see the page), so setting one is a navigation
 * and nothing more. Clicking the active tile clears its filter rather than
 * reapplying it, which is what a toggle in a strip of three has to do or two
 * of the three become one-way doors.
 *
 * The figures are the breakdown of the *filtered* list, minus the stream filter
 * itself — see `countBookingsByStream`. So narrowing to September narrows all
 * three, and choosing a stream leaves the other two readable rather than
 * zeroing them.
 *
 * Each tile takes its **stream** dot, not a status one. `Stat` takes a dot
 * where a figure counts records of one kind, and these count records of one
 * kind — but which kind is a category, not a state, so it is drawn from the
 * third colour register. The semantic hues still mean status and nothing else
 * (design.md §Color roles); this is what stops a "day pass" tile borrowing the
 * amber that means a payment is outstanding.
 */

interface StreamTilesProps {
  counts: BookingStreamCounts
  /** The streams currently filtered on. Empty means all. */
  selected: readonly BookingStream[]
  /** The rest of the query — status and dates — carried through every tile. */
  otherParams: URLSearchParams
}

export function StreamTiles({ counts, selected, otherParams }: StreamTilesProps) {
  return (
    <div className="mt-md grid grid-cols-3 gap-md">
      {BOOKING_STREAMS.map((stream) => {
        const isSelected = selected.includes(stream)
        const params = new URLSearchParams(otherParams)

        // Selecting one stream replaces the selection rather than adding to it.
        // The chip in the filter row is the plural control; a tile is "show me
        // these", and a strip where three clicks select all three would say
        // exactly what selecting none already says.
        if (!isSelected) {
          params.set('stream', stream)
        }

        const query = params.toString()

        return (
          <Link
            key={stream}
            href={query ? `/portal/bookings?${query}` : '/portal/bookings'}
            aria-current={isSelected ? 'true' : undefined}
            aria-label={
              isSelected
                ? `Showing ${BOOKING_STREAM_LABELS[stream]} only — clear this filter`
                : `Show ${BOOKING_STREAM_LABELS[stream]} only`
            }
            className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* `card-interactive` is the hover the design system already owns —
                a 1px lift and a hairline that strengthens, never a shadow. The
                current tile keeps that stronger edge rather than taking a fill:
                a gray tile on the sunken ground reads as sunk, and "where am I"
                here is a drawn edge. */}
            <Card
              className={cn(
                'h-full card-interactive hover:border-foreground/20',
                isSelected && 'border-foreground/30',
              )}
            >
              <Stat
                size="sm"
                label={BOOKING_STREAM_LABELS[stream]}
                value={counts[stream]}
                dot={<StreamDot stream={stream} />}
              />
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
