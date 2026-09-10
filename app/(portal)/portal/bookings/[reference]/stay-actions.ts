'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import { getBookingById, transitionBooking } from '@/lib/db/bookings'
import { checkInBooking } from '@/lib/db/deposits'
import type { Cents } from '@/lib/domain/money'

/**
 * Arriving and leaving.
 *
 * `check_in` and `check_out` have been in the state machine since the first
 * slice and were reachable only from a test. They became actions with the
 * deposit slice, because the unit is inspected after departure and neither
 * moment had anywhere to happen until a booking could actually move.
 *
 * ── Neither collects money ────────────────────────────────────────────────
 *
 * The security deposit is taken when the booking is made — at the counter,
 * or by the transfer a customer promises online — because it is what secures
 * the booking (prd.md §9.1, capability B16). Check-in used to be the place it
 * was collected, and that was the spreadsheet's habit carried over: a guest
 * without the deposit in did not really have a booking. So check-in now takes
 * nothing, and `check_in_booking()` refuses a booking whose quoted deposit is
 * not in the safe. The dialog says so before the click (stay-buttons.tsx) and
 * this reports the refusal after it, in the same words, for the clerk who
 * opened the dialog a second before a colleague verified the transfer.
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
 * Check-out moves the booking and nothing else, so it is an ordinary
 * transition. The deposit stays held: what releases it is an inspection and an
 * approval, days later and by other people (prd.md §11).
 */

export interface StayActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  /**
   * What is held against the stay the guest just walked into, so the toast
   * can say the true thing — "BND 100.00 held" — and nothing at all against a
   * booking that quoted none.
   */
  held?: { amount: Cents } | null
}

const stayActionSchema = z.object({
  bookingId: z.string().uuid(),
})

export async function checkInAction(
  _previous: StayActionState,
  formData: FormData,
): Promise<StayActionState> {
  // architecture.md §4: every mutation passes the permission check first.
  const actor = await requirePermission('booking.amend')

  const parsed = stayActionSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return { status: 'error', message: 'This booking could not be checked in. Reload the screen.' }
  }

  const { bookingId } = parsed.data

  // Read before the write, so a booking that has already gone is reported as
  // that rather than as a failed transition — and so the revalidation below
  // has a reference and a unit to name.
  const booking = await getBookingById(bookingId)

  if (!booking) {
    return { status: 'error', message: 'That booking no longer exists.' }
  }

  const result = await checkInBooking({ bookingId, actorId: actor.userId })

  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidateStayScreens(booking.reference, booking.stay?.unitRef ?? null)

  return {
    status: 'done',
    held: result.depositId ? { amount: result.amount } : null,
  }
}

export async function checkOutAction(
  _previous: StayActionState,
  formData: FormData,
): Promise<StayActionState> {
  const actor = await requirePermission('booking.amend')

  const parsed = stayActionSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return { status: 'error', message: 'This booking could not be checked out. Reload the screen.' }
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
 * the unit becomes occupied, and the deposit's stage moves with the guest.
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
