import { newAccessToken } from '@/lib/auth/access-token'
import type { DateRange } from '@/lib/domain/availability'
import { normalisePublicReference } from '@/lib/domain/booking-reference'
import { transition } from '@/lib/domain/booking-state'
import type { StayDate } from '@/lib/domain/dates'
import type { DayPassPartyLine } from '@/lib/domain/day-pass-capacity'
import type { BookingLine } from '@/lib/domain/lines'
import type { Cents } from '@/lib/domain/money'
import { phonesMatch } from '@/lib/domain/phone'
import type { CustomerAttachableKind } from '@/lib/domain/document'
import {
  isAccessToken,
  PUBLIC_LIMITS,
  publicStageOf,
  type TransferChoice,
} from '@/lib/domain/public-booking'
import { dataClient } from '@/lib/supabase/data'

import { getBookingById, getBookingByReference, type Booking } from './bookings'
import { getDepositByBookingId } from './deposits'
import { attachDocument, purge } from './documents'
import { listPaymentsForBooking } from './payments'
import { currentPropertyId } from './property'

/**
 * Writes a customer makes for themselves (capabilities A1–A4).
 *
 * A separate module from `./bookings.ts` on purpose, and the boundary is
 * *who is calling* rather than what is written. Everything in that file runs
 * behind `requirePermission()` with a staff member's id threaded into every
 * audit event; nothing here has an actor at all. Keeping the two apart means
 * the unauthenticated write paths are a short list somebody can read in one
 * sitting, rather than four more exports among twenty.
 *
 * Three rules hold across all of it:
 *
 *   - **No actor.** `audit_event.actor_id` has been nullable since it was
 *     created, for exactly this. A public booking's history says nobody
 *     performed it, which is true and is what `booking.created_public` reads
 *     as on screen.
 *   - **The price is the server's.** Every writer takes already-priced lines,
 *     and the action above it re-runs the pricing engine on the submitted
 *     inputs — the discipline the walk-in form set, and it matters more here
 *     because the submitter is a stranger.
 *   - **The status comes from the machine.** `transition()` decides; these
 *     functions pass what it derived. architecture.md §5.3 keeps the
 *     transition table in one place, and this is a second caller of it rather
 *     than a second copy.
 */

/** Why a public write was refused, in the customer's terms. */
export type PublicWriteErrorCode =
  | 'unit_unavailable'
  | 'capacity_exceeded'
  | 'too_many_open_bookings'
  | 'token_collision'
  | 'not_found'
  | 'already_submitted'
  | 'status_changed'
  | 'booking_closed'
  | 'nothing_to_evidence'
  | 'upload_refused'

export interface PublicWriteError {
  code: PublicWriteErrorCode
  message: string
  /** Places left on the date, when capacity was the refusal. */
  remaining?: number
}

export type PublicWriteResult<T> = { ok: true; data: T } | { ok: false; error: PublicWriteError }

export interface PublicBookingCreated {
  bookingId: string
  reference: string
  accessToken: string
  /** The unit the system assigned, for a stay. Absent for a day pass. */
  unitRef?: string
}

const MESSAGES: Readonly<Record<PublicWriteErrorCode, string>> = {
  booking_closed: 'This booking is closed, so there is nothing to add to it.',
  nothing_to_evidence:
    'There is no transfer on this booking yet. Tell us you have made it first, then send the slip.',
  upload_refused: 'That file could not be saved. Try again, or send it to us on WhatsApp.',
  unit_unavailable:
    'Those dates have just been taken. Please pick other dates, or another type of unit.',
  capacity_exceeded: 'There are not enough places left for that date.',
  too_many_open_bookings:
    'There are already several unpaid bookings against this number. Please complete or cancel one first, or call us.',
  token_collision: 'Something went wrong creating your booking. Please try again.',
  not_found: 'We could not find that booking.',
  already_submitted: 'We have already been told about this transfer.',
  status_changed: 'This booking has moved on since this page was opened. Refresh to see where.',
}

function refuse(
  code: PublicWriteErrorCode,
  remaining?: number,
): { ok: false; error: PublicWriteError } {
  return { ok: false, error: { code, message: MESSAGES[code], remaining } }
}

