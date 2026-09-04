'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { hasPermission } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/require-permission'
import { amendBooking, getBookingById } from '@/lib/db/bookings'
import { canAmend } from '@/lib/domain/booking-state'
import { palmVillaConfig } from '@/lib/domain/config'
import { isStayDate } from '@/lib/domain/dates'
import { parseDiscount, MAX_DISCOUNT_REASON_LENGTH } from '@/lib/domain/discount'
import { priceStay } from '@/lib/domain/pricing/stay'
import {
  hasVehicleAnswer,
  normaliseVehicleRegistrations,
  MAX_VEHICLES_PER_BOOKING,
  MAX_VEHICLE_REGISTRATION_LENGTH,
} from '@/lib/domain/vehicle'

/**
 * Amending a booking (capability B3, amend half).
 *
 * The same skeleton as the walk-in action: permission first, Zod at the
 * boundary, reprice server-side, then one transactional write. The submitted
 * total is never trusted — the price charged is the one the server derives from
 * the inputs, exactly as it is on creation.
 */

const stayDate = z.string().refine(isStayDate, 'Enter a valid date.')

const amendBookingSchema = z.object({
  bookingId: z.string().uuid(),
  /**
   * The `updated_at` the form was opened against, passed straight back as the
   * opaque string it arrived as. Parsing it — into a `Date`, or through
   * `z.coerce.date()` — would lose the microseconds Postgres keeps and refuse
   * every save as stale.
   */
  expectedUpdatedAt: z.string().min(1),
  unitId: z.string().min(1, 'Choose a unit.'),
  unitTypeId: z.string().min(1),
  checkIn: stayDate,
  checkOut: stayDate,
  chargeableGuests: z.coerce.number().int().min(1, 'A booking needs at least one guest.').max(50),
  exemptGuests: z.coerce.number().int().min(0).max(50),
  sofaBeds: z.coerce.number().int().min(0).max(20),
  lateCheckOutHours: z.coerce.number().int().min(0).max(12),
  guestName: z.string().trim().min(1, 'Enter the guest name.').max(120),
  guestPhone: z.string().trim().min(1, 'Enter a contact number.').max(40),
  /** One entry per row — read with `getAll`, see the walk-in action. */
  vehicles: z.array(z.string().max(MAX_VEHICLE_REGISTRATION_LENGTH)).max(MAX_VEHICLES_PER_BOOKING),
  noVehicle: z.enum(['true', 'false']).transform((value) => value === 'true'),
  /**
   * Optional, unlike the cancellation reason. **[A]** — an amendment already
   * records what changed on both sides, so the note is context rather than the
   * only evidence; a cancellation records only that it happened.
   */
  reason: z.string().trim().max(280).optional(),
  /**
   * Submitted only by a staff member who holds `booking.discount` — the
   * control is not rendered otherwise. Defaulted here so an amendment by
   * someone without it parses cleanly rather than failing validation on three
   * fields their form never had.
   */
  discountKind: z.string().default('none'),
  discountValue: z.string().default(''),
  discountReason: z.string().max(MAX_DISCOUNT_REASON_LENGTH).default(''),
})

export interface AmendBookingState {
  status: 'idle' | 'error' | 'amended'
  message?: string
  fieldErrors?: Record<string, string>
  /** Where the client navigates on success. */
  reference?: string
}

export async function amendBookingAction(
  _previous: AmendBookingState,
  formData: FormData,
): Promise<AmendBookingState> {
  const actor = await requirePermission('booking.amend')

  const parsed = amendBookingSchema.safeParse({
    ...Object.fromEntries(formData),
    vehicles: formData.getAll('vehicles').filter((entry) => typeof entry === 'string'),
  })

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
  const vehicles = normaliseVehicleRegistrations(input.vehicles)

  // prd.md §13 [C] again, and the reason it is re-checked on amendment rather
  // than only on creation: a booking taken before the field was required has
  // no plate, and this is the screen where that gets fixed.
  if (!hasVehicleAnswer(vehicles, input.noVehicle)) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: {
        vehicles:
          'Enter the vehicle registration, or tick "Arriving without a vehicle" if there is no car.',
      },
    }
  }

  const booking = await getBookingById(input.bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  // Re-checked here and not only when the screen rendered: a guest can check in
  // while the form is open, and the state machine is the only thing that
  // decides whether a booking may still be changed (architecture.md §5.3).
  if (!canAmend(booking.status)) {
    return {
      status: 'error',
      message: `This booking is ${booking.status.replace(/_/g, ' ')} and can no longer be edited.`,
    }
  }

  // ── Who may move the discount, and what happens when they may not ────────
  //
  // A discount is only read off this form when its author holds
  // `booking.discount`. For everyone else the booking's existing instruction
  // is carried through untouched — because the lines are replaced wholesale on
  // every amendment, and a discount nobody resubmitted would otherwise vanish.
  // Somebody without the permission changing a guest's phone number must not
  // silently put a comped stay back to full price.
  let discount = booking.discount

  if (hasPermission(actor.permissions, 'booking.discount')) {
    const submitted = parseDiscount({
      kind: input.discountKind,
      value: input.discountValue,
      reason: input.discountReason,
    })

    if (!submitted.ok) {
      return {
        status: 'error',
        message: 'Check the highlighted fields.',
        fieldErrors: { [submitted.error.field]: submitted.error.message },
      }
    }

    // Null is a removal, not an omission — the control always submits a value,
    // and taking a discount away is recorded like giving one.
    discount = submitted.discount
  }

  const priced = priceStay(
    {
      unitTypeId: input.unitTypeId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      party: { chargeableGuests: input.chargeableGuests, exemptGuests: input.exemptGuests },
      sofaBeds: input.sofaBeds,
      // Not offered, for the same reason the walk-in form does not offer it:
      // prd.md §18 N6 leaves the standard check-in time undefined, so "early"
      // has no baseline and the charge cannot be applied to a real number of
      // hours. No booking can carry such a line today.
      earlyCheckInHours: 0,
      lateCheckOutHours: input.lateCheckOutHours,
      // Re-derived against the new subtotal rather than carried as cents: a
      // stay given ten percent off and then extended by a night is discounted
      // ten percent of the longer stay, which is what was actually agreed.
      discount,
    },
    palmVillaConfig,
  )

  if (!priced.ok) {
    return { status: 'error', message: priced.error.message }
  }

  const result = await amendBooking({
    bookingId: input.bookingId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    unitId: input.unitId,
    range: { start: input.checkIn, end: input.checkOut },
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    vehicles,
    noVehicle: input.noVehicle,
    chargeableGuests: input.chargeableGuests,
    exemptGuests: input.exemptGuests,
    lines: priced.lines,
    total: priced.total,
    securityDeposit: priced.securityDeposit,
    discount,
    reason: input.reason || null,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  // Dates, unit and price may all have moved, so every screen that counts
  // availability or lists this booking is now stale.
  revalidatePath('/portal/bookings')
  revalidatePath(`/portal/bookings/${result.booking.reference}`)
  revalidatePath('/portal/bookings/new')
  revalidatePath('/portal')

  return { status: 'amended', reference: result.booking.reference }
}
