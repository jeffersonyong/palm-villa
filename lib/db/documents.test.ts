import { describe, expect, test } from 'vitest'

import { addDays, todayInBrunei } from '@/lib/domain/dates'
import { bnd } from '@/lib/domain/money'
import { line, totalOf } from '@/lib/domain/lines'
import { dataClient } from '@/lib/supabase/data'

import { amendBooking, getBookingById } from './bookings'
import {
  attachDocument,
  getDocument,
  issueDocumentUrl,
  listDocumentsForBooking,
  purgeTombstoned,
  removeDocument,
  runRetention,
  sweepOrphanObjects,
} from './documents'
import { listPaymentsForBooking } from './payments'
import { currentPropertyId } from './property'
import { auditEventsFor } from './test/inspect'
import {
  TEST_PDF,
  TEST_PNG,
  givenBooking,
  givenDocument,
  givenInspectedDeposit,
  givenTransferBooking,
} from './test/factory'

/**
 * Documents against the real stack — Postgres AND Storage.
 *
 * These cannot be mocked, and the reason is the same one lib/db/test/setup.ts
 * gives about capability G1: what most of them exist to prove is that the two
 * systems stay consistent with each other. A mock of Storage would agree with
 * a mock of Postgres by construction, which is exactly the failure being
 * guarded against.
 *
 * Four things here are load-bearing on a promise made to the client:
 * G3 (every access logged) is `document.viewed` being written before a URL is
 * signed; G4 (deleted automatically) is the retention run; G2 (private) is the
 * absence of any path to an object that does not go through a signed URL; and
 * the one-live-slip rule is B4's queue not showing two answers to one question.
 */

const TOMORROW = addDays(todayInBrunei(), 1)
const NEXT_WEEK = addDays(todayInBrunei(), 8)

/* ── Attaching ────────────────────────────────────────────────────────────── */

describe('attaching a document', () => {
  test('an identity document is stored against the booking and listed', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })

    const result = await attachDocument({
      kind: 'identity',
      bookingId: booking.id,
      bytes: TEST_PNG,
      filename: 'IC front.png',
      actorId: null,
    })

    expect(result.ok).toBe(true)

    const documents = await listDocumentsForBooking(booking.id)

    expect(documents).toHaveLength(1)
    expect(documents[0]).toMatchObject({
      kind: 'identity',
      filename: 'IC front.png',
      mimeType: 'image/png',
      expired: false,
    })
    // Read from storage.objects rather than believed from the caller.
    expect(documents[0]!.byteSize).toBe(TEST_PNG.length)
  })

  test('the object really exists, so a row can never point at nothing', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    await givenDocument({ kind: 'identity', bookingId: booking.id })

    const propertyId = await currentPropertyId()
    const listed = await dataClient().storage.from('identity-docs').list(propertyId)

    expect(listed.error).toBeNull()
    expect(listed.data).toHaveLength(1)
  })

  test('an identity document is kept for twelve months after checkout', async () => {
    // architecture.md §8. The anchor is the stay's last day, not the upload —
    // which is what makes the trigger further down necessary at all.
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    await givenDocument({ kind: 'identity', bookingId: booking.id })

    const [document] = await listDocumentsForBooking(booking.id)
    const retainUntil = new Date(document!.retainUntil)
    const checkout = new Date(`${NEXT_WEEK}T00:00:00+08:00`)
    const months =
      (retainUntil.getUTCFullYear() - checkout.getUTCFullYear()) * 12 +
      (retainUntil.getUTCMonth() - checkout.getUTCMonth())

    expect(months).toBe(12)
  })

  test('a document declared with one type and holding another is stored as what it is', async () => {
    // The case the sniffing exists for: a phone photograph renamed `.pdf`.
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })

    await givenDocument({
      kind: 'identity',
      bookingId: booking.id,
      bytes: TEST_PNG,
      filename: 'passport.pdf',
    })

    const [document] = await listDocumentsForBooking(booking.id)

    expect(document!.mimeType).toBe('image/png')
    expect(document!.filename).toBe('passport.pdf')
  })

  test('a photograph refuses a PDF, before anything reaches storage', async () => {
    const { booking, inspectionId } = await givenInspectedDeposit({
      checkIn: addDays(todayInBrunei(), -5),
      checkOut: addDays(todayInBrunei(), -1),
    })

    const result = await attachDocument({
      kind: 'inspection_photo',
      bookingId: booking.id,
      inspectionId,
      bytes: TEST_PDF,
      filename: 'report.pdf',
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'not_allowed_for_kind' } })

    const propertyId = await currentPropertyId()
    const listed = await dataClient().storage.from('inspection-photos').list(propertyId)

    expect(listed.data ?? []).toHaveLength(0)
  })
})

