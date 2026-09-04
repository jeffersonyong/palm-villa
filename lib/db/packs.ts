import { MAX_BYTES_FOR_KIND } from '@/lib/domain/document'
import { buildPackModel, embeddingFor } from '@/lib/domain/pack'
import { renderAccountingPack, type PackAttachmentBytes } from '@/lib/pdf/accounting-pack'
import { dataClient } from '@/lib/supabase/data'

import { getBookingById } from './bookings'
import { attachDocument, listDocumentsForBooking, purge, readDocumentBytes } from './documents'
import { listPaymentsForBooking } from './payments'
import { currentPropertyId } from './property'
import { listStaff } from './staff'

/**
 * Assembling accounting packs (capability G5, architecture.md §8.2).
 *
 * scope-of-capabilities.md G5 promises the pack "generated automatically per
 * booking — no more manual PDF assembly". This module is the automation: it
 * reads what a booking has become, has lib/domain/pack.ts decide what to say
 * and lib/pdf/accounting-pack.ts draw it, and files the result as a document
 * like any other — same bucket rules, same retention clock, same access log.
 *
 * ── The watermark is taken first, and that is the whole trick ─────────────
 *
 * `assembledFrom` is read off the clock BEFORE the booking is. Everything the
 * pack records is compared against that instant by the nightly due-list: a
 * slip attached while this function was still rendering has a timestamp later
 * than the watermark, so tonight the pack is rebuilt with it. Taken after the
 * render — or read off `uploaded_at`, which is later still — the same slip
 * would be older than the pack and invisible forever.
 *
 * The database refuses a pack whose watermark is older than the live one's,
 * so when a verification and the nightly job both assemble the same booking,
 * the fresher facts win whatever order their uploads landed in.
 *
 * ── Two triggers, one function ────────────────────────────────────────────
 *
 * A verified payment calls this once the response is on its way (see
 * app/(portal)/portal/schedule-accounting-pack.ts), so the pack exists within
 * seconds of the money being confirmed. The nightly job calls it for every
 * booking the due-list names, which is both the rebuild after a change and
 * the retry after a failure. Neither trigger has to be reliable on its own.
 *
 * ── What this checks and does not ─────────────────────────────────────────
 *
 * No permission: nobody is asking. A verification action has already passed
 * `requirePermission('payment.verify')` before it schedules this, and the
 * cron route is gated by its secret. The pack is attributed to nobody
 * (`actorId: null`), because nobody attached it — the history panel renders
 * that as the system, which is the truth.
 */

export type AssemblePackResult =
  | { ok: true; documentId: string; supersededCount: number }
  | { ok: false; reason: AssemblePackRefusal; message: string }

export type AssemblePackRefusal =
  'booking_missing' | 'no_verified_payment' | 'superseded_by_newer' | 'refused'

export async function assembleAccountingPack(input: {
  bookingId: string
}): Promise<AssemblePackResult> {
  // Before any read, and from the database's clock rather than this
  // function's. Every timestamp the due-list compares it against was written
  // by Postgres, and a function on one provider a few seconds ahead of a
  // database on another would stamp a pack newer than a change that landed
  // after its reads — the exact hole the watermark exists to close.
  const assembledFrom = await databaseNow()

  const booking = await getBookingById(input.bookingId)

  if (!booking) {
    return { ok: false, reason: 'booking_missing', message: 'That booking no longer exists.' }
  }

  const [payments, identityDocuments, slips, staff] = await Promise.all([
    listPaymentsForBooking(booking.id),
    listDocumentsForBooking(booking.id, 'identity'),
    listDocumentsForBooking(booking.id, 'payment_slip'),
    listStaff(),
  ])

  if (!payments.some((payment) => payment.status === 'verified')) {
    return {
      ok: false,
      reason: 'no_verified_payment',
      message: 'A pack is assembled once a payment has been verified.',
    }
  }

  const model = buildPackModel({
    booking,
    payments,
    identityDocuments,
    slips,
    actorNames: new Map(staff.map((account) => [account.id, account.displayName])),
    assembledAt: assembledFrom,
  })

  const attachments = await slipBytes(slips)
  let bytes = await renderAccountingPack(model, attachments)

  // A pack carries copies of its slips, and enough of them at the upload
  // ceiling can pass the bucket's. Rather than fail, the pack is drawn again
  // with the slips as placeholders that say where the files are.
  if (bytes.length > MAX_BYTES_FOR_KIND.accounting_pack) {
    bytes = await renderAccountingPack(model, attachments, { embedAttachments: false })
  }

  const attached = await attachDocument({
    kind: 'accounting_pack',
    bookingId: booking.id,
    bytes,
    filename: model.filename,
    actorId: null,
    assembledFrom: assembledFrom.toISOString(),
  })

  if (!attached.ok) {
    return {
      ok: false,
      reason: attached.error.code === 'superseded_by_newer' ? 'superseded_by_newer' : 'refused',
      message: attached.error.message,
    }
  }

  // Best effort: a purge that fails — or throws — leaves the row in
  // purgeTombstoned()'s queue, which the nightly job works through. The pack
  // itself is filed by now, so nothing here may turn that into a failure.
  for (const old of attached.superseded) {
    await purge(old.id, old.bucketId, old.storageKey).catch(() => false)
  }

  return { ok: true, documentId: attached.documentId, supersededCount: attached.superseded.length }
}

