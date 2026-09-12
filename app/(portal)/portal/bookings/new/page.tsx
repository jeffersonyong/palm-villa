import type { Metadata } from 'next'

import { PageHeader } from '@/components/portal/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StayRangeField } from '@/components/ui/stay-range-field'
import { Label } from '@/components/ui/label'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { countAvailableByType, findAvailableUnits } from '@/lib/db/bookings'
import { getUnitCounts } from '@/lib/db/inventory'
import { getPropertyConfig } from '@/lib/db/property-config'
import { addDays, isStayDate, todayInBrunei } from '@/lib/domain/dates'

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
 * Check-in and check-out are **one control**, not two fields. They were two
 * because the filter's range picker has inclusive ends and these are the
 * half-open occupancy pair the database is asked about, so collapsing them onto
 * that control would have meant a conversion sitting invisibly inside the form.
 * `StayRangeField` is the answer to that rather than a way around it: its
 * second click *is* the check-out morning, so the range it emits is the pair
 * the query wants, and the trigger says the nights out loud. What the two
 * fields could express and this cannot is the whole point — a check-out before
 * a check-in, or one half filled in.
 */

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; type?: string; unit?: string }>
}

export default async function NewBookingPage({ searchParams }: PageProps) {
  const params = await searchParams
  const config = await getPropertyConfig()

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

  /*
   * The unit type the calendar was pointing at, when it sent us here.
   *
   * It no longer narrows this query. Until 19 September 2026 it did, and the
   * control that set it was a `<select>` inside the availability form — so
   * changing it changed nothing until somebody also pressed *Check
   * availability*, and a clerk who changed the type and went straight on
   * filling in the form was filling in a form about the old one. The stale
   * state was invisible and the booking it produced was wrong.
   *
   * Narrowing is a question about a list already in hand, so it belongs to the
   * form: this reads every unit free for the dates and the island filters them
   * as the clerk chooses. Changing the type now reprices instantly and cannot
   * be out of step, and — the part the round trip could never offer — the
   * guest's name and number survive it, because nothing navigates.
   */
  const unitTypeId =
    params.type && config.unitTypes.some((type) => type.id === params.type)
      ? params.type
      : undefined

  const availableUnits = hasDates
    ? await findAvailableUnits({ range: { start: checkIn, end: checkOut } })
    : []

  /*
   * The unit the calendar was pointing at, when it sent us here.
   *
   * The form otherwise opens on the first unit free for the dates, which is
   * fine when the dates arrived on their own but wrong when a row was clicked:
   * the calendar's dialog names a unit, and landing on a different one would
   * make that dialog a lie. Honoured only if it really is free for these
   * dates — the grid and this query are two reads, and a unit taken in between
   * must not be pre-selected.
   */
  const preferredUnitId =
    params.unit === undefined
      ? undefined
      : availableUnits.find((unit) => unit.ref === params.unit)?.id
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
        description="The security deposit is taken as the booking is made — it is what secures it. Say whether the guest is paying the stay with it, or settling that on arrival."
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
             unit, that BND 100 secures the booking. This is the screen
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
          {/* One control, two params. The window is the booking window from
              the property config, and the extra day on `max` is the check-out
              morning of a stay whose last bookable night is the last day of
              it — a departure is not a night, so it may sit one day past. */}
          {/* Wide enough for the longest thing it can say — a stay crossing a
              month boundary, with its nights — because truncating the count is
              worse than the field being a little roomy on a short one. */}
          <div className="grid w-[300px] gap-sm">
            <Label htmlFor="stay">Stay</Label>
            <StayRangeField
              id="stay"
              nameFrom="from"
              nameTo="to"
              // Tonight, as the two fields opened. The walk-in at the counter
              // is the case this screen is for, and the empty state above says
              // what to do, so the default is a starting point rather than a
              // claim: pressing Check availability without touching it asks
              // the question a walk-in is asking.
              defaultValue={
                hasDates
                  ? { start: checkIn, end: checkOut }
                  : { start: today, end: addDays(today, 1) }
              }
              min={today}
              max={addDays(today, config.maxAdvanceBookingDays + 1)}
            />
          </div>

          {/* The type it deep-linked with, carried back out so the URL is
              still the whole state of the screen and the calendar's link
              still lands on the type it named. */}
          {unitTypeId ? <input type="hidden" name="type" value={unitTypeId} /> : null}

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
          preferredUnitTypeId={unitTypeId}
          preferredUnitId={preferredUnitId}
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
              Nothing free for those dates. Try different dates.
            </p>
          </Card>
        </section>
      ) : null}
    </div>
  )
}