/* ── Slips (capability B4) ────────────────────────────────────────────────── */

describe('a slip on a payment', () => {
  test('is attached and reaches the payment the queue reads', async () => {
    const { booking, payment } = await givenTransferBooking({
      checkIn: TOMORROW,
      checkOut: NEXT_WEEK,
    })

    const documentId = await givenDocument({
      kind: 'payment_slip',
      bookingId: booking.id,
      paymentId: payment.id,
      filename: 'transfer.png',
    })

    const [read] = await listPaymentsForBooking(booking.id)

    expect(read!.slipDocumentId).toBe(documentId)
  })

  test('cannot be attached to a cash payment', async () => {
    // **[A]** A slip is a transfer's evidence; cash was counted at the desk.
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const [payment] = await listPaymentsForBooking(booking.id)

    const result = await attachDocument({
      kind: 'payment_slip',
      bookingId: booking.id,
      paymentId: payment!.id,
      bytes: TEST_PNG,
      filename: 'cash.png',
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'not_a_transfer' } })
  })

  test('cannot be attached to a payment on somebody else’s booking', async () => {
    const mine = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const theirs = await givenTransferBooking({
      unitRef: '3B-02',
      checkIn: TOMORROW,
      checkOut: NEXT_WEEK,
    })

    const result = await attachDocument({
      kind: 'payment_slip',
      bookingId: mine.id,
      paymentId: theirs.payment.id,
      bytes: TEST_PNG,
      filename: 'not-mine.png',
      actorId: null,
    })

    // Without this a slip filed under one booking would be served to anyone who
    // could view the other.
    expect(result).toMatchObject({ ok: false, error: { code: 'not_on_this_booking' } })
  })

  test('a second slip is refused', async () => {
    const { booking, payment } = await givenTransferBooking({
      checkIn: TOMORROW,
      checkOut: NEXT_WEEK,
    })

    await givenDocument({
      kind: 'payment_slip',
      bookingId: booking.id,
      paymentId: payment.id,
    })

    const second = await attachDocument({
      kind: 'payment_slip',
      bookingId: booking.id,
      paymentId: payment.id,
      bytes: TEST_PNG,
      filename: 'again.png',
      actorId: null,
    })

    expect(second).toMatchObject({ ok: false, error: { code: 'slip_already_attached' } })
  })

  test('two clerks attaching at once produce exactly one slip', async () => {
    // The lib/db/no-double-booking.test.ts shape, applied to the other place
    // this schema has a "only one of these may exist" rule. The guard runs
    // under the payment's row lock and the partial unique index refuses last;
    // this is what tells the two apart from a hope.
    const { booking, payment } = await givenTransferBooking({
      checkIn: TOMORROW,
      checkOut: NEXT_WEEK,
    })

    const attempts = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        attachDocument({
          kind: 'payment_slip',
          bookingId: booking.id,
          paymentId: payment.id,
          bytes: TEST_PNG,
          filename: `racer-${index}.png`,
          actorId: null,
        }).catch((error: unknown) => ({
          ok: false as const,
          error: { code: 'threw', message: String(error) },
        })),
      ),
    )

    expect(attempts.filter((attempt) => attempt.ok)).toHaveLength(1)

    const slips = await listDocumentsForBooking(booking.id, 'payment_slip')

    expect(slips).toHaveLength(1)
  })

  test('a removed slip clears the payment, so a corrected one can be attached', async () => {
    const { booking, payment } = await givenTransferBooking({
      checkIn: TOMORROW,
      checkOut: NEXT_WEEK,
    })

    const first = await givenDocument({
      kind: 'payment_slip',
      bookingId: booking.id,
      paymentId: payment.id,
    })

    expect(await removeDocument({ documentId: first, actorId: null })).toMatchObject({ ok: true })

    const cleared = await listPaymentsForBooking(booking.id)

    expect(cleared[0]!.slipDocumentId).toBeNull()

    const second = await attachDocument({
      kind: 'payment_slip',
      bookingId: booking.id,
      paymentId: payment.id,
      bytes: TEST_PNG,
      filename: 'corrected.png',
      actorId: null,
    })

    expect(second.ok).toBe(true)
  })
})

