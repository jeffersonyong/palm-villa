import Link from 'next/link'

import { Stat } from '@/components/portal/stat'
import { StatusDot } from '@/components/portal/status-dot'
import { unitStatusTone } from '@/components/portal/unit-status-badge'
import { Card } from '@/components/ui/card'
import { UNIT_STATUSES, UNIT_STATUS_LABELS, type UnitStatus } from '@/lib/domain/unit-status'
import { cn } from '@/lib/utils'

/**
 * The board's breakdown — one tile per unit status (capability B8).
 *
 * A stat strip per design.md §Components: one tile per figure, cards standing
 * directly on the ground, no container around them. Each tile is also the way
 * *into* what it counts, the same construction the bookings register's stream
 * tiles use — someone who reads "4 out of service" wants to see those four, and
 * making them find a chip that says the same word is a screen that answered a
 * question and then hid the follow-up.
 *
 * Plain links, so this stays a server component with no island on it: the
 * filter is URL state, so setting one is a navigation and nothing more.
 * Clicking the current tile clears its filter rather than reapplying it, or
 * five of the six become one-way doors.
 *
 * A **status** dot, which is what these figures count — unlike the bookings
 * strip, whose tiles count records of one *kind* and therefore take the stream
 * register instead. The counts are of the whole building, not of the filtered
 * list: six figures that all changed when you clicked one of them would stop
 * being the answer to "what is the state of the building this morning".
 */

interface UnitStatusTilesProps {
  counts: Readonly<Record<UnitStatus, number>>
  /** The statuses currently filtered on. Empty means all. */
  selected: readonly UnitStatus[]
  /** The rest of the query — the type filter — carried through every tile. */
  otherParams: URLSearchParams
}

export function UnitStatusTiles({ counts, selected, otherParams }: UnitStatusTilesProps) {
  return (
    <div className="mt-md grid grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-6">
      {UNIT_STATUSES.map((status) => {
        const isSelected = selected.includes(status)
        const params = new URLSearchParams(otherParams)

        // Selecting one status replaces the selection rather than adding to
        // it. The chip in the filter row is the plural control; a tile is
        // "show me these".
        if (!isSelected) {
          params.set('status', status)
        }

        const query = params.toString()

        return (
          <Link
            key={status}
            href={query ? `/portal/units?${query}` : '/portal/units'}
            aria-current={isSelected ? 'true' : undefined}
            aria-label={
              isSelected
                ? `Showing ${UNIT_STATUS_LABELS[status]} only — clear this filter`
                : `Show ${UNIT_STATUS_LABELS[status]} only`
            }
            className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Card
              className={cn(
                'h-full card-interactive hover:border-foreground/20',
                isSelected && 'border-foreground/30',
              )}
            >
              <Stat
                size="sm"
                label={UNIT_STATUS_LABELS[status]}
                value={counts[status]}
                dot={<StatusDot tone={unitStatusTone(status)} />}
              />
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
