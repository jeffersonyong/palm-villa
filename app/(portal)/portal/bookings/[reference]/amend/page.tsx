import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DateField } from '@/components/ui/date-field'
import { Label } from '@/components/ui/label'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { findAvailableUnits, getBookingByReference } from '@/lib/db/bookings'
import { canAmend } from '@/lib/domain/booking-state'
import { palmVillaConfig } from '@/lib/domain/config'
import { addDays, isStayDate, todayInBrunei } from '@/lib/domain/dates'

import { AmendForm } from './amend-form'

export const metadata: Metadata = {
  title: 'Edit booking',
}

/**
 * Amending a booking (capability B3).
 *
 * Built the same way as the walk-in screen: dates are URL state, so
 * availability is server-rendered and changing the range is a plain GET rather
 * than a client-side fetch that could disagree with what the write will accept.
 * Only the form is an island.
 *
 * The unit list is queried with `excludeBookingId`, without which this booking's
 * own occupancy would rule out the unit the guest is currently in — the form
 * would offer every unit except the right one, and saving an unchanged booking
 * would be impossible.
 */

interface PageProps {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function AmendBookingPage({ params, searchParams }: PageProps) {
  const { reference } = await params
  const query = await searchParams
  const actor = await getActor()
  const config = palmVillaConfig

  if (!actor || !hasPermission(actor.permissions, 'booking.amend')) {
    return (
      <>
        <PageHeader title="Edit booking" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Changing a booking needs the "Edit bookings" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  // Whether the discount control is offered. The action re-checks it, and
  // carries the booking's existing discount through untouched when it is
  // absent — an amendment by somebody without the permission must not put a
  // discounted stay back to full price.
  const mayDiscount = hasPermission(actor.permissions, 'booking.discount')

  const booking = await getBookingByReference(decodeURIComponent(reference))

  if (!booking) {
    notFound()
  }

  // The status can move while a staff member is walking to the desk. The action
  // checks this again before it writes; this is the courtesy that stops them
  // filling in a form that cannot be saved.
  if (!canAmend(booking.status)) {
    return (
      <>
        <PageHeader title={`Edit ${booking.reference}`} />
        <EmptyState
          className="mt-xl"
          title={`This booking is ${booking.status.replace(/_/g, ' ')}`}
          description={
            booking.status === 'checked_in'
              ? 'The guest has already checked in, so the stay can no longer be changed here.'
              : 'Closed bookings are kept as a record and cannot be changed.'
          }
          action={
            <Button asChild variant="tertiary">
              <Link href={`/portal/bookings/${booking.reference}`}>Back to the booking</Link>
            </Button>
          }
        />
      </>
    )
  }

  // Amending is amending a *stay*: this screen picks a unit and a range and
  // reprices nights, none of which a day pass has (prd.md §6.1). The read model
  // now carries streams that occupy nothing, so the case has to be answered
  // rather than assumed away — and answered here, once, so the form below
  // receives an occupancy it can rely on. `amend_booking()` refuses the same
  // booking for the same reason. Nothing writes such a booking yet.
  if (!booking.stay) {
    return (
      <>
        <PageHeader title={`Edit ${booking.reference}`} />
        <EmptyState
          className="mt-xl"
          title="This booking has no stay to edit"
          description="It occupies no unit, so there are no dates or unit to change here."
          action={
            <Button asChild variant="tertiary">
              <Link href={`/portal/bookings/${booking.reference}`}>Back to the booking</Link>
            </Button>
          }
        />
      </>
    )
  }

  const { stay } = booking

  // Anything unusable in the URL falls back to the dates the booking already
  // has, so a mistyped range shows the booking as it stands rather than an error.
  const requested =
    query.from &&
    query.to &&
    isStayDate(query.from) &&
    isStayDate(query.to) &&
    query.from < query.to
      ? { start: query.from, end: query.to }
      : stay.range

  const units = await findAvailableUnits({
    range: requested,
    excludeBookingId: booking.id,
  })

  const today = todayInBrunei()

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title={`Edit ${booking.reference}`}
        description="Everything that changes is recorded against the booking."
        actions={
          <Button asChild variant="ghost">
            <Link href={`/portal/bookings/${booking.reference}`}>
              <ArrowLeft aria-hidden />
              Back
            </Link>
          </Button>
        }
      />

      <Card className="mt-xl">
        <form method="get" className="flex flex-wrap items-end gap-lg">
          <div className="grid w-[164px] gap-sm">
            <Label htmlFor="from">Check-in</Label>
            <DateField
              id="from"
              name="from"
              defaultValue={requested.start}
              min={today}
              max={addDays(today, config.maxAdvanceBookingDays)}
            />
          </div>

          <div className="grid w-[164px] gap-sm">
            <Label htmlFor="to">Check-out</Label>
            <DateField
              id="to"
              name="to"
              defaultValue={requested.end}
              min={today}
              max={addDays(today, config.maxAdvanceBookingDays + 1)}
            />
          </div>

          {/* A separate submit from the amendment itself: changing the range
              has to re-ask the database what is free before the form can offer
              a unit for it. */}
          <Button type="submit" variant="tertiary">
            Check these dates
          </Button>

          {requested.start !== stay.range.start || requested.end !== stay.range.end ? (
            <Button asChild variant="ghost">
              <Link href={`/portal/bookings/${booking.reference}/amend`}>Reset dates</Link>
            </Button>
          ) : null}
        </form>
      </Card>

      {units.length === 0 ? (
        <EmptyState
          className="mt-xl"
          title="Nothing is free for those dates"
          description="Every unit is taken for the whole range, including the one this guest is in. Try a different range."
        />
      ) : (
        <div className="mt-xl">
          <AmendForm
            booking={booking}
            stay={stay}
            units={units}
            config={config}
            checkIn={requested.start}
            checkOut={requested.end}
            mayDiscount={mayDiscount}
          />
        </div>
      )}
    </div>
  )
}
