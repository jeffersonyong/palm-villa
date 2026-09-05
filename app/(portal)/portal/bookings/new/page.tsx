import type { Metadata } from 'next'

import { PageHeader } from '@/components/portal/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DateField } from '@/components/ui/date-field'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { countAvailableByType, findAvailableUnits } from '@/lib/db/bookings'
import { getUnitCounts } from '@/lib/db/inventory'
import { palmVillaConfig } from '@/lib/domain/config'
import { addDays, isStayDate, todayInBrunei } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

import { NewBookingScreen } from './new-booking-screen'

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
  // Serviceable only: this is the denominator of "3 of 36 free", and a unit
  // that is out of service is not one of the thirty-six anyone can be sold.
  const totalByType = await getUnitCounts({ serviceableOnly: true })

  // The discount control is an affordance, not a gate: the server action checks
  // `booking.discount` again on every submit. Deciding it here only spares a
  // staff member a field they cannot use (architecture.md §3).
  const actor = await getActor()
  const mayDiscount = Boolean(actor && hasPermission(actor.permissions, 'booking.discount'))
  const mayWaiveDeposit = Boolean(actor && hasPermission(actor.permissions, 'deposit.waive'))

  /* Header, date controls and availability tiles — everything that asks the
     question rather than answering it. Hoisted into a variable because
     `NewBookingScreen` drops it entirely once a booking exists: a confirmation
     sharing a screen with the search that produced it reads as one more
     result, which is what made this screen hard to place at a glance. It is
     server-rendered here and passed across as a prop, so the queries above
     stay on the server and only the outcome is client state. */
  const chrome = (
    <>
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
          of its own.

          The instruction and the fields it is about are **one cluster**: `xl`
          from the header, `md` between the two, which is design.md's "tight
          inside a cluster, loose between clusters". It sits above the row
          rather than below it because it tells you what to do with those
          fields, and an instruction underneath the thing it instructs is read
          second if at all. Everything else on the screen keeps the `xl`
          rhythm. */}
      <div className="mt-xl grid gap-md">
        {!hasDates ? (
          /* Not a `Notice`. Blue is `info`, and design.md spends it on a fact
             the reader needs before acting — what a transfer hold does to a
             unit, that BND 100 is collected on arrival. This is the screen
             saying it has nothing to show yet, which is an absence, and the
             system draws absence in quiet gray. Spending the one attention
             colour on "fill in these two fields" would also devalue it on this
             very screen: the summary panel carries a real `Notice` about the
             deposit, and two blue panels of equal weight flatten the
             difference between how to use a form and what money changes hands. */
          <Card surface="inset" placement="page">
            <p className="text-body-md text-copy">
              Choose check-in and check-out dates to see what is free. Check-out must be at least
              one night after check-in, and bookings open up to {config.maxAdvanceBookingDays} days
              ahead.
            </p>
          </Card>
        ) : null}

        <form method="get" className="flex flex-wrap items-end gap-lg">
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
      </div>

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
    </>
  )

  // Only the form's screen can reach the confirmation state, so only that
  // branch goes through `NewBookingScreen`. Every other state is chrome plus
  // an explanation, and stays a server render.
  if (hasDates && availableUnits.length > 0) {
    return (
      <div className="max-w-[1120px]">
        <NewBookingScreen
          chrome={chrome}
          units={availableUnits}
          config={config}
          checkIn={checkIn}
          checkOut={checkOut}
          mayDiscount={mayDiscount}
          mayWaiveDeposit={mayWaiveDeposit}
        />
      </div>
    )
  }

  return (
    <div className="max-w-[1120px]">
      {chrome}

      {hasDates ? (
        <section className="mt-xl">
          {/* `placement="page"` to match the instruction above: design.md
              gives a gray panel its radius and padding from where it sits,
              and both of these stand on the page ground. This one was at the
              nested scale, which read as a control that had grown. */}
          <Card surface="inset" placement="page">
            <p className="text-body-md text-copy">
              Nothing free for those dates{unitTypeId ? ' in that unit type' : ''}. Try different
              dates, or widen the unit type.
            </p>
          </Card>
        </section>
      ) : null}
    </div>
  )
}
