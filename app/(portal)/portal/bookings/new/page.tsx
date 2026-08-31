import type { Metadata } from 'next'

import { PageHeader } from '@/components/portal/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DateField } from '@/components/ui/date-field'
import { Label } from '@/components/ui/label'
import { Notice } from '@/components/ui/notice'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
 * Check-in and check-out stay two fields rather than one range control: the
 * range picker's ends are inclusive, and these two are the half-open occupancy
 * pair the database is asked about, so collapsing them would either change what
 * the form means or need a conversion sitting invisibly inside it. Both are
 * `DateField`, so they open this system's calendar rather than the browser's,
 * and the booking window is enforced on the grid instead of after the fact.
 */

/** The "no unit type filter" option's value. See the select below. */
const ANY_UNIT_TYPE = 'any'

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
      <PageHeader
        title="New booking"
        description="Walk-in only — the guest is here and pays now (prd.md §9.4)."
      />

      {/* The control line is undrawn. It asks what to show, the way a list
          screen's filter chips do, and a box around it opened the page with a
          panel of chrome before the booking had been started; without one the
          fields line up with the page title. The counts below it *are* drawn,
          because they are a different thing — the answer, not the question —
          and a card is what tells the two apart now that the row has no edge
          of its own. Everything from the header down is then one rhythm at
          `xl`: the counts were briefly pulled closer to the row that produced
          them, but with a card of their own they are a peer of the form below,
          and the tighter gap read as a slip rather than as grouping. */}
      <form method="get" className="mt-xl flex flex-wrap items-end gap-lg">
        <div className="grid w-[164px] gap-sm">
          <Label htmlFor="from">Check-in</Label>
          <DateField
            id="from"
            name="from"
            defaultValue={checkIn || today}
            min={today}
            max={addDays(today, config.maxAdvanceBookingDays)}
          />
        </div>

        <div className="grid w-[164px] gap-sm">
          <Label htmlFor="to">Check-out</Label>
          <DateField
            id="to"
            name="to"
            defaultValue={checkOut || addDays(today, 1)}
            min={addDays(today, 1)}
            max={addDays(today, config.maxAdvanceBookingDays + 1)}
          />
        </div>

        <div className="grid gap-sm">
          <Label htmlFor="type">Unit type</Label>
          {/* `ANY_UNIT_TYPE` rather than an empty value: a select option must
              carry a non-empty value, and the page already treats an
              unrecognised `type` as "no filter", so the sentinel never reaches
              the query. */}
          <Select name="type" defaultValue={unitTypeId ?? ANY_UNIT_TYPE}>
            <SelectTrigger id="type" className="w-[264px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_UNIT_TYPE}>Any type</SelectItem>
              {config.unitTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name} — BND {formatCents(type.baseRatePerNight)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" variant="tertiary">
          Check availability
        </Button>
      </form>

      {hasDates && (
        /* Tiles on the page ground, uncontained — the dashboard strip's
           construction, so the two screens' "how many" readouts are the same
           object. The card that used to hold them drew a box around four
           boxes and opened the screen with a panel of chrome. */
        <dl className="mt-xl grid grid-cols-2 gap-md sm:grid-cols-4">
          {config.unitTypes.map((type) => {
            const free = availableByType[type.id] ?? 0
            const total = totalByType[type.id] ?? 0

            return (
              <Card key={type.id}>
                <dt className="micro-label text-muted-foreground">{type.name}</dt>
                <dd className="mt-xs text-display-xs text-foreground tabular-nums">
                  {free}
                  <span className="text-body-sm text-muted-foreground"> of {total} free</span>
                </dd>
              </Card>
            )
          })}
        </dl>
      )}

      <section className="mt-xl">
        {!hasDates ? (
          <Notice placement="page">
            Choose check-in and check-out dates to see what is free. Check-out must be at least one
            night after check-in, and bookings open up to {config.maxAdvanceBookingDays} days ahead.
          </Notice>
        ) : availableUnits.length === 0 ? (
          <Card surface="inset">
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
