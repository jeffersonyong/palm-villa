import type { Metadata } from 'next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { countAvailableByType, findAvailableUnits } from '@/lib/db/bookings'
import { getUnitCounts } from '@/lib/db/inventory'
import { palmVillaConfig } from '@/lib/domain/config'
import { addDays, isStayDate, todayInBrunei } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

import { BookingForm } from './booking-form'

export const metadata: Metadata = {
  title: 'New booking',
}

/**
 * Walk-in booking (capability B2, prd.md §9.4).
 *
 * Dates are URL state, so availability is server-rendered and a staff member
 * can keep a set of dates open in a tab, or share the link. Everything up to
 * the price panel is a server component; only the form island is interactive.
 *
 * Native date inputs are used deliberately: design.md specs no calendar or
 * date-picker component, so building one would be unsanctioned styling. Two
 * date fields on a desktop staff screen do not need one.
 */

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; type?: string }>
}

export default async function NewBookingPage({ searchParams }: PageProps) {
  const params = await searchParams
  const config = palmVillaConfig

  const today = todayInBrunei()

  // A range is usable only if both dates parse and check-out is after check-in.
  // Anything else — a hand-edited URL, a half-filled form — falls back to the
  // empty state rather than throwing.
  const range =
    params.from && params.to && isStayDate(params.from) && isStayDate(params.to)
      ? { start: params.from, end: params.to }
      : null

  const hasDates = range !== null && range.start < range.end
  const checkIn = hasDates ? range.start : ''
  const checkOut = hasDates ? range.end : ''

  const unitTypeId =
    params.type && config.unitTypes.some((type) => type.id === params.type)
      ? params.type
      : undefined

  const availableUnits = hasDates
    ? await findAvailableUnits({ range: { start: checkIn, end: checkOut }, unitTypeId })
    : []
  const availableByType = hasDates
    ? await countAvailableByType({ start: checkIn, end: checkOut })
    : {}
  const totalByType = await getUnitCounts()

  return (
    <div className="max-w-[1120px]">
      <header>
        <h1 className="font-display text-display-sm text-foreground">New booking</h1>
        <p className="mt-xs text-body-md text-copy">
          Walk-in only — the guest is here and pays now (prd.md §9.4).
        </p>
      </header>

      <Card surface="raised" className="mt-xl">
        <form method="get" className="flex flex-wrap items-end gap-lg">
          <div className="grid w-[164px] gap-sm">
            <Label htmlFor="from">Check-in</Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={checkIn || today}
              min={today}
              max={addDays(today, config.maxAdvanceBookingDays)}
            />
          </div>

          <div className="grid w-[164px] gap-sm">
            <Label htmlFor="to">Check-out</Label>
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={checkOut || addDays(today, 1)}
              min={addDays(today, 1)}
              max={addDays(today, config.maxAdvanceBookingDays + 1)}
            />
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="type">Unit type</Label>
            <NativeSelect
              className="w-[264px]"
              id="type"
              name="type"
              defaultValue={unitTypeId ?? ''}
            >
              <option value="">Any type</option>
              {config.unitTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} — BND {formatCents(type.baseRatePerNight)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <Button type="submit" variant="tertiary">
            Check availability
          </Button>
        </form>

        {hasDates && (
          <dl className="mt-lg grid grid-cols-2 gap-lg border-t border-divider pt-lg sm:grid-cols-4">
            {config.unitTypes.map((type) => {
              const free = availableByType[type.id] ?? 0
              const total = totalByType[type.id] ?? 0

              return (
                <div key={type.id}>
                  <dt className="micro-label text-muted-foreground">{type.name}</dt>
                  <dd className="mt-xs text-display-xs text-foreground tabular-nums">
                    {free}
                    <span className="text-body-sm text-muted-foreground"> of {total} free</span>
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
      </Card>

      <section className="mt-xl">
        {!hasDates ? (
          <Card surface="inset" className="p-lg">
            <p className="text-body-md text-copy">
              Choose check-in and check-out dates to see what is free. Check-out must be at least
              one night after check-in, and bookings open up to {config.maxAdvanceBookingDays} days
              ahead.
            </p>
          </Card>
        ) : availableUnits.length === 0 ? (
          <Card surface="inset" className="p-lg">
            <p className="text-body-md text-copy">
              Nothing free for those dates{unitTypeId ? ' in that unit type' : ''}. Try different
              dates, or widen the unit type.
            </p>
          </Card>
        ) : (
          <BookingForm
            units={availableUnits}
            config={config}
            checkIn={checkIn}
            checkOut={checkOut}
          />
        )}
      </section>
    </div>
  )
}
