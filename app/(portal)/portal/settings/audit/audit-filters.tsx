'use client'

import type { Route } from 'next'
import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { SearchField } from '@/components/portal/search-field'
import { Button } from '@/components/ui/button'
import type { StayDateRange } from '@/components/ui/calendar'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { REPORT_DATE_RANGE_PRESETS } from '@/components/ui/date-range-presets'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import {
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_TYPES,
  AUDIT_FAMILIES,
  AUDIT_FAMILY_LABELS,
  type AuditEntityType,
  type AuditFamily,
  SYSTEM_ACTOR,
} from '@/lib/domain/audit-label'
import type { StayDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

/**
 * The four questions asked of the audit trail (capability F4).
 *
 * What happened, to what kind of record, who did it, and when. Current values
 * arrive as props from the server rather than being read from the URL here, so
 * a chip can only ever show a filter the server actually applied — the
 * arrangement every filter row in the portal uses.
 *
 * The period rail is the retrospective one: the trail answers "what happened",
 * so every span it offers is behind today.
 */

export interface ActorOption {
  id: string
  name: string
}

interface AuditFiltersProps {
  families: readonly AuditFamily[]
  entityTypes: readonly AuditEntityType[]
  actor: string | null
  search: string
  from: StayDate | null
  to: StayDate | null
  /** Everyone who could have acted, for the Who filter. */
  actors: readonly ActorOption[]
}

const FAMILY_OPTIONS = AUDIT_FAMILIES.map((family) => ({
  value: family,
  label: AUDIT_FAMILY_LABELS[family],
}))

const ENTITY_OPTIONS = AUDIT_ENTITY_TYPES.map((entityType) => ({
  value: entityType,
  label: AUDIT_ENTITY_LABELS[entityType],
}))

export function AuditFilters({
  families,
  entityTypes,
  actor,
  search,
  from,
  to,
  actors,
}: AuditFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const range: StayDateRange | null = from && to ? { start: from, end: to } : null
  const isFiltered =
    families.length > 0 || entityTypes.length > 0 || actor !== null || search !== '' || range !== null

  /**
   * The whole query string is rebuilt on every change rather than patched, so
   * a filter left behind by an earlier interaction cannot survive one that
   * should have cleared it. Page and size are deliberately dropped: narrowing
   * the trail while on page nine should land on page one of the new answer.
   */
  function apply(next: {
    families?: readonly string[]
    entityTypes?: readonly string[]
    actor?: string | null
    search?: string
    range?: StayDateRange | null
  }): void {
    const params = new URLSearchParams()

    for (const family of next.families ?? families) {
      params.append('family', family)
    }

    for (const entityType of next.entityTypes ?? entityTypes) {
      params.append('type', entityType)
    }

    const nextActor = next.actor === undefined ? actor : next.actor

    if (nextActor) {
      params.set('who', nextActor)
    }

    const nextSearch = (next.search ?? search).trim()

    if (nextSearch !== '') {
      params.set('q', nextSearch)
    }

    const nextRange = next.range === undefined ? range : next.range

    if (nextRange) {
      params.set('from', nextRange.start)
      params.set('to', nextRange.end)
    }

    const query = params.toString()
    const href = (query === ''
      ? '/portal/settings/audit'
      : `/portal/settings/audit?${query}`) as Route

    startTransition(() => {
      router.push(href, { scroll: false })
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
        placeholder="Booking, unit or account"
        onChange={(term) => apply({ search: term })}
      />

      <MultiSelectFilter
        label="What"
        groupLabel="Kind of change"
        options={FAMILY_OPTIONS}
        selected={families}
        onChange={(next) => apply({ families: next })}
      />

      <MultiSelectFilter
        label="Record"
        groupLabel="Kind of record"
        options={ENTITY_OPTIONS}
        selected={entityTypes}
        onChange={(next) => apply({ entityTypes: next })}
      />

      <MultiSelectFilter
        label="Who"
        groupLabel="Who did it"
        options={[
          // The system is an option rather than an absence: "what ran on its
          // own last night" is a real question, and retention expiry is
          // performed by nobody on purpose.
          { value: SYSTEM_ACTOR, label: 'The system' },
          ...actors.map((person) => ({ value: person.id, label: person.name })),
        ]}
        // One answer, not several — asked as a multi-select so the chip reads
        // like its neighbours, and narrowed to the last one chosen.
        selected={actor ? [actor] : []}
        onChange={(next) => apply({ actor: next.at(-1) ?? null })}
      />

      <DateRangePicker
        label="When"
        value={range}
        presets={REPORT_DATE_RANGE_PRESETS}
        onChange={(next) => apply({ range: next })}
      />

      {isFiltered ? (
        <Button
          variant="ghost"
          onClick={() =>
            apply({ families: [], entityTypes: [], actor: null, search: '', range: null })
          }
        >
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
