'use client'

import { useActionState } from 'react'

import type { Unit } from '@/lib/db/inventory'
import type { PropertyConfig } from '@/lib/domain/config'

import { createWalkInBookingAction, type WalkInBookingState } from './actions'
import { BookingCreated } from './booking-created'
import { BookingForm } from './booking-form'

/**
 * The screen body: the search-and-fill state, or the confirmation that
 * replaces it.
 *
 * This exists because of *where* the outcome state has to be read. The page
 * header, the date controls and the availability tiles are server-rendered,
 * and whether a booking was just created is `useActionState` in the browser —
 * so nothing inside the form could hide the chrome that sits above it. The
 * chrome arrives here as a rendered prop instead, and this component chooses
 * between showing it and standing it down. That keeps `page.tsx` a server
 * component doing the queries, and keeps `BookingForm` about its fields.
 *
 * It also puts the two states of the screen in one place, where they can be
 * read as alternatives rather than found in two files.
 */

const initialState: WalkInBookingState = { status: 'idle' }

interface NewBookingScreenProps {
  /** Header, date controls and availability tiles, rendered on the server. */
  chrome: React.ReactNode
  units: readonly Unit[]
  config: PropertyConfig
  checkIn: string
  checkOut: string
  /** Whether this staff member holds `booking.discount`. Decided by the page. */
  mayDiscount: boolean
}

export function NewBookingScreen({ chrome, ...form }: NewBookingScreenProps) {
  const [state, formAction, isPending] = useActionState(createWalkInBookingAction, initialState)

  if (state.status === 'created' && state.created) {
    return <BookingCreated created={state.created} />
  }

  return (
    <>
      {chrome}

      <section className="mt-xl">
        <BookingForm {...form} state={state} formAction={formAction} isPending={isPending} />
      </section>
    </>
  )
}
