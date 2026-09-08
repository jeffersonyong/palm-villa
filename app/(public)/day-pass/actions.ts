'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { clientIpFrom, hashPublicKey } from '@/lib/auth/access-token'
import { createPublicDayPassBooking, notePublicAttempt } from '@/lib/db/public-bookings'
import { getPropertyConfig } from '@/lib/db/property-config'
import { isStayDate } from '@/lib/domain/dates'
import { DAY_PASS_PARTY_MESSAGES, partyFromCounts } from '@/lib/domain/day-pass-capacity'
import { priceDayPass } from '@/lib/domain/pricing/day-pass'
import {
  DAY_IN_SECONDS,
  HOUR_IN_SECONDS,
  MAX_GUEST_EMAIL_LENGTH,
  PUBLIC_LIMITS,
} from '@/lib/domain/public-booking'
import {
  hasVehicleAnswer,
  normaliseVehicleRegistrations,
  MAX_VEHICLES_PER_BOOKING,
  MAX_VEHICLE_REGISTRATION_LENGTH,
} from '@/lib/domain/vehicle'

/**
 * Selling a day pass (capability A3).
 *
 * The sibling of `../stay/actions.ts` and gated identically — Zod, honeypot,
 * two counters, and the price re-derived on the server. What differs is the
 * shape of the party: a stay counts chargeable and exempt guests, and a pass
 * counts heads per age band, because that is what its price is built from.
 *
 * The band counts arrive as `band-<id>` fields, read out of the form rather
 * than declared in the schema — the bands are configuration (capability F3)
 * and the owner can add one on a Tuesday. A schema naming them would be a
 * second copy of the settings screen.
 */

const dayPassSchema = z.object({
  passDate: z.string().refine(isStayDate, 'Pick the day you are coming.'),
  guestName: z.string().trim().min(1, 'Tell us your name.').max(120),
  guestPhone: z.string().trim().min(5, 'We need a number to confirm your booking.').max(40),
  guestEmail: z
    .string()
    .trim()
    .max(MAX_GUEST_EMAIL_LENGTH)
    .refine((value) => value === '' || value.includes('@'), 'Check the email address.')
    .default(''),
  vehicles: z.array(z.string().max(MAX_VEHICLE_REGISTRATION_LENGTH)).max(MAX_VEHICLES_PER_BOOKING),
  noVehicle: z.enum(['true', 'false']).default('false'),
  website: z.string().default(''),
})

export interface PublicDayPassState {
  status: 'idle' | 'error'
  message?: string
  fieldErrors?: Record<string, string>
  submitted?: Record<string, string>
}

export async function createPublicDayPassAction(
  _previous: PublicDayPassState,
  formData: FormData,
): Promise<PublicDayPassState> {
  const parsed = dayPassSchema.safeParse({
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

  const config = await getPropertyConfig()

  // The bands as the settings screen has them right now, counted out of the
  // form. A band removed since the page loaded refuses here rather than
  // pricing against something that no longer exists.
  const counts: Record<string, number> = {}

  for (const band of config.dayPassAgeBands) {
    const raw = formData.get(`band-${band.id}`)
    const count = Number(raw ?? 0)

    counts[band.id] = Number.isFinite(count) ? count : 0
  }

  const party = partyFromCounts(counts, config)

  if (!party.ok) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: { party: DAY_PASS_PARTY_MESSAGES[party.error] },
      submitted,
    }
  }

  const quote = priceDayPass(party.party, config)

  if (!quote.ok) {
    return { status: 'error', message: quote.error.message, submitted }
  }

  const created = await createPublicDayPassBooking({
    date: input.passDate,
    party: party.snapshot,
    headcount: party.headcount,
    chargeableGuests: party.chargeableGuests,
    exemptGuests: party.exemptGuests,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    guestEmail: input.guestEmail === '' ? null : input.guestEmail,
    vehicles,
    noVehicle,
    total: quote.total,
    lines: quote.lines,
  })

  if (!created.ok) {
    return { status: 'error', message: created.error.message, submitted }
  }

  revalidatePath('/portal/bookings')
  revalidatePath('/portal')

  redirect(`/booking/${created.data.accessToken}` as Route)
}

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
    keyHash: hashPublicKey(phone),
    windowSeconds: DAY_IN_SECONDS,
    limit: PUBLIC_LIMITS.bookingsPerPhonePerDay,
  })

  if (!allowedForPhone) {
    return 'That is a lot of bookings against this number today. Please call us and we will book you in.'
  }

  return null
}