/** The database's `now()`, as an instant. */
async function databaseNow(): Promise<Date> {
  const { data, error } = await dataClient().rpc('database_now')

  if (error) {
    throw new Error(`Could not read the database clock: ${error.message}`)
  }

  return new Date(data as string)
}

/**
 * The bytes of every slip the renderer can copy in.
 *
 * A slip in a format pdf-lib cannot read is left out here and drawn as a
 * placeholder there, and one removed between the listing and this read is
 * left out the same way. Reading only what will be embedded keeps a WebP slip
 * from being downloaded for nothing.
 */
async function slipBytes(
  slips: readonly { id: string; mimeType: string }[],
): Promise<PackAttachmentBytes[]> {
  const embeddable = slips.filter((slip) => embeddingFor(slip.mimeType) !== null)
  const read = await Promise.all(
    embeddable.map(async (slip) => ({
      documentId: slip.id,
      bytes: await readDocumentBytes(slip.id),
    })),
  )

  return read.flatMap((entry) =>
    entry.bytes ? [{ documentId: entry.documentId, bytes: entry.bytes }] : [],
  )
}

/* ── The nightly job ──────────────────────────────────────────────────────── */

/** Bookings whose pack is missing or older than what it records, oldest first. */
export async function listBookingsDueAccountingPack(limit = 25): Promise<readonly string[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('bookings_due_accounting_pack', {
    p_property_id: propertyId,
    p_limit: limit,
  })

  if (error) {
    throw new Error(`Could not list the bookings due an accounting pack: ${error.message}`)
  }

  return (data as { booking_id: string }[]).map((row) => row.booking_id)
}

export interface PackAssemblyRun {
  /** Packs written tonight, first ones and rebuilds alike. */
  assembled: number
  /** Bookings the database declined a pack for — a newer one landed first. */
  skipped: number
  /** Bookings whose assembly threw. They are due again tomorrow. */
  failed: number
}

/**
 * Assembles every pack that is due.
 *
 * Per-booking failure-tolerant, as `runRetention` is: one slip Storage will
 * not serve, or one PDF that will not render, must not stop the rest of a
 * night's packs. The failure is counted and the booking stays on the
 * due-list, so it is tried again tomorrow. Counts only — a cron log is not an
 * access-controlled surface, and a booking reference in it names a guest.
 */
export async function runPackAssembly(options: { limit?: number } = {}): Promise<PackAssemblyRun> {
  const due = await listBookingsDueAccountingPack(options.limit ?? 25)
  const run: PackAssemblyRun = { assembled: 0, skipped: 0, failed: 0 }

  for (const bookingId of due) {
    try {
      const result = await assembleAccountingPack({ bookingId })

      if (result.ok) {
        run.assembled += 1
      } else {
        run.skipped += 1
      }
    } catch {
      run.failed += 1
    }
  }

  return run
}
