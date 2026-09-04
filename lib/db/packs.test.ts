import { describe, expect, test } from 'vitest'

import { addDays, todayInBrunei } from '@/lib/domain/dates'
import { sniffMimeType } from '@/lib/domain/document'
import { dataClient } from '@/lib/supabase/data'

import {
  attachDocument,
  listDocumentsForBooking,
  readDocumentBytes,
  removeDocument,
  runRetention,
} from './documents'
import { assembleAccountingPack, listBookingsDueAccountingPack, runPackAssembly } from './packs'
import { verifyPayment } from './payments'
import { currentPropertyId } from './property'
import { auditEventsFor } from './test/inspect'
import { TEST_PDF, givenDocument, givenTransferBooking } from './test/factory'

/**
 * Packs against the real stack (capability G5).
 *
 * What these prove is the part that cannot be proved in memory: that a pack is
 * a document like any other — really uploaded, really recorded, really
 * superseded in the same transaction as its replacement — and that the
 * due-list reads the watermark rather than the upload time. The content of
 * the pages is lib/domain/pack.test.ts's business.
 */

const TOMORROW = addDays(todayInBrunei(), 1)
const NEXT_WEEK = addDays(todayInBrunei(), 8)
const ONE_HOUR_MS = 60 * 60 * 1000

interface PackRow {
  id: string
  deleted_reason: string | null
  purged_at: string | null
  assembled_from: string | null
  storage_key: string
}

/** Every pack ever written for a booking, tombstones included, oldest first. */
async function packRowsFor(bookingId: string): Promise<PackRow[]> {
  const { data, error } = await dataClient()
    .from('document')
    .select('id, deleted_reason, purged_at, assembled_from, storage_key')
    .eq('booking_id', bookingId)
    .eq('kind', 'accounting_pack')
    .order('uploaded_at')

  if (error) {
    throw new Error(error.message)
  }

  return data as unknown as PackRow[]
}

async function packObjectExists(storageKey: string): Promise<boolean> {
  const propertyId = await currentPropertyId()
  const { data } = await dataClient().storage.from('packs').list(propertyId, { limit: 1000 })

  return (data ?? []).some((object) => `${propertyId}/${object.name}` === storageKey)
}

async function givenSettledBooking(unitRef = '3B-01') {
  const { booking, payment } = await givenTransferBooking({
    unitRef,
    checkIn: TOMORROW,
    checkOut: NEXT_WEEK,
  })
  const verified = await verifyPayment({
    paymentId: payment.id,
    observedAmount: payment.due,
    match: 'reference',
    actorId: null,
  })

  if (!verified.ok) {
    throw new Error(`Test setup could not verify the payment: ${verified.error.message}`)
  }

  return { booking, payment }
}

/* ── Assembling ───────────────────────────────────────────────────────────── */

describe('assembling a pack', () => {
  test('a settled booking gets one live pack in the packs bucket, with its watermark', async () => {
    const { booking } = await givenSettledBooking()

    const result = await assembleAccountingPack({ bookingId: booking.id })

    expect(result.ok).toBe(true)

    const packs = await listDocumentsForBooking(booking.id, 'accounting_pack')

    expect(packs).toHaveLength(1)
    expect(packs[0]).toMatchObject({
      kind: 'accounting_pack',
      filename: `${booking.reference}-accounting-pack.pdf`,
      mimeType: 'application/pdf',
      uploadedBy: null,
    })

    const bytes = await readDocumentBytes(packs[0]!.id)

    expect(bytes && sniffMimeType(bytes)).toBe('application/pdf')

    const [row] = await packRowsFor(booking.id)

    expect(row!.assembled_from).not.toBeNull()
    expect(await packObjectExists(row!.storage_key)).toBe(true)
  })

  test('a booking with only a promised transfer is refused — there is nothing to record', async () => {
    const { booking } = await givenTransferBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })

    const result = await assembleAccountingPack({ bookingId: booking.id })

    expect(result).toMatchObject({ ok: false, reason: 'no_verified_payment' })
    expect(await packRowsFor(booking.id)).toHaveLength(0)
  })

  test('a slip on file is copied in, and its bytes are read without a viewed event', async () => {
    const { booking, payment } = await givenSettledBooking()
    const slipId = await givenDocument({
      kind: 'payment_slip',
      bookingId: booking.id,
      paymentId: payment.id,
      bytes: TEST_PDF,
      filename: 'slip.pdf',
    })

    const result = await assembleAccountingPack({ bookingId: booking.id })

    expect(result.ok).toBe(true)

    const slipEvents = await auditEventsFor(slipId)

    expect(slipEvents.map((event) => event.action)).toEqual(['document.attached'])
  })
})

/* ── Superseding ──────────────────────────────────────────────────────────── */

