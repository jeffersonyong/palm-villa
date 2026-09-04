'use client'

import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { depositStageTone } from '@/components/portal/deposit-stage-badge'
import { SearchField } from '@/components/portal/search-field'
import { StatusDot } from '@/components/portal/status-dot'
import { Button } from '@/components/ui/button'
import type { StayDateRange } from '@/components/ui/calendar'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MultiSelectFilter, type MultiSelectOption } from '@/components/ui/multi-select-filter'
import { DEPOSIT_STAGE_LABELS } from '@/lib/domain/deposit'
import type { StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

import { HELD_STAGES, type HeldStage, type LedgerView } from './ledger-view'

/**
 * The deposits ledger's filter row (capability E1).
 *
 * Filters are URL state, exactly as on the bookings register and the units
 * board: "everything waiting on an inspection for stays this week" can be kept
 * in a tab, bookmarked, or sent to Housekeeping. This island knows nothing
 * about a deposit; it only knows how to write four search params.
 *
 * ── Two chips, and why not a third ────────────────────────────────────────
 *
 * **Stage** is the plural control for the same param the stage tiles set — a
 * tile is "show me these", this is "these two, not that one". It offers the
 * three stages a *held* deposit can be in and not "released": released
 * deposits are the archive, a different set read by a different query, and
 * they are a view (`?show=`) rather than a filter. A chip mixing "in house"
 * with "released" would be asking for two reads stitched into one list.
 *
 * **Stay date** matches stays that touch the window, not stays that begin inside
 * it — the register's rule, and the question Finance actually asks ("deposits
 * for the August guests"). It applies to the archive too, which is why it is
 * carried through a change of view and a change of view is carried through it.
 *
 * Choosing a stage while in an archive view returns to the held set, because
 * that is the only set a stage narrows. The current values arrive as props
 * rather than through `useSearchParams`, so the chips can only ever show a
 * filter the server actually applied.
 */

interface DepositsFiltersProps {
  /** The chosen stages, in pipeline order. Empty means every held stage. */
  stages: readonly HeldStage[]
  /** Both ends inclusive — the days the calendar shows as selected. */
  from?: StayDate
  to?: StayDate
  /** Which set is on screen; an archive view rides along with the window. */
  view: LedgerView
  /** The search the server applied. Empty means none. */
  search: string
}

/** Each stage carries its badge colour as a dot, so the choices read in the
 *  same language as the column below and the tiles above. */
const STAGE_OPTIONS: readonly MultiSelectOption<HeldStage>[] = HELD_STAGES.map((stage) => ({
  value: stage,
  label: DEPOSIT_STAGE_LABELS[stage],
  leading: <StatusDot tone={depositStageTone(stage)} />,
}))

export function DepositsFilters({ stages, from, to, view, search }: DepositsFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const range: StayDateRange | null = from && to ? { start: from, end: to } : null
  const isFiltered = stages.length > 0 || range !== null || search !== ''

  /**
   * Writes the whole filter set, so the URL is rebuilt from one place. The
   * view is kept unless a stage was chosen, which only the held set answers.
   */
  function apply(
    nextStages: readonly HeldStage[],
    nextRange: StayDateRange | null,
    nextSearch: string,
  ) {
    const params = new URLSearchParams()

    if (nextSearch) {
      params.set('q', nextSearch)
    }

    if (view !== 'held' && nextStages.length === 0) {
      params.set('show', view)
    }

    for (const stage of nextStages) {
      params.append('stage', stage)
    }

    if (nextRange) {
      params.set('from', nextRange.start)
      params.set('to', nextRange.end)
    }

    const query = params.toString()

    startTransition(() => {
      // `push`, not `replace`: back should undo a filter. `scroll: false`
      // keeps a long ledger where it was.
      router.push(query ? `/portal/deposits?${query}` : '/portal/deposits', { scroll: false })
    })
  }

  return (
    <div
      aria-busy={isPending}
      className={cn(
        'flex flex-wrap items-center gap-sm transition-opacity duration-150 motion-reduce:transition-none',
        isPending && 'opacity-60',
      )}
    >
      <SearchField
        value={search}
        placeholder="Booking, guest or unit"
        onChange={(next) => apply(stages, range, next)}
      />

      <MultiSelectFilter
        label="Stage"
        options={STAGE_OPTIONS}
        selected={stages}
        onChange={(next) => apply(next, range, search)}
      />

      <DateRangePicker
        label="Stay date"
        value={range}
        onChange={(next) => apply(stages, next, search)}
      />

      {isFiltered ? (
        <Button variant="ghost" onClick={() => apply([], null, '')}>
          {/* A funnel struck through, not a bare cross: this clears the whole
              filter set, where a cross elsewhere in the row clears one field. */}
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