/**
 * Records one attempt by an anonymous caller and says whether it is allowed.
 *
 * Fails **open** when the counter itself errors, which is the deliberate
 * direction: this is a rate limit rather than an authorisation check, and a
 * database hiccup should not take the booking site down. The controls that
 * protect inventory — the open-holds cap and the exclusion constraint — are
 * inside the write transaction and cannot be skipped this way.
 *
 * **`onError` inverts that for one caller.** The email counter (capability A8)
 * is the only limit here that protects somebody other than the property: every
 * other one keys on the caller, while that one keys on the *recipient*, and
 * what it prevents is a stranger's inbox being filled with real Palm Villa
 * confirmations. Failing open there would hand the abuse back on the day the
 * database hiccups, and the cost of failing closed is one email nobody gets —
 * against the booking still being made, which is the thing that must not fail.
 */
export async function notePublicAttempt(input: {
  kind: string
  keyHash: string
  windowSeconds: number
  limit: number
  onError?: 'allow' | 'deny'
}): Promise<boolean> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('note_public_attempt', {
    p_property_id: propertyId,
    p_kind: input.kind,
    p_key_hash: input.keyHash,
    p_window_seconds: input.windowSeconds,
    p_limit: input.limit,
  })

  if (error) {
    return input.onError !== 'deny'
  }

  return data as boolean
}

export interface CreatePublicStayInput {
  unitTypeSlug: string
  range: DateRange
  guestName: string
  guestPhone: string
  guestEmail: string | null
  vehicles: readonly string[]
  noVehicle: boolean
  chargeableGuests: number
  exemptGuests: number
  total: Cents
  securityDeposit: Cents
  lines: readonly BookingLine[]
}

/**
 * Holds a unit of the requested type for a customer (capability A4).
 *
 * The unit is chosen by the database function rather than by the customer or
 * by this layer — see the migration's own note. What that buys here is that
 * there is no availability read to go stale: this call either comes back with
 * the door it got, or with `unit_unavailable` because every door of that type
 * was taken while it tried.
 */
export async function createPublicStayBooking(
  input: CreatePublicStayInput,
): Promise<PublicWriteResult<PublicBookingCreated>> {
  const propertyId = await currentPropertyId()

  // `held` is the first status this product has ever persisted. A walk-in goes
  // straight to `awaiting_payment_verification` or `confirmed` because the
  // guest has paid; a customer online has not, and the unit is held while they
  // go to their banking app (prd.md §9.3).
  const created = transition('draft', 'hold')

  if (!created.ok) {
    throw new Error(`Public hold transition rejected: ${created.error.message}`)
  }

  const accessToken = newAccessToken()

  const { data, error } = await dataClient().rpc('create_public_stay_booking', {
    p_property_id: propertyId,
    p_unit_type_slug: input.unitTypeSlug,
    p_status: created.status,
    p_check_in: input.range.start,
    p_check_out: input.range.end,
    p_guest_name: input.guestName,
    p_guest_phone: input.guestPhone,
    p_guest_email: input.guestEmail,
    p_vehicles: input.vehicles,
    p_no_vehicle: input.noVehicle,
    p_chargeable_guests: input.chargeableGuests,
    p_exempt_guests: input.exemptGuests,
    p_total_cents: input.total,
    p_security_deposit_cents: input.securityDeposit,
    p_lines: input.lines,
    p_access_token: accessToken,
    p_max_open_per_phone: PUBLIC_LIMITS.openBookingsPerPhone,
  })

  if (error) {
    throw new Error(`Could not create the booking: ${error.message}`)
  }

  const result = data as
    | { ok: true; booking_id: string; reference: string; unit_ref: string; access_token: string }
    | { ok: false; error: PublicWriteErrorCode }

  if (!result.ok) {
    return refuse(result.error)
  }

  return {
    ok: true,
    data: {
      bookingId: result.booking_id,
      reference: result.reference,
      accessToken: result.access_token,
      unitRef: result.unit_ref,
    },
  }
}

export interface CreatePublicDayPassInput {
  date: StayDate
  party: readonly DayPassPartyLine[]
  headcount: number
  chargeableGuests: number
  exemptGuests: number
  guestName: string
  guestPhone: string
  guestEmail: string | null
  vehicles: readonly string[]
  noVehicle: boolean
  total: Cents
  lines: readonly BookingLine[]
}

/**
 * Sells a day pass (capability A3) — the first writer of one anywhere.
 *
 * Held rather than confirmed, exactly like a stay: the pass is paid for by
 * transfer, and a pass issued before the money is seen is a QR code at a gate
 * with nothing behind it. What it holds is a place rather than a unit, which
 * the capacity check inside the transaction is what enforces.
 */
