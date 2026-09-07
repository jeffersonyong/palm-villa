'use client'

import type { Route } from 'next'
import { FunnelX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { CashUpStateBadge } from '@/components/portal/cash-up-state-badge'
import { Button } from '@/components/ui/button'
import type { StayDateRange } from '@/components/ui/calendar'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { REPORT_DATE_RANGE_PRESETS } from '@/components/ui/date-range-presets'
import { MultiSelectFilter, type MultiSelectOption } from '@/components/ui/multi-select-filter'
import type { StayDate } from '@/lib/domain/dates'
import {
  CASH_UP_STATES,
  CASH_UP_STATE_LABELS,
  type CashUpState,
} from '@/lib/domain/reports/cash-up'
import { cn } from '@/lib/utils'

/**
 * The cash-up's control line: the period, and which states to show.
 *
 * The state filter is what makes a long period readable. Most days in a quiet
 * month are the same answer repeated, and the reason to open this screen is
 * usually one of the other two — "has anything gone unbanked", "is anything
 * over-banked". Narrowing to those is the review, and doing it by eye down
 * thirty rows is the work the filter removes.
 *
 * Filtering hides rows but never changes a figure: every day's balance is
 * accumulated across the whole period before the filter is applied, so a row
 * shown on its own still carries the balance it actually closed on. What the
 * reader loses is the continuity between rows, which is the ordinary cost of
 * filtering any ledger.
 *
 * The chips carry the real badges, so the filter and the column speak the same
 * vocabulary.
 */

const STATE_OPTIONS: readonly MultiSelectOption<CashUpState>[] = CASH_UP_STATES.map((state) => ({
  value: state,
  label: CASH_UP_STATE_LABELS[state],
  leading: <CashUpStateBadge state={state} />,
}))

interface CashUpFiltersProps {
  from: StayDate
  to: StayDate
  /** False when the period is the screen's default rather than the reader's. */
  isExplicit: boolean
  states: readonly CashUpState[]
}

export function CashUpFilters({ from, to, isExplicit, states }: CashUpFiltersProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const range: StayDateRange = { start: from, end: to }

  function apply(period: StayDateRange | null, nextStates: readonly CashUpState[]) {
    const next = new URLSearchParams()

    if (period) {
      next.set('from', period.start)
      next.set('to', period.end)
    }

    for (const state of nextStates) {
      next.append('state', state)
    }

    const query = next.toString()
    const href = (query ? `/portal/reports/cash-up?${query}` : '/portal/reports/cash-up') as Route

    startTransition(() => {
      router.push(href, { scroll: false })
    })
  }

  const hasFilters = isExplicit || states.length > 0

  return (
    <div
      aria-busy={isPending}
      className={cn(
        'flex flex-wrap items-center gap-sm transition-opacity duration-150 motion-reduce:transition-none',
        isPending && 'opacity-60',
      )}
    >
      <DateRangePicker
        label="Period"
        value={range}
        presets={REPORT_DATE_RANGE_PRESETS}
        onChange={(next) => apply(next, states)}
      />

      <MultiSelectFilter
        label="State"
        options={STATE_OPTIONS}
        selected={states}
        onChange={(next) => apply(isExplicit ? range : null, next)}
      />

      {hasFilters ? (
        <Button variant="ghost" onClick={() => apply(null, [])}>
          <FunnelX aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
