import { describe, expect, test } from 'vitest'

import { dataClient } from '@/lib/supabase/data'

import { EXPORT_TABLES, exportTableById, readAllRows } from './export'
import { currentPropertyId } from './property'
import {
  givenBooking,
  givenDepartedBooking,
  givenDocument,
  givenTransferBooking,
} from './test/factory'

/**
 * The whole-business export (capability F5).
 *
 * Two things carry the weight. Every table has to produce a document whose rows
 * are as wide as its headers — a CSV with a ragged row is one a spreadsheet
 * opens misaligned, silently. And the chunked read has to actually loop:
 * PostgREST truncates at `max_rows` rather than failing, so an export that
 * stopped at a thousand rows would look like a complete file.
 */

describe('EXPORT_TABLES', () => {
  test('every table produces rows as wide as its headers', async () => {
    await givenBooking({ unitRef: '3B-01', checkIn: '2026-12-01', checkOut: '2026-12-03' })
    await givenBooking({ unitRef: '3B-02', checkIn: '2026-12-04', checkOut: '2026-12-06' })

    for (const table of EXPORT_TABLES) {
      const document = await table.document()

      expect(document.headers.length, `${table.id} has no headers`).toBeGreaterThan(0)

      for (const row of document.rows) {
        expect(row.length, `${table.id} has a row of the wrong width`).toBe(document.headers.length)
      }
    }
  })

  test('every table can be counted without reading it', async () => {
    for (const table of EXPORT_TABLES) {
      expect(await table.count(), `${table.id} could not be counted`).toBeGreaterThanOrEqual(0)
    }
  })

  test('exports the bookings that exist', async () => {
    const booking = await givenBooking({
      unitRef: '3B-03',
      checkIn: '2026-12-07',
      checkOut: '2026-12-09',
    })

    const document = await exportTableById('bookings')!.document()
    const references = document.rows.map((row) => row[0])

    expect(references).toContain(booking.reference)
  })

  test('writes money as a bare number, with the currency in the header', async () => {
    await givenBooking({ unitRef: '3B-04', checkIn: '2026-12-10', checkOut: '2026-12-11' })

    const document = await exportTableById('bookings')!.document()
    const totalAt = document.headers.indexOf('Total (BND)')
    const total = document.rows[0]?.[totalAt]

    // A cell reading `BND 200.00` is text a spreadsheet cannot sum.
    expect(typeof total).toBe('number')
  })

  test('withholds an identity document’s filename and keeps a slip’s', async () => {
    const departed = await givenDepartedBooking({
      unitRef: '3B-05',
      checkIn: '2026-12-12',
      checkOut: '2026-12-14',
    })

    await givenDocument({
      kind: 'identity',
      bookingId: departed.booking.id,
      filename: 'ahmad-ic-front.png',
    })

    const transfer = await givenTransferBooking({
      unitRef: '3B-06',
      checkIn: '2026-12-15',
      checkOut: '2026-12-16',
    })

    await givenDocument({
      kind: 'payment_slip',
      bookingId: transfer.booking.id,
      paymentId: transfer.payment.id,
      filename: 'bibd-transfer.png',
    })

    const document = await exportTableById('documents')!.document()
    const kindAt = document.headers.indexOf('Kind')
    const filenameAt = document.headers.indexOf('Filename')

    const identity = document.rows.find((row) => row[kindAt] === 'identity')
    const slip = document.rows.find((row) => row[kindAt] === 'payment_slip')

    // architecture.md §8.1 counts the filename as content: it routinely carries
    // the guest's name and IC number, and a CSV is not gated the way the
    // document route is.
    expect(identity?.[filenameAt]).toBe('')
    expect(slip?.[filenameAt]).toBe('bibd-transfer.png')
  })

  test('never exports a storage key', async () => {
    const document = await exportTableById('documents')!.document()

    expect(document.headers.join(' ').toLowerCase()).not.toContain('storage')
  })

  test('states the settings as one row per figure', async () => {
    const document = await exportTableById('settings')!.document()

    expect(document.headers).toEqual(['Section', 'Setting', 'Value'])
    expect(document.rows.map((row) => row[0])).toContain('Rates')
    expect(document.rows.map((row) => row[1])).toContain('BIBD')
  })
})

describe('readAllRows', () => {
  test('reads past a page boundary rather than stopping at it', async () => {
    // The bug this guards is silent: PostgREST truncates at `max_rows` and
    // answers 200, so a partial export looks like a complete one. Proved with a
    // chunk of two rather than a thousand, which would need a thousand rows.
    const propertyId = await currentPropertyId()

    const units = await readAllRows<{ ref: string }>(
      (from, to) =>
        dataClient()
          .from('unit')
          .select('ref')
          .eq('property_id', propertyId)
          .order('ref', { ascending: true })
          .range(from, to),
      2,
    )

    expect(units).toHaveLength(48)
    expect(new Set(units.map((unit) => unit.ref)).size).toBe(48)
  })
})
