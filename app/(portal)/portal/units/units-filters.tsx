'use client'

import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { SearchField } from '@/components/portal/search-field'
import { StatusDot } from '@/components/portal/status-dot'
import { unitStatusTone } from '@/components/portal/unit-status-badge'
import { Button } from '@/components/ui/button'
import { MultiSelectFilter, type MultiSelectOption } from '@/components/ui/multi-select-filter'
import { UNIT_STATUSES, UNIT_STATUS_LABELS, type UnitStatus } from '@/lib/domain/unit-status'
import { cn } from '@/lib/utils'

/**
 * The units board's filter row (capability B8).
 *
 * Filters are URL state, exactly as they are on the bookings register: "what is
 * out of service" can be kept in a tab, bookmarked, or sent to whoever is
 * fixing it. This island knows nothing about a unit; it only knows how to write
 * three search params.
 *
 * The current values arrive as props rather than through `useSearchParams`,
 * which keeps this out of a Suspense boundary and means the chips can only ever
 * show a filter the server actually applied.
 */

interface UnitTypeOption {
  id: string
  name: string
}

interface UnitsFiltersProps {
  /** The chosen statuses, in canonical order. Empty means any. */
  statuses: readonly UnitStatus[]
  /** The chosen unit types, in canonical order. Empty means any. */
  types: readonly string[]
  /** Every unit type, for the Type panel's options. */
  unitTypes: readonly UnitTypeOption[]
  /** The search the server applied. Empty means none. */
  search: string
}

/** Each status carries its badge colour as a dot, so the choices read in the
 *  same language as the table below and the tiles above. */
const STATUS_OPTIONS: readonly MultiSelectOption<UnitStatus>[] = UNIT_STATUSES.map((status) => ({
  value: status,
  label: UNIT_STATUS_LABELS[status],
  leading: <StatusDot tone={unitStatusTone(status)} />,
}))

export function UnitsFilters({ statuses, types, unitTypes, search }: UnitsFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const isFiltered = statuses.length > 0 || types.length > 0 || search !== ''

  // No dot on a unit type. A type is not a state, and the semantic hues mean
  // status and nothing else (design.md §Color roles) — the bookings register
  // reaches for the stream register in the same spot, and a unit type is not a
  // stream either. So these options are words.
  const typeOptions: readonly MultiSelectOption<string>[] = unitTypes.map((type) => ({
    value: type.id,
    label: type.name,
  }))

  /** Writes the whole filter set, so the URL is rebuilt from one place. */
  function apply(
    nextStatuses: readonly UnitStatus[],
    nextTypes: readonly string[],
    nextSearch: string,
  ) {
    const params = new URLSearchParams()

    if (nextSearch) {
      params.set('q', nextSearch)
    }

    for (const status of nextStatuses) {
      params.append('status', status)
    }

    for (const type of nextTypes) {
      params.append('type', type)
    }

    const query = params.toString()

    startTransition(() => {
      // `push`, not `replace`: back should undo a filter.
      router.push(query ? `/portal/units?${query}` : '/portal/units', { scroll: false })
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
        placeholder="Unit, occupant or type"
        onChange={(next) => apply(statuses, types, next)}
      />

      <MultiSelectFilter
        label="Status"
        options={STATUS_OPTIONS}
        selected={statuses}
        onChange={(next) => apply(next, types, search)}
      />

      <MultiSelectFilter
        label="Type"
        options={typeOptions}
        selected={types}
        onChange={(next) => apply(statuses, next, search)}
      />

      {isFiltered ? (
        <Button variant="ghost" onClick={() => apply([], [], '')}>
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
