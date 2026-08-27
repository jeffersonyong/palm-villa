'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { createWalkInBooking } from '@/lib/db/bookings'
import { isStayDate } from '@/lib/domain/dates'
import { palmVillaConfig } from '@/lib/domain/config'
import { priceStay } from '@/lib/domain/pricing/stay'

/**
 * Walk-in booking creation (prd.md §9.4, capability B2).
 *
 * The guest is present and pays on the spot, so the booking is created and paid
 * in one action and no unit is ever held against an unpaid promise.
 */

const stayDate = z.string().refine(isStayDate, 'Enter a valid date.')

/**
 * The form's shape, validated at the boundary.
 *
 * A server action receives untyped `FormData` from a browser. An authenticated
 * staff member is trusted, but the request is not: the field could be anything,
 * so it is parsed before it reaches the domain layer.
 */
const walkInBookingSchema = z.object({
  unitId: z.string().min(1, 'Choose a unit.'),
  unitTypeId: z.string().min(1),
  checkIn: stayDate,
  checkOut: stayDate,
  chargeableGuests: z.coerce.number().int().min(1, 'A booking needs at least one guest.').max(50),
  exemptGuests: z.coerce.number().int().min(0).max(50),
  sofaBeds: z.coerce.number().int().min(0).max(20),
  earlyCheckInHours: z.coerce.number().int().min(0).max(12),
  lateCheckOutHours: z.coerce.number().int().min(0).max(12),
  guestName: z.string().trim().min(1, 'Enter the guest name.').max(120),
  guestPhone: z.string().trim().min(1, 'Enter a contact number.').max(40),
  vehicleRegistration: z.string().trim().max(20).optional(),
})

export interface WalkInBookingState {
  status: 'idle' | 'error' | 'created'
  message?: string
  /** Field-level messages, keyed by input name. */
  fieldErrors?: Record<string, string>
  created?: {
    reference: string
    unitRef: string
    total: number
    securityDeposit: number
  }
}

export async function createWalkInBookingAction(
  _previous: WalkInBookingState,
  formData: FormData,
): Promise<WalkInBookingState> {
  // architecture.md §4: every mutation passes the permission check first.
  await requirePermission('booking.create')

  const parsed = walkInBookingSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}

    for (const issue of parsed.error.issues) {
      const field = issue.path[0]

      if (typeof field === 'string' && !fieldErrors[field]) {
        fieldErrors[field] = issue.message
      }
    }

    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors }
  }

  const input = parsed.data

  // Re-priced server-side. The client island computes the same total for live
  // display, but no submitted total is ever trusted — the price charged is the
  // one the server derives from the inputs.
  const priced = priceStay(
    {
      unitTypeId: input.unitTypeId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      party: { chargeableGuests: input.chargeableGuests, exemptGuests: input.exemptGuests },
      sofaBeds: input.sofaBeds,
      earlyCheckInHours: input.earlyCheckInHours,
      lateCheckOutHours: input.lateCheckOutHours,
    },
    palmVillaConfig,
  )

  if (!priced.ok) {
    return { status: 'error', message: priced.error.message }
  }

  const result = await createWalkInBooking({
    unitId: input.unitId,
    range: { start: input.checkIn, end: input.checkOut },
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    vehicleRegistration: input.vehicleRegistration?.toUpperCase() || null,
    chargeableGuests: input.chargeableGuests,
    exemptGuests: input.exemptGuests,
    lines: priced.lines,
    total: priced.total,
    securityDeposit: priced.securityDeposit,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  // The availability counts and the unit list are server-rendered, and
  // `useActionState` only re-renders the client island — so without this a clerk
  // taking two bookings in a row sees the pre-booking figures on the second one.
  revalidatePath('/portal/bookings/new')

  return {
    status: 'created',
    created: {
      reference: result.booking.reference,
      unitRef: result.booking.unitId,
      total: result.booking.total,
      securityDeposit: result.booking.securityDeposit,
    },
  }
}
