'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { createWalkInBooking } from '@/lib/db/bookings'
import { isStayDate } from '@/lib/domain/dates'
import { palmVillaConfig } from '@/lib/domain/config'
import { parseDepositWaiver, MAX_DEPOSIT_WAIVER_REASON_LENGTH } from '@/lib/domain/deposit-waiver'
import { parseDiscount, MAX_DISCOUNT_REASON_LENGTH } from '@/lib/domain/discount'
import type { PaymentMethod } from '@/lib/domain/payment'
import { priceStay } from '@/lib/domain/pricing/stay'
import {
  hasVehicleAnswer,
  normaliseVehicleRegistrations,
  MAX_VEHICLES_PER_BOOKING,
  MAX_VEHICLE_REGISTRATION_LENGTH,
} from '@/lib/domain/vehicle'

/**
 * Walk-in booking creation (prd.md §9.4, capability B2).
 *
 * The guest is present and pays on the spot, in one of the two ways the
 * property takes money (prd.md §10.1 [C]). Cash is counted at the desk and the
 * booking is confirmed outright. A bank transfer is sent from the guest's
 * phone while they stand there — payment made, but not yet payment seen — so
 * the booking lands in the verification queue and someone checks the bank
 * (§10.3). Neither is the booked-ahead, pay-on-arrival case §9.4 excludes from
 * v1: in both, the guest has actually paid.
 *
 * The one asterisk, recorded in createWalkInBooking()'s own doc block and in
 * prd.md §9.1: a transfer booking does hold its unit before the money lands,
 * and nothing expires it, because the hold duration is §18 N7 and still open.
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
  /**
   * One entry per row of the repeated field. Read with `getAll`, not
   * `Object.fromEntries`, which keeps only the last of a repeated name — a
   * family arriving in three cars would have silently become one.
   */
  vehicles: z.array(z.string().max(MAX_VEHICLE_REGISTRATION_LENGTH)).max(MAX_VEHICLES_PER_BOOKING),
  /** The deliberate exception, submitted as a value on every save. */
  noVehicle: z.enum(['true', 'false']).transform((value) => value === 'true'),
  paymentMethod: z.enum(['cash', 'bank_transfer']),
  /**
   * The discount control, always submitted — `none` when nothing is being
   * taken off. Left as loose strings here and read by `parseDiscount`, which
   * is the one place that decides what "40.00" and "15" mean and is unit
   * tested against both.
   */
  discountKind: z.string().default('none'),
  discountValue: z.string().default(''),
  discountReason: z.string().max(MAX_DISCOUNT_REASON_LENGTH).default(''),
  /**
   * The waiver control, submitted on every save as `true`/`false` — an
   * unticked box is a decision, not an absence. Read by `parseDepositWaiver`,
   * which owns the rule that a waiver has a reason. Defaulted so a form
   * rendered without the control (no `deposit.waive`) parses cleanly.
   */
  waiveDeposit: z.string().default('false'),
  depositWaiverReason: z.string().max(MAX_DEPOSIT_WAIVER_REASON_LENGTH).default(''),
})

export interface WalkInBookingState {
  status: 'idle' | 'error' | 'created'
  message?: string
  /** Field-level messages, keyed by input name. */
  fieldErrors?: Record<string, string>
  created?: {
    reference: string
    unitRef: string
    checkIn: string
    checkOut: string
    total: number
    securityDeposit: number
    /** Nothing is taken at check-in; the receipt says so rather than printing 0.00. */
    depositWaived: boolean
    /** Decides what the confirmation panel says, and which badge it wears. */
    paymentMethod: PaymentMethod
  }
}