/* ── Photographs (capability C2) ──────────────────────────────────────────── */

describe('a photograph on an inspection', () => {
  test('is attached to the inspection and listed against the booking', async () => {
    const { booking, inspectionId } = await givenInspectedDeposit(
      { checkIn: addDays(todayInBrunei(), -5), checkOut: addDays(todayInBrunei(), -1) },
      { outcome: 'issues_found', notes: 'Shower door cracked' },
    )

    await givenDocument({
      kind: 'inspection_photo',
      bookingId: booking.id,
      inspectionId,
      filename: 'door.png',
    })
    await givenDocument({
      kind: 'inspection_photo',
      bookingId: booking.id,
      inspectionId,
      filename: 'floor.png',
    })

    const photos = await listDocumentsForBooking(booking.id, 'inspection_photo')

    // Several, unlike a slip: prd.md §11 asks for photographs, plural.
    expect(photos).toHaveLength(2)
    expect(photos.map((photo) => photo.inspectionId)).toEqual([inspectionId, inspectionId])
  })

  test('cannot be attached to an inspection of another stay', async () => {
    const mine = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const theirs = await givenInspectedDeposit({
      unitRef: '3B-02',
      checkIn: addDays(todayInBrunei(), -5),
      checkOut: addDays(todayInBrunei(), -1),
    })

    const result = await attachDocument({
      kind: 'inspection_photo',
      bookingId: mine.id,
      inspectionId: theirs.inspectionId,
      bytes: TEST_PNG,
      filename: 'wrong.png',
      actorId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'not_on_this_booking' } })
  })
})

/* ── Opening one (capability G3) ──────────────────────────────────────────── */

describe('issuing a link', () => {
  test('returns a signed URL and logs who asked for it', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const documentId = await givenDocument({ kind: 'identity', bookingId: booking.id })

    const result = await issueDocumentUrl({ documentId, actorId: null })

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.url).toContain('/storage/v1/object/sign/identity-docs/')
      expect(result.url).toContain('token=')
    }

    // G3: "Every access to an identity document is logged: who viewed which
    // document, and when."
    const events = await auditEventsFor(documentId)
    const views = events.filter((event) => event.action === 'document.viewed')

    expect(views).toHaveLength(1)
    expect(views[0]!.after).toMatchObject({ kind: 'identity', booking_id: booking.id })
  })

  test('logs a second view separately, because a view is an event and not a flag', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const documentId = await givenDocument({ kind: 'identity', bookingId: booking.id })

    await issueDocumentUrl({ documentId, actorId: null })
    await issueDocumentUrl({ documentId, actorId: null })

    const events = await auditEventsFor(documentId)

    expect(events.filter((event) => event.action === 'document.viewed')).toHaveLength(2)
  })

  test('refuses a document that has been removed', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const documentId = await givenDocument({ kind: 'identity', bookingId: booking.id })

    await removeDocument({ documentId, actorId: null })

    expect(await issueDocumentUrl({ documentId, actorId: null })).toMatchObject({
      ok: false,
      error: { code: 'removed' },
    })
  })

  test('refuses a document whose retention has run out, before the job has run', async () => {
    // The lazy half of G4. The nightly job deletes the file; this is what makes
    // the gap between falling due and being deleted invisible.
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const documentId = await givenDocument({ kind: 'identity', bookingId: booking.id })

    await expireByHand(documentId)

    expect(await issueDocumentUrl({ documentId, actorId: null })).toMatchObject({
      ok: false,
      error: { code: 'expired' },
    })

    // And nothing logs a view for a refusal: G3 records access, not attempts.
    const events = await auditEventsFor(documentId)

    expect(events.filter((event) => event.action === 'document.viewed')).toHaveLength(0)
  })

  test('an expired document is not offered by the screen either', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const documentId = await givenDocument({ kind: 'identity', bookingId: booking.id })

    await expireByHand(documentId)

    expect(await listDocumentsForBooking(booking.id)).toHaveLength(0)
  })
})

