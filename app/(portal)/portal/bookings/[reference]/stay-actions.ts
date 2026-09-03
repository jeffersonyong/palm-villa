'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getBookingById, transitionBooking } from '@/lib/db/bookings'
import { checkInBooking } from '@/lib/db/deposits'
import type { Cents } from '@/lib/domain/money'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/domain/payment'

/**
 * Arriving and leaving — the two moments the deposit hangs off.
 *
 * `check_in` and `check_out` have been in the state machine since the first
 * slice and were reachable only from a test. They become actions here because
 * the deposit slice needs them: prd.md §11 [C] collects the deposit on arrival
 * and inspects the unit after departure, and neither has a moment to happen at
 * until a booking can actually move.
 *
 * ── Why `booking.amend` gates both, and what that assumes ─────────────────
 *
 * **[A]**, recorded in prd.md §4 and added to open-questions.md N11, which
 * already asks the client who may check a guest in. There is no `check_in`
 * permission in the PRD's canonical set — the seed refuses to mint one
 * (supabase/seed.sql), on the same reasoning that kept `payment.record_cash`
 * from being split — so this borrows the permission that already means "may
 * move this booking on". The consequence is stated rather than hidden:
 * **Security cannot check a guest in**, which is what D3 will need and what
 * N11 has to answer before the arrivals screen is built.
 *
 * Front Office and Admin hold it, which is the desk, and the desk is where an
 * arriving guest is standing.
 *
 * ── What is a transaction and what is not ─────────────────────────────────
 *
 * Check-in moves the booking and records the deposit **in one transaction**
 * (`check_in_booking()`), because a guest checked in with no deposit written
 * down is exactly the gap in the spreadsheet this product replaces.
 *
 * Check-out moves the booking and nothing else, so it is an ordinary
 * transition. The deposit stays held: what releases it is an inspection and an
 * approval, days later and by other people (prd.md §11).
 */

export interface StayActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Record<string, string>
  /**
   * What was taken at check-in, so the toast can say the true thing — "BND
   * 100.00 held" against a booking that quoted a deposit, and nothing at all
   * against one that did not.
   */
  collected?: { amount: Cents; method: PaymentMethod } | null
}

const checkInSchema = z.object({
  bookingId: z.string().uuid(),
  method: z.string().refine(isPaymentMethod, 'Choose how the deposit was taken.'),
})

const checkOutSchema = z.object({
  bookingId: z.string().uuid(),
})

function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value)
}

export async function checkInAction(
  _previous: StayActionState,
  formData: FormData,
): Promise<StayActionState> {
  // architecture.md §4: every mutation passes the permission check first.
  const actor = await requirePermission('booking.amend')

  const parsed = checkInSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  }

  const { bookingId, method } = parsed.data

  // Read before the write, so a booking that has already gone is reported as
  // that rather than as a failed transition — and so the revalidation below
  // has a reference and a unit to name.
  const booking = await getBookingById(bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  const result = await checkInBooking({ bookingId, method, actorId: actor.userId })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidateStayScreens(booking.reference, booking.stay?.unitRef ?? null)

  return {
    status: 'done',
    collected: result.depositId ? { amount: result.amount, method } : null,
  }
}

export async function checkOutAction(
  _previous: StayActionState,
  formData: FormData,
): Promise<StayActionState> {
  const actor = await requirePermission('booking.amend')

  const parsed = checkOutSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return { status: 'error', message: 'Check the highlighted fields.' }
  }

  const booking = await getBookingById(parsed.data.bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  // An ordinary transition — no new write path was needed, because nothing
  // else moves when a guest leaves.
  const result = await transitionBooking(booking.id, 'check_out', actor.userId)

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidateStayScreens(booking.reference, booking.stay?.unitRef ?? null)

  return { status: 'done' }
}

/**
 * Everything that shows a booking's state, a unit's state, or a deposit.
 *
 * Longer than the other revalidation lists in this feature because checking in
 * is the one act that touches all three registers at once: the booking moves,
 * the unit becomes occupied, and a deposit appears in the ledger.
 */
function revalidateStayScreens(reference: string, unitRef: string | null): void {
  revalidatePath('/portal/bookings')
  revalidatePath(`/portal/bookings/${reference}`)
  revalidatePath('/portal/deposits')
  revalidatePath(`/portal/deposits/${reference}`)
  revalidatePath('/portal/units')

  if (unitRef) {
    revalidatePath(`/portal/units/${unitRef}`)
  }

  revalidatePath('/portal')
}

/** The first message per field, which is all a form can show at once. */
function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {}

  for (const issue of error.issues) {
    const field = issue.path[0]

    if (typeof field === 'string' && !fieldErrors[field]) {
      fieldErrors[field] = issue.message
    }
  }

  return fieldErrors
}