export async function createWalkInBookingAction(
  _previous: WalkInBookingState,
  formData: FormData,
): Promise<WalkInBookingState> {
  // architecture.md §4: every mutation passes the permission check first.
  const actor = await requirePermission('booking.create')

  const parsed = walkInBookingSchema.safeParse({
    ...Object.fromEntries(formData),
    // Files are dropped rather than coerced: nothing on this form uploads one,
    // and a `File` reaching a plate field is a malformed request, not a plate.
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

  // Normalised here rather than in the browser, so a plate typed at the desk
  // and one read at the gate are the same string (prd.md §12.5). De-duplicating
  // is not cosmetic: `booking_vehicle` is unique per booking and registration,
  // and the same car entered twice would otherwise refuse the whole write.
  const vehicles = normaliseVehicleRegistrations(input.vehicles)

  // prd.md §13 [C]: name and vehicle registration are required. The database
  // refuses this combination too — this is the courtesy that turns a raised
  // exception into a message beside the field.
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

  const discount = parseDiscount({
    kind: input.discountKind,
    value: input.discountValue,
    reason: input.discountReason,
  })

  if (!discount.ok) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: { [discount.error.field]: discount.error.message },
    }
  }

  // A second gate, and the reason the permission exists (architecture.md §4).
  // The control is not rendered for a staff member without it, so a request
  // that carries one is a forged one — this throws rather than answering
  // politely, which is how every other permission failure behaves.
  if (discount.discount) {
    await requirePermission('booking.discount')
  }

  const waiver = parseDepositWaiver({
    waive: input.waiveDeposit,
    reason: input.depositWaiverReason,
  })

  if (!waiver.ok) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: { [waiver.error.field]: waiver.error.message },
    }
  }

  // The same construction as the discount above, for the same reason: this is
  // the other field on the form that decides money is not taken.
  if (waiver.reason !== null) {
    await requirePermission('deposit.waive')
  }

  // Re-priced server-side. The client island computes the same total for live
  // display, but no submitted total is ever trusted — the price charged is the
  // one the server derives from the inputs. The discount is an INPUT to that,
  // never a subtraction applied afterwards: `priceStay` emits it as a negative
  // line and the total stays the sum of the lines.
  const priced = priceStay(
    {
      unitTypeId: input.unitTypeId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      party: { chargeableGuests: input.chargeableGuests, exemptGuests: input.exemptGuests },
      sofaBeds: input.sofaBeds,
      earlyCheckInHours: input.earlyCheckInHours,
      lateCheckOutHours: input.lateCheckOutHours,
      discount: discount.discount,
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
    vehicles,
    noVehicle: input.noVehicle,
    chargeableGuests: input.chargeableGuests,
    exemptGuests: input.exemptGuests,
    lines: priced.lines,
    total: priced.total,
    // The QUOTED figure, even when waived. `create_walk_in_booking()` zeroes
    // what the booking carries and records this figure on the waiver's own
    // audit event as what was not taken.
    securityDeposit: priced.securityDeposit,
    depositWaiverReason: waiver.reason,
    discount: discount.discount,
    paymentMethod: input.paymentMethod,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  // The availability counts and the unit list are server-rendered, and
  // `useActionState` only re-renders the client island — so without this a clerk
  // taking two bookings in a row sees the pre-booking figures on the second one.
  revalidatePath('/portal/bookings/new')
  revalidatePath('/portal/bookings')
  // A transfer booking lands in the queue and on the dashboard's counter.
  revalidatePath('/portal/payments')
  revalidatePath('/portal')

  return {
    status: 'created',
    created: {
      reference: result.booking.reference,
      // A walk-in always occupies a unit, so `stay` is present — but it is
      // read defensively rather than asserted, because a blank reference on
      // the confirmation panel is what the guest is asked to quote at the bank.
      unitRef: result.booking.stay?.unitRef ?? '',
      checkIn: result.booking.stay?.range.start ?? input.checkIn,
      checkOut: result.booking.stay?.range.end ?? input.checkOut,
      total: result.booking.total,
      securityDeposit: result.booking.securityDeposit,
      depositWaived: result.booking.depositWaiverReason !== null,
      paymentMethod: input.paymentMethod,
    },
  }
}