describe('rebuilding a pack', () => {
  test('the newer pack tombstones the older as superseded, and its object goes', async () => {
    const { booking } = await givenSettledBooking()

    await assembleAccountingPack({ bookingId: booking.id })
    const rebuilt = await assembleAccountingPack({ bookingId: booking.id })

    expect(rebuilt).toMatchObject({ ok: true, supersededCount: 1 })

    const [older, newer] = await packRowsFor(booking.id)

    expect(older).toMatchObject({ deleted_reason: 'superseded' })
    expect(older!.purged_at).not.toBeNull()
    expect(await packObjectExists(older!.storage_key)).toBe(false)
    expect(newer).toMatchObject({ deleted_reason: null, purged_at: null })
    expect(await packObjectExists(newer!.storage_key)).toBe(true)

    // Only ever one live pack.
    expect(await listDocumentsForBooking(booking.id, 'accounting_pack')).toHaveLength(1)

    // The trail names the document and what replaced it.
    const events = await auditEventsFor(older!.id)

    expect(events.map((event) => event.action)).toEqual([
      'document.attached',
      'document.superseded',
    ])
    expect(events[1]!.before).toMatchObject({ kind: 'accounting_pack' })
    expect(events[1]!.after).toMatchObject({
      deleted_reason: 'superseded',
      superseded_by: newer!.id,
    })
    expect(events[1]!.actorId).toBeNull()
  })

  test('an older snapshot arriving after a newer one is refused and leaves no object', async () => {
    const { booking } = await givenSettledBooking()
    const propertyId = await currentPropertyId()

    await assembleAccountingPack({ bookingId: booking.id })

    const stale = await attachDocument({
      kind: 'accounting_pack',
      bookingId: booking.id,
      bytes: TEST_PDF,
      filename: 'stale.pdf',
      actorId: null,
      assembledFrom: new Date(Date.now() - ONE_HOUR_MS).toISOString(),
    })

    expect(stale).toMatchObject({ ok: false, error: { code: 'superseded_by_newer' } })
    expect(await packRowsFor(booking.id)).toHaveLength(1)

    const { data } = await dataClient().storage.from('packs').list(propertyId, { limit: 1000 })

    expect(data).toHaveLength(1)
  })

  test('a pack without a watermark, and a slip with one, are both refused', async () => {
    const { booking, payment } = await givenSettledBooking()

    const unstamped = await attachDocument({
      kind: 'accounting_pack',
      bookingId: booking.id,
      bytes: TEST_PDF,
      filename: 'pack.pdf',
      actorId: null,
    })
    const stamped = await attachDocument({
      kind: 'payment_slip',
      bookingId: booking.id,
      paymentId: payment.id,
      bytes: TEST_PDF,
      filename: 'slip.pdf',
      actorId: null,
      assembledFrom: new Date().toISOString(),
    })

    expect(unstamped).toMatchObject({ ok: false, error: { code: 'assembled_from_required' } })
    expect(stamped).toMatchObject({ ok: false, error: { code: 'assembled_from_not_allowed' } })
  })
})

/* ── The due-list ─────────────────────────────────────────────────────────── */

describe('which bookings are due a pack', () => {
  test('a settled booking is due until it has a pack, and not after', async () => {
    const { booking } = await givenSettledBooking()

    expect(await listBookingsDueAccountingPack()).toContain(booking.id)

    await assembleAccountingPack({ bookingId: booking.id })

    expect(await listBookingsDueAccountingPack()).not.toContain(booking.id)
  })

  test('a booking with only a pending transfer is never due', async () => {
    const { booking } = await givenTransferBooking({ checkIn: TOMORROW, checkOut: NEXT_WEEK })

    expect(await listBookingsDueAccountingPack()).not.toContain(booking.id)
  })

  test('attaching a slip after the pack makes it due again', async () => {
    const { booking, payment } = await givenSettledBooking()

    await assembleAccountingPack({ bookingId: booking.id })
    await givenDocument({ kind: 'payment_slip', bookingId: booking.id, paymentId: payment.id })

    expect(await listBookingsDueAccountingPack()).toContain(booking.id)
  })

  test('removing an identity document by hand makes it due again', async () => {
    const { booking } = await givenSettledBooking()
    const identityId = await givenDocument({ kind: 'identity', bookingId: booking.id })

    await assembleAccountingPack({ bookingId: booking.id })

    expect(await listBookingsDueAccountingPack()).not.toContain(booking.id)

    await removeDocument({ documentId: identityId, actorId: null })

    expect(await listBookingsDueAccountingPack()).toContain(booking.id)
  })

  test('an identity document expiring on its retention clock does NOT make it due', async () => {
    const { booking } = await givenSettledBooking()

    await givenDocument({ kind: 'identity', bookingId: booking.id })
    await assembleAccountingPack({ bookingId: booking.id })

    // Two years on: the IC (twelve months after checkout) has gone; the pack
    // (seven years) has not. The pack stated what was on file when it was
    // built, and a scheduled deletion elsewhere does not change what was true.
    const twoYearsOn = new Date(Date.now() + 2 * 366 * 24 * ONE_HOUR_MS)
    const run = await runRetention({ now: twoYearsOn })

    expect(run.expired).toBeGreaterThanOrEqual(1)
    expect(await listDocumentsForBooking(booking.id, 'identity')).toHaveLength(0)
    expect(await listDocumentsForBooking(booking.id, 'accounting_pack')).toHaveLength(1)
    expect(await listBookingsDueAccountingPack()).not.toContain(booking.id)
  })

  test('the nightly run assembles what is due and reports counts', async () => {
    const first = await givenSettledBooking('3B-01')
    const second = await givenSettledBooking('3B-02')

    const run = await runPackAssembly()

    expect(run.assembled).toBeGreaterThanOrEqual(2)
    expect(run.failed).toBe(0)
    expect(await listDocumentsForBooking(first.booking.id, 'accounting_pack')).toHaveLength(1)
    expect(await listDocumentsForBooking(second.booking.id, 'accounting_pack')).toHaveLength(1)

    const again = await runPackAssembly()

    expect(again.assembled).toBe(0)
  })
})
