'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { scheduleBookingCreatedEmail } from '@/app/schedule-booking-email'
import { clientIpFrom, hashPhoneKey, hashPublicKey } from '@/lib/auth/access-token'
import { createPublicStayBooking, notePublicAttempt } from '@/lib/db/public-bookings'
import { getPropertyConfig } from '@/lib/db/property-config'
import { isStayDate } from '@/lib/domain/dates'
import {
  isLikelyEmailAddress,
  MAX_GUEST_EMAIL_LENGTH,
  PUBLIC_LIMITS,
  HOUR_IN_SECONDS,
  DAY_IN_SECONDS,
} from '@/lib/domain/public-booking'
import { priceStay } from '@/lib/domain/pricing/stay'
import {
  hasVehicleAnswer,
  normaliseVehicleRegistrations,
  MAX_VEHICLES_PER_BOOKING,
  MAX_VEHICLE_REGISTRATION_LENGTH,
} from '@/lib/domain/vehicle'

/**
 * Booking a short stay from the public site (capability A4).
 *
 * ── This action does not call requirePermission, and that is the point ─────
 *
 * Every other mutation in the product opens with one (architecture.md §4).
 * There is no session here and no permission to check: the caller is a
 * customer. What stands in its place is four things, and they are all in this
 * file so the whole gate is readable at once:
 *
 *   1. **Zod at the boundary**, as everywhere else. `FormData` is untyped and
 *      this submitter is a stranger rather than a signed-in colleague.
 *   2. **A honeypot**, refused silently. A script that fills every field gets
 *      the same "thanks" a customer does, because telling it which check it
 *      failed is telling it what to change.
 *   3. **Rate limits**, per address and per phone number.
 *   4. **The price re-derived on the server.** Nothing submitted is trusted:
 *      not the total, not the deposit, not the nights.
 *
 * The one control that actually protects inventory is not here at all — it is
 * the cap on unpaid bookings per phone, inside the write transaction, where a
 * caller cannot go around it.
 */

const stayDate = z.string().refine(isStayDate, 'Choose your dates.')

const publicStaySchema = z.object({
  unitTypeSlug: z.string().min(1, 'Choose a unit.'),
  checkIn: stayDate,
  checkOut: stayDate,
  chargeableGuests: z.coerce.number().int().min(1, 'A booking needs at least one guest.').max(50),
  exemptGuests: z.coerce.number().int().min(0).max(50),
  sofaBeds: z.coerce.number().int().min(0).max(20),
  lateCheckOutHours: z.coerce.number().int().min(0).max(12),
  guestName: z.string().trim().min(1, 'Tell us your name.').max(120),
  guestPhone: z.string().trim().min(5, 'We need a number to confirm your booking.').max(40),
  guestEmail: z
    .string()
    .trim()
    .max(MAX_GUEST_EMAIL_LENGTH)
    .refine((value) => value === '' || isLikelyEmailAddress(value), 'Check the email address.')
    .default(''),
  vehicles: z.array(z.string().max(MAX_VEHICLE_REGISTRATION_LENGTH)).max(MAX_VEHICLES_PER_BOOKING),
  noVehicle: z.enum(['true', 'false']).default('false'),
  /** The honeypot. A person never sees it, so anything in it is a robot. */
  website: z.string().default(''),
})

export interface PublicStayState {
  status: 'idle' | 'error'
  message?: string
  fieldErrors?: Record<string, string>
  /** Echoed back, because React resets an uncontrolled field on submit. */
  submitted?: Record<string, string>
}