/* ── Removing ─────────────────────────────────────────────────────────────── */

describe('removing a document', () => {
  test('tombstones the row, deletes the file, and records both', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const documentId = await givenDocument({ kind: 'identity', bookingId: booking.id })
    const propertyId = await currentPropertyId()

    expect(await removeDocument({ documentId, actorId: null })).toMatchObject({ ok: true })

    // The row survives, because the audit trail points at it.
    expect(await getDocument(documentId)).not.toBeNull()
    expect(await listDocumentsForBooking(booking.id)).toHaveLength(0)

    const objects = await dataClient().storage.from('identity-docs').list(propertyId)

    expect(objects.data ?? []).toHaveLength(0)

    const events = await auditEventsFor(documentId)

    expect(events.map((event) => event.action)).toContain('document.removed')
  })

  test('refuses to remove the same document twice', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const documentId = await givenDocument({ kind: 'identity', bookingId: booking.id })

    await removeDocument({ documentId, actorId: null })

    expect(await removeDocument({ documentId, actorId: null })).toMatchObject({
      ok: false,
      error: { code: 'already_removed' },
    })
  })
})

/* ── Retention (capability G4) ────────────────────────────────────────────── */

describe('the retention run', () => {
  test('deletes what has fallen due and records that it did', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const documentId = await givenDocument({ kind: 'identity', bookingId: booking.id })
    const propertyId = await currentPropertyId()

    await expireByHand(documentId)

    const run = await runRetention()

    expect(run.expired).toBe(1)
    expect(run.purged).toBeGreaterThanOrEqual(1)
    expect(run.failed).toBe(0)

    const objects = await dataClient().storage.from('identity-docs').list(propertyId)

    expect(objects.data ?? []).toHaveLength(0)

    // The record that it existed and was destroyed is what a retention policy
    // is for, so the row and its trail stay.
    const events = await auditEventsFor(documentId)
    const expiry = events.find((event) => event.action === 'document.expired')

    expect(expiry).toBeDefined()
    // Nobody did this, and a system act with a forged actor is worse than one
    // with none.
    expect(expiry!.actorId).toBeNull()
  })

  test('leaves a document that is still within its period alone', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    await givenDocument({ kind: 'identity', bookingId: booking.id })

    const run = await runRetention()

    expect(run.expired).toBe(0)
    expect(await listDocumentsForBooking(booking.id)).toHaveLength(1)
  })

  test('picks up a removal whose file deletion never happened', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    const documentId = await givenDocument({ kind: 'identity', bookingId: booking.id })

    // The state a crash between the tombstone and the delete leaves.
    await dataClient().from('document').update({ purged_at: null }).eq('id', documentId)
    await removeDocument({ documentId, actorId: null })
    await dataClient().from('document').update({ purged_at: null }).eq('id', documentId)

    const retried = await purgeTombstoned()

    expect(retried.purged).toBe(1)
    expect(retried.failed).toBe(0)
  })

  test('sweeps up a file no row claims', async () => {
    // What an upload that succeeded and whose insert then failed leaves behind,
    // and what a deleted booking leaves when its rows cascade away.
    const propertyId = await currentPropertyId()
    const orphan = `${propertyId}/00000000-0000-0000-0000-0000000000ff.png`

    await dataClient()
      .storage.from('identity-docs')
      .upload(orphan, TEST_PNG, { contentType: 'image/png' })

    // An hour's grace, so a sweep cannot race an upload still in flight.
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000)

    expect(await sweepOrphanObjects({ now: later })).toBe(1)

    const objects = await dataClient().storage.from('identity-docs').list(propertyId)

    expect(objects.data ?? []).toHaveLength(0)
  })

  test('leaves a file younger than the grace period alone', async () => {
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    await givenDocument({ kind: 'identity', bookingId: booking.id })

    expect(await sweepOrphanObjects()).toBe(0)
    expect(await listDocumentsForBooking(booking.id)).toHaveLength(1)
  })
})