export async function createPublicDayPassBooking(
  input: CreatePublicDayPassInput,
): Promise<PublicWriteResult<PublicBookingCreated>> {
  const propertyId = await currentPropertyId()

  const created = transition('draft', 'hold')

  if (!created.ok) {
    throw new Error(`Public hold transition rejected: ${created.error.message}`)
  }

  const accessToken = newAccessToken()

  const { data, error } = await dataClient().rpc('create_public_day_pass_booking', {
    p_property_id: propertyId,
    p_status: created.status,
    p_pass_date: input.date,
    p_party: input.party,
    p_headcount: input.headcount,
    p_chargeable_guests: input.chargeableGuests,
    p_exempt_guests: input.exemptGuests,
    p_guest_name: input.guestName,
    p_guest_phone: input.guestPhone,
    p_guest_email: input.guestEmail,
    p_vehicles: input.vehicles,
    p_no_vehicle: input.noVehicle,
    p_total_cents: input.total,
    p_lines: input.lines,
    p_access_token: accessToken,
    p_max_open_per_phone: PUBLIC_LIMITS.openBookingsPerPhone,
  })

  if (error) {
    throw new Error(`Could not create the day pass: ${error.message}`)
  }

  const result = data as
    | { ok: true; booking_id: string; reference: string; access_token: string }
    | { ok: false; error: PublicWriteErrorCode; remaining?: number }

  if (!result.ok) {
    return refuse(result.error, result.remaining)
  }

  return {
    ok: true,
    data: {
      bookingId: result.booking_id,
      reference: result.reference,
      accessToken: result.access_token,
    },
  }
}

/**
 * One booking, by the private link.
 *
 * The token is checked for shape before it reaches a query — a malformed one
 * is a 404 rather than a round trip, and the page renders `notFound()` for
 * both, so a guesser learns nothing from the difference.
 */