export async function createPublicStayAction(
  _previous: PublicStayState,
  formData: FormData,
): Promise<PublicStayState> {
  const parsed = publicStaySchema.safeParse({
    ...Object.fromEntries(formData),
    vehicles: formData.getAll('vehicles').map(String),
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
  const submitted = {
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    guestEmail: input.guestEmail,
    vehicles: input.vehicles[0] ?? '',
  }

  // Silently, and deliberately: a bot told which check it failed is a bot that
  // fixes it. A customer can never reach this branch.
  if (input.website.trim() !== '') {
    return { status: 'error', message: 'Something went wrong. Please try again.', submitted }
  }

  const refusal = await checkPublicLimits(input.guestPhone)

  if (refusal) {
    return { status: 'error', message: refusal, submitted }
  }

  const vehicles = normaliseVehicleRegistrations(input.vehicles)
  const noVehicle = input.noVehicle === 'true'

  if (!hasVehicleAnswer(vehicles, noVehicle)) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: {
        vehicles: 'Enter your car registration, or tick that you are not bringing one.',
      },
      submitted,
    }
  }

  // The price the customer is charged is the one the server derives from what
  // they chose — never a figure a browser sent. The same call the island made
  // for the live quote, so the two agree unless somebody tampered.
  const config = await getPropertyConfig()
  const quote = priceStay(
    {
      unitTypeId: input.unitTypeSlug,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      party: { chargeableGuests: input.chargeableGuests, exemptGuests: input.exemptGuests },
      sofaBeds: input.sofaBeds,
      earlyCheckInHours: 0,
      lateCheckOutHours: input.lateCheckOutHours,
    },
    config,
  )

  if (!quote.ok) {
    return { status: 'error', message: quote.error.message, submitted }
  }

  const created = await createPublicStayBooking({
    unitTypeSlug: input.unitTypeSlug,
    range: { start: input.checkIn, end: input.checkOut },
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    guestEmail: input.guestEmail === '' ? null : input.guestEmail,
    vehicles,
    noVehicle,
    chargeableGuests: input.chargeableGuests,
    exemptGuests: input.exemptGuests,
    total: quote.total,
    securityDeposit: quote.securityDeposit,
    lines: quote.lines,
  })

  if (!created.ok) {
    return { status: 'error', message: created.error.message, submitted }
  }

  // The desk should see the held unit at once — on the calendar, in the
  // register, and on the dashboard's tiles.
  revalidatePath('/portal/bookings')
  revalidatePath('/portal/bookings/calendar')
  revalidatePath('/portal')

  // Registered before the redirect below, which throws: `after()` runs its
  // callback once the response is finished, and a redirect is a response.
  scheduleBookingCreatedEmail(created.data.bookingId)

  // Cast for the reason the login redirect is: `typedRoutes` narrows the
  // argument to a literal route, and this one is only known at run time.
  // The token has already been through `isAccessToken` on the way out of the
  // database, so what is interpolated is 22 characters of base64url.
  redirect(`/booking/${created.data.accessToken}` as Route)
}

/**
 * The two counters, and the sentence a refused customer sees.
 *
 * Deliberately vague — "please call us" rather than "you have made five
 * bookings today" — because the limits are a defence and naming them tells
 * somebody exactly how to stay under them. The number to ring is the one thing
 * a genuinely stuck customer needs.
 */
async function checkPublicLimits(phone: string): Promise<string | null> {
  const requestHeaders = await headers()
  const ip = clientIpFrom(requestHeaders)

  if (ip) {
    const allowed = await notePublicAttempt({
      kind: 'booking:ip',
      keyHash: hashPublicKey(ip),
      windowSeconds: HOUR_IN_SECONDS,
      limit: PUBLIC_LIMITS.bookingsPerIpPerHour,
    })

    if (!allowed) {
      return 'That is a lot of bookings in a short time. Please wait a little, or call us and we will book you in.'
    }
  }

  const allowedForPhone = await notePublicAttempt({
    kind: 'booking:phone',
    keyHash: hashPhoneKey(phone),
    windowSeconds: DAY_IN_SECONDS,
    limit: PUBLIC_LIMITS.bookingsPerPhonePerDay,
  })

  if (!allowedForPhone) {
    return 'That is a lot of bookings against this number today. Please call us and we will book you in.'
  }

  return null
}