/* ── The clock follows the stay ───────────────────────────────────────────── */

describe('when a stay moves', () => {
  test('an identity document is kept twelve months past the NEW checkout', async () => {
    // Without the trigger, extending a stay leaves the IC expiring early —
    // silently, and in the direction that destroys a record before the period
    // the guest was promised.
    const booking = await givenBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })
    await givenDocument({ kind: 'identity', bookingId: booking.id })

    const before = (await listDocumentsForBooking(booking.id))[0]!.retainUntil
    const current = await getBookingById(booking.id)
    const extended = addDays(NEXT_WEEK, 3)
    const nights = 10
    const lines = [line('accommodation', `${nights} nights`, nights, bnd(200))]

    const amended = await amendBooking({
      bookingId: booking.id,
      expectedUpdatedAt: current!.updatedAt,
      unitId: current!.stay!.unitId,
      range: { start: TOMORROW, end: extended },
      guestName: current!.guestName,
      guestPhone: current!.guestPhone,
      vehicles: [...current!.vehicles],
      noVehicle: current!.noVehicle,
      chargeableGuests: current!.chargeableGuests,
      exemptGuests: current!.exemptGuests,
      lines,
      total: totalOf(lines),
      securityDeposit: current!.securityDeposit,
      discount: current!.discount,
      reason: 'Guest extended by three nights',
      actorId: null,
    })

    expect(amended.ok).toBe(true)

    const after = (await listDocumentsForBooking(booking.id))[0]!.retainUntil

    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime())

    const checkout = new Date(`${extended}T00:00:00+08:00`)
    const retainUntil = new Date(after)
    const months =
      (retainUntil.getUTCFullYear() - checkout.getUTCFullYear()) * 12 +
      (retainUntil.getUTCMonth() - checkout.getUTCMonth())

    expect(months).toBe(12)
  })

  test('a slip’s clock does not move with the stay', async () => {
    // An accounting record's seven years run from the transaction, not from
    // when the guest happened to leave.
    const { booking, payment } = await givenTransferBooking({
      checkIn: TOMORROW,
      checkOut: NEXT_WEEK,
    })
    await givenDocument({
      kind: 'payment_slip',
      bookingId: booking.id,
      paymentId: payment.id,
    })

    const before = (await listDocumentsForBooking(booking.id, 'payment_slip'))[0]!.retainUntil
    const current = await getBookingById(booking.id)
    const nights = 10
    const lines = [line('accommodation', `${nights} nights`, nights, bnd(200))]

    await amendBooking({
      bookingId: booking.id,
      expectedUpdatedAt: current!.updatedAt,
      unitId: current!.stay!.unitId,
      range: { start: TOMORROW, end: addDays(NEXT_WEEK, 3) },
      guestName: current!.guestName,
      guestPhone: current!.guestPhone,
      vehicles: [...current!.vehicles],
      noVehicle: current!.noVehicle,
      chargeableGuests: current!.chargeableGuests,
      exemptGuests: current!.exemptGuests,
      lines,
      total: totalOf(lines),
      securityDeposit: current!.securityDeposit,
      discount: current!.discount,
      reason: 'Guest extended by three nights',
      actorId: null,
    })

    const after = (await listDocumentsForBooking(booking.id, 'payment_slip'))[0]!.retainUntil

    expect(after).toBe(before)
  })
})

/**
 * Brings a document's retention date into the past.
 *
 * Written directly, which nothing in the product does — the whole point of
 * `retain_until` is that it is set once and moved only by the stay. A test
 * cannot wait twelve months, and faking the clock instead would leave the
 * database's own `now()` disagreeing with it inside `expire_due_documents`.
 */
async function expireByHand(documentId: string): Promise<void> {
  const { error } = await dataClient()
    .from('document')
    .update({ retain_until: '2020-01-01T00:00:00Z' })
    .eq('id', documentId)

  if (error) {
    throw new Error(`Test setup could not expire a document: ${error.message}`)
  }
}