export async function getBookingByAccessToken(token: string): Promise<Booking | null> {
  if (!isAccessToken(token)) {
    return null
  }

  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('booking')
    .select('id')
    .eq('property_id', propertyId)
    .eq('access_token', token)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read that booking: ${error.message}`)
  }

  if (!data) {
    return null
  }

  return getBookingById((data as { id: string }).id)
}

export interface PublicTransferSubmitted {
  reference: string
  /**
   * Which rows the queue will show. A stay secured by its deposit raises one
   * or two depending on whether the customer chose to settle the stay now —
   * both cases the client named (prd.md §9.1, N29).
   */
  raised: 'deposit' | 'payment' | 'deposit_and_payment'
  /** The whole of what the customer said they sent, in one transfer. */
  amount: Cents
}

/**
 * The customer says they have transferred (prd.md §10.3, corrected).
 *
 * This is the moment the wait in the verification queue starts, which is what
 * `payment.created_at`'s own comment predicted a slice ago: the clock measures
 * how long staff have left somebody hanging, not how long the customer spent
 * filling in a form.
 *
 * What it raises is decided in the database from the booking's own stream and
 * quote, not passed in — a caller that could choose would be a caller that
 * could ask for a BND 100 deposit against a day pass.
 */
export async function submitPublicTransfer(
  token: string,
  choice: TransferChoice = 'deposit_only',
): Promise<PublicWriteResult<PublicTransferSubmitted>> {
  const booking = await getBookingByAccessToken(token)

  if (!booking) {
    return refuse('not_found')
  }

  const next = transition(booking.status, 'submit_payment')

  if (!next.ok) {
    // Legality is the machine's answer, and it is checked here so the page can
    // say something useful. The database re-checks it under the row lock,
    // which is what settles a double-click.
    return refuse('status_changed')
  }

  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('submit_public_payment', {
    p_property_id: propertyId,
    p_access_token: token,
    p_from_status: booking.status,
    p_to_status: next.status,
    p_pay_stay_now: choice === 'everything',
  })

  if (error) {
    throw new Error(`Could not record the transfer: ${error.message}`)
  }

  const result = data as
    | {
        ok: true
        reference: string
        raised: 'deposit' | 'payment' | 'deposit_and_payment'
        amount_cents: number
      }
    | { ok: false; error: PublicWriteErrorCode }

  if (!result.ok) {
    return refuse(result.error)
  }

  return {
    ok: true,
    data: {
      reference: result.reference,
      raised: result.raised,
      amount: result.amount_cents,
    },
  }
}

export interface PublicBookingLink {
  /** The token that opens `/booking/{token}` — existing, or minted just now. */
  token: string
  /** The reference as it is stored, for the caller's own logging. */
  reference: string
}

/**
 * A customer's own booking, by the reference on their transfer and the number
 * they booked with (capability A9).
 *
 * The one read on this surface with no token behind it, and the reason the
 * screen exists: the confirmation email is switched off until N42 answers, so
 * a customer who closes the tab has no link, and a customer who booked at the
 * counter never had one.
 *
 * **Reference first, then the phone compared in TypeScript.** The phone rule
 * cannot go into SQL without becoming a second copy of `lib/domain/phone.ts`,
 * which is the argument architecture.md §5 already makes for `unit.status` and
 * the reporting reads. There is nothing to gain by pushing it down either:
 * `reference` is unique per property, so this reads exactly one row, and
 * `SUMMARY_COLUMNS` already carries both `guest_phone` and `access_token`.
 *
 * **Every refusal is the same refusal.** A malformed reference, an unknown
 * one and a wrong number all return `not_found`, and the action above renders
 * one sentence for the three — architecture.md §3's rule for the token page
 * ("a malformed token and an unknown one render the same 404 so a guesser
 * learns nothing from the difference") applied one rung out. A message naming
 * *which* half was wrong would confirm that a booking exists, which is the
 * only thing worth learning from this endpoint.
 *
 * The unknown-reference branch does return sooner than the wrong-phone one,
 * so the two differ by a string compare. That is deliberate rather than
 * overlooked: the defence against a guesser here is the counters in the action
 * and the identical message, not a constant-time compare, which would buy
 * nothing against an attacker who can already see the network.
 *
 * A **closed** booking is found like any other and gets its link. `/booking/
 * {token}` renders `CLOSED_REASONS`, and somebody looking up a booking that
 * was cancelled is exactly who needs to read why.
 */
export async function findBookingLink(input: {
  reference: string
  phone: string
}): Promise<PublicWriteResult<PublicBookingLink>> {
  const reference = normalisePublicReference(input.reference)

  if (reference === null) {
    return refuse('not_found')
  }

  const booking = await getBookingByReference(reference)

  if (!booking || !phonesMatch(input.phone, booking.guestPhone)) {
    return refuse('not_found')
  }

  if (booking.accessToken) {
    return { ok: true, data: { token: booking.accessToken, reference: booking.reference } }
  }

  return issueAccessToken(booking.id, booking.reference)
}

/**
 * Gives a booking that has no link one, and records that it happened.
 *
 * Only ever reached for a booking taken at the desk, or one created before
 * tokens existed. The SQL function is idempotent — it hands back a token
 * already on the row and writes nothing — so the race between two customers
 * looking up the same booking resolves to one token and one history row
 * rather than two of each.
 *
 * The retry is for `token_collision`, which at 128 bits means the generator
 * repeated itself. Once: a second collision is not a coincidence, and a loop
 * that keeps trying against a broken generator is a worse failure than a
 * message asking the customer to try again.
 */
async function issueAccessToken(
  bookingId: string,
  reference: string,
): Promise<PublicWriteResult<PublicBookingLink>> {
  const propertyId = await currentPropertyId()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await dataClient().rpc('issue_booking_access_token', {
      p_property_id: propertyId,
      p_booking_id: bookingId,
      p_token: newAccessToken(),
    })

    if (error) {
      throw new Error(`Could not issue a link for that booking: ${error.message}`)
    }

    const result = data as { ok: boolean; error?: PublicWriteErrorCode; access_token?: string }

    if (result.ok && result.access_token) {
      return { ok: true, data: { token: result.access_token, reference } }
    }

    if (result.error !== 'token_collision') {
      return refuse(result.error ?? 'not_found')
    }
  }

  return refuse('token_collision')
}

/* ── What a customer sends us (capabilities A6, A7) ───────────────────────── */

/**
 * A file the guest uploaded through their own booking link.
 *
 * The fourth public write and the first that stores anything. Everything about
 * *what* may be stored is already decided elsewhere and is not restated here:
 * `checkUpload` inside `attachDocument` sniffs the real header, bounds the size
 * and refuses a kind that does not match, and the bucket and the CHECK
 * constraints refuse last. What this module adds is the two questions only it
 * can answer — **whose booking is this** and **which row is the money on**.
 *
 * ── Whose booking ──────────────────────────────────────────────────────────
 *
 * The access token, re-resolved here rather than trusted from the form beyond
 * its shape. It is the whole of the credential (architecture.md §4a): 128 bits,
 * unguessable, and the same thing that lets the guest read the page they are
 * uploading from. A booking that has closed refuses — a cancelled booking is
 * not a place to file new records, and a link that outlives its booking should
 * stop doing anything.
 *
 * ── Which row ──────────────────────────────────────────────────────────────
 *
 * An identity document hangs off the booking and is done. A slip has to find
 * the money it evidences, and prd.md §10.3 is explicit that there may be two:
 *
 *   > Two rows for one transfer, and they stay two. The customer sends BND 700
 *   > once; the queue shows BND 100 against the deposit and BND 600 against the
 *   > stay, because §11 makes one a liability the property owes back and the
 *   > other revenue it has earned.
 *
 * One screenshot is therefore the evidence for both, and it is filed against
 * each: **one upload, one file chosen, one document row per money row.** The
 * alternative — filing it once and cross-referencing — would leave the
 * accounting pack of one of them missing its slip, and each row carries its own
 * seven-year clock, so they cannot share one.
 *
 * The customer is never asked which. They chose "the deposit" or "everything"
 * when they told us they had transferred, and the rows that exist are the
 * answer.
 *
 * A partial failure is reported as success where at least one row took it. The
 * queue shows the slip against whichever it reached, which is strictly better
 * than telling a guest their upload failed and having them send it again.
 */
export async function attachPublicDocument(input: {
  token: string
  kind: CustomerAttachableKind
  bytes: Uint8Array
  filename: string
}): Promise<PublicWriteResult<{ documentId: string; kind: CustomerAttachableKind }>> {
  const booking = await getBookingByAccessToken(input.token)

  if (!booking) {
    return refuse('not_found')
  }

  if (publicStageOf(booking.status) === 'closed') {
    return refuse('booking_closed')
  }

  const targets = await slipTargets(booking, input.kind)

  if (targets === null) {
    return refuse('nothing_to_evidence')
  }

  const attached: string[] = []
  let lastError: string | null = null

  for (const target of targets) {
    const result = await attachDocument({
      kind: input.kind,
      bookingId: booking.id,
      paymentId: target.paymentId,
      depositId: target.depositId,
      bytes: input.bytes,
      filename: input.filename,
      actorId: null,
      uploadedByCustomer: true,
    })

    if (result.ok) {
      attached.push(result.documentId)

      // A superseded file is the guest'''s own previous upload. Its row is
      // already tombstoned in the same transaction that wrote the new one, so
      // the file is filed either way; deleting the object is best effort, and
      // whatever fails stays in purgeTombstoned()'''s queue for the nightly job.
      for (const old of result.superseded) {
        await purge(old.id, old.bucketId, old.storageKey).catch(() => false)
      }
    } else {
      lastError = result.error.message
    }
  }

  if (attached.length === 0) {
    return {
      ok: false,
      error: { code: 'upload_refused', message: lastError ?? MESSAGES.upload_refused },
    }
  }

  return { ok: true, data: { documentId: attached[0]!, kind: input.kind } }
}

/**
 * The rows one uploaded file should be filed against.
 *
 * `null` where a slip has arrived before the transfer it evidences — the guest
 * has not pressed "I have made the transfer" yet, so no deposit and no payment
 * row exists. That is a sequence to explain rather than an error to log.
 *
 * An identity document points at neither, which is one target carrying two
 * nulls rather than a second code path.
 */
async function slipTargets(
  booking: Booking,
  kind: CustomerAttachableKind,
): Promise<readonly { paymentId: string | null; depositId: string | null }[] | null> {
  if (kind === 'identity') {
    return [{ paymentId: null, depositId: null }]
  }

  const [deposit, payments] = await Promise.all([
    getDepositByBookingId(booking.id),
    listPaymentsForBooking(booking.id),
  ])

  const targets: { paymentId: string | null; depositId: string | null }[] = []

  // A deposit paid in cash at the desk has no slip to send, and neither has a
  // cash payment — `attach_document` refuses both with `not_a_transfer`, so
  // they are filtered here rather than attempted and reported as a failure.
  if (deposit && deposit.method === 'bank_transfer') {
    targets.push({ paymentId: null, depositId: deposit.id })
  }

  for (const payment of payments) {
    if (payment.method === 'bank_transfer') {
      targets.push({ paymentId: payment.id, depositId: null })
    }
  }

  return targets.length === 0 ? null : targets
}
