import { describe, expect, test } from 'vitest'

import { line } from './lines'
import { bnd } from './money'
import {
  buildPackModel,
  embeddingFor,
  packFilenameFor,
  toWinAnsi,
  type BuildPackInput,
  type PackBookingFacts,
  type PackDocumentFacts,
  type PackPaymentFacts,
} from './pack'

/**
 * What the pack says, decided without a database or a PDF library.
 *
 * The promises under test are the ones a reader of the pack relies on: the
 * lines add up to the total the booking was sold at, every verified payment is
 * on the record with who confirmed it, the IC is referenced by its record and
 * never by its filename, and a name the font cannot print is flagged rather
 * than quietly mangled.
 */

const AISYAH = '11111111-1111-4111-8111-111111111111'
const STAFF = new Map([[AISYAH, 'Aisyah']])
const ASSEMBLED = new Date('2026-09-08T02:15:00Z')

function booking(overrides: Partial<PackBookingFacts> = {}): PackBookingFacts {
  return {
    reference: 'PV-4821',
    stream: 'short_stay',
    status: 'confirmed',
    guestName: 'Ahmad bin Ali',
    guestPhone: '+673 888 8888',
    vehicles: ['KB 1234', 'BC 99'],
    noVehicle: false,
    chargeableGuests: 3,
    exemptGuests: 1,
    stay: { unitRef: '3B-01', range: { start: '2026-09-10', end: '2026-09-12' } },
    lines: [
      line('accommodation', '2 nights, 3-bedroom', 2, bnd(200)),
      line('sofa_bed', 'Sofa bed', 1, bnd(30)),
    ],
    total: bnd(430),
    paid: bnd(430),
    securityDeposit: bnd(100),
    depositWaiverReason: null,
    discount: null,
    ...overrides,
  }
}

function payment(overrides: Partial<PackPaymentFacts> = {}): PackPaymentFacts {
  return {
    id: 'pay-1',
    method: 'bank_transfer',
    status: 'verified',
    amount: bnd(430),
    observedReference: 'PV-4821',
    observedSender: null,
    observedOn: null,
    matchKind: 'reference',
    amountOverrideReason: null,
    matchReason: null,
    collectedBy: null,
    collectedAt: null,
    verifiedBy: AISYAH,
    verifiedAt: '2026-09-07T04:00:00Z',
    createdAt: '2026-09-07T03:00:00Z',
    ...overrides,
  }
}

function document(overrides: Partial<PackDocumentFacts> = {}): PackDocumentFacts {
  return {
    id: 'doc-1',
    kind: 'payment_slip',
    mimeType: 'image/jpeg',
    uploadedBy: AISYAH,
    uploadedAt: '2026-09-07T03:30:00Z',
    paymentId: 'pay-1',
    ...overrides,
  }
}

function input(overrides: Partial<BuildPackInput> = {}): BuildPackInput {
  return {
    booking: booking(),
    payments: [payment()],
    identityDocuments: [],
    slips: [],
    actorNames: STAFF,
    assembledAt: ASSEMBLED,
    ...overrides,
  }
}

function byLabel(rows: readonly { label: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.label, row.value]))
}

describe('the cover', () => {
  test('names the booking, the guest, the stay and the moment it was built', () => {
    const model = buildPackModel(input())
    const cover = byLabel(model.cover)

    expect(model.reference).toBe('PV-4821')
    expect(model.filename).toBe('PV-4821-accounting-pack.pdf')
    expect(cover['Booking reference']).toBe('PV-4821')
    expect(cover['Status at assembly']).toBe('Confirmed')
    expect(cover['Type']).toBe('Short stay')
    expect(cover['Guest']).toBe('Ahmad bin Ali')
    expect(cover['Vehicles']).toBe('KB 1234 · BC 99')
    expect(cover['Unit']).toBe('3B-01')
    // An en dash, not the screens' arrow: the pack's font cannot encode one,
    // and a `?` between two dates reads as missing data.
    expect(cover['Stay']).toBe('10 – 12 Sept 2026')
    expect(cover['Party']).toBe('3, plus 1 not counted towards occupancy')
    // Brunei is UTC+8, so 02:15Z is 10:15 there.
    expect(model.assembledAt).toMatch(/10:15/)
    expect(cover['Assembled']).toBe(model.assembledAt)
  })

  test('a day pass occupies no unit and has no stay row', () => {
    const model = buildPackModel(input({ booking: booking({ stream: 'day_pass', stay: null }) }))
    const cover = byLabel(model.cover)

    expect(model.cover.map((row) => row.label)).not.toContain('Stay')
    expect(cover['Unit']).toBe('Occupies no unit')
    expect(cover['Type']).toBe('Day pass')
  })

  test('a guest without a car says so, and one nobody asked is not recorded', () => {
    const without = buildPackModel(input({ booking: booking({ vehicles: [], noVehicle: true }) }))
    const unasked = buildPackModel(input({ booking: booking({ vehicles: [], noVehicle: false }) }))

    expect(byLabel(without.cover)['Vehicles']).toBe('Arriving without a vehicle')
    expect(byLabel(unasked.cover)['Vehicles']).toBe('Not recorded')
  })
})

describe('the itemised booking', () => {
  test('carries every line and the balance the screens compute', () => {
    const model = buildPackModel(input())

    expect(model.lines).toHaveLength(2)
    expect(model.totals).toEqual({
      total: bnd(430),
      paid: bnd(430),
      outstanding: 0,
      state: 'settled',
    })
    expect(model.discountNote).toBeNull()
    expect(model.securityDepositNote).toContain('BND 100.00')
    expect(model.securityDepositNote).toContain('not part of this total')
  })

  test('an outstanding balance and a discount are both stated', () => {
    const model = buildPackModel(
      input({
        booking: booking({
          paid: bnd(200),
          discount: { kind: 'percent', value: 10, reason: 'Returning guest' },
        }),
      }),
    )

    expect(model.totals.state).toBe('outstanding')
    expect(model.totals.outstanding).toBe(bnd(230))
    expect(model.discountNote).toBe('10% — Returning guest')
  })

  test('a booking quoting no deposit says so rather than printing zero', () => {
    const model = buildPackModel(input({ booking: booking({ securityDeposit: 0 }) }))

    expect(model.securityDepositNote).toBe('No security deposit was quoted on this booking.')
  })

  test('a waived deposit is named as a decision, with its reason', () => {
    const model = buildPackModel(
      input({
        booking: booking({
          securityDeposit: 0,
          depositWaiverReason: 'Extends PV-1000 — deposit held there',
        }),
      }),
    )

    expect(model.securityDepositNote).toBe(
      'Security deposit waived at booking: Extends PV-1000 — deposit held there. Nothing was held against this stay.',
    )
  })
})

describe('the payments — the transaction confirmation', () => {
  test('a verified transfer records who confirmed it and how it was matched', () => {
    const model = buildPackModel(input())
    const [section] = model.payments
    const rows = byLabel(section!.rows)

    expect(section!.heading).toBe('Bank transfer — BND 430.00')
    expect(rows['Status']).toBe('Verified')
    expect(rows['Verified']).toMatch(/by Aisyah$/)
    expect(rows['Bank reference']).toBe('PV-4821')
    expect(rows['Matched']).toBe('By payment reference')
    expect(rows['Slip']).toBe('None on file')
    expect(rows['Amount differs']).toBeUndefined()
  })

  test('a manual match carries its reason, sender and date, and an override its reason', () => {
    const model = buildPackModel(
      input({
        payments: [
          payment({
            matchKind: 'manual',
            matchReason: 'Sender is the guest’s mother',
            observedSender: 'HJH AMINAH',
            observedOn: '2026-09-07',
            amountOverrideReason: 'Bank fee deducted',
            amount: bnd(425),
          }),
        ],
      }),
    )
    const rows = byLabel(model.payments[0]!.rows)

    expect(model.payments[0]!.heading).toBe('Bank transfer — BND 425.00')
    expect(rows['Matched']).toBe('By hand — Sender is the guest’s mother')
    expect(rows['Sender']).toBe('HJH AMINAH')
    expect(rows['Appeared on']).toMatch(/7/)
    expect(rows['Amount differs']).toBe('Bank fee deducted')
  })

  test('cash records who counted it and has no slip by nature', () => {
    const model = buildPackModel(
      input({
        payments: [
          payment({
            method: 'cash',
            matchKind: null,
            observedReference: null,
            collectedBy: AISYAH,
            collectedAt: '2026-09-07T05:00:00Z',
          }),
        ],
      }),
    )
    const rows = byLabel(model.payments[0]!.rows)

    expect(model.payments[0]!.heading).toBe('Cash — BND 430.00')
    expect(rows['Collected']).toMatch(/by Aisyah$/)
    expect(rows['Verified']).toBeUndefined()
    expect(rows['Slip']).toBe('None — cash is counted at the desk')
  })

  test('a pending transfer is listed without an amount, in the order raised', () => {
    const model = buildPackModel(
      input({
        payments: [
          payment({
            id: 'pay-2',
            status: 'pending_verification',
            amount: null,
            matchKind: null,
            observedReference: null,
            verifiedAt: null,
            verifiedBy: null,
            createdAt: '2026-09-08T01:00:00Z',
          }),
          payment(),
        ],
      }),
    )

    expect(model.payments.map((section) => section.heading)).toEqual([
      'Bank transfer — BND 430.00',
      'Bank transfer — awaiting verification',
    ])
    expect(model.payments[1]!.rows[0]).toEqual({ label: 'Status', value: 'Awaiting verification' })
  })

  test('a departed colleague is named as one, and the system as itself', () => {
    const model = buildPackModel(
      input({
        payments: [
          payment({ verifiedBy: 'nobody-known' }),
          payment({ id: 'pay-3', verifiedBy: null, createdAt: '2026-09-07T06:00:00Z' }),
        ],
      }),
    )

    expect(byLabel(model.payments[0]!.rows)['Verified']).toMatch(/by a former colleague$/)
    expect(byLabel(model.payments[1]!.rows)['Verified']).toMatch(/by the system$/)
  })
})

describe('the identity document', () => {
  test('is referenced by record, attacher and time — never by filename or image', () => {
    const model = buildPackModel(
      input({
        identityDocuments: [
          document({ id: 'ic-1', kind: 'identity', paymentId: null, uploadedBy: AISYAH }),
        ],
      }),
    )

    expect(model.identity).toHaveLength(1)
    const rows = byLabel(model.identity[0]!)

    expect(rows['Document']).toBe('Identity document')
    expect(rows['Attached']).toMatch(/by Aisyah$/)
    expect(rows['Record']).toBe('ic-1')
    // The facts carry no filename at all, so none can leak; and the IC is not
    // among the files copied in.
    expect(model.attachments.map((attachment) => attachment.documentId)).not.toContain('ic-1')
    expect(model.identityNote).toContain('twelve months')
  })

  test('none on file is an empty list, and the note still explains why', () => {
    const model = buildPackModel(input())

    expect(model.identity).toEqual([])
    expect(model.identityNote).toContain('seven years')
  })
})

describe('the attachments', () => {
  test('a slip is copied in and its payment points at it', () => {
    const model = buildPackModel(input({ slips: [document()] }))

    expect(model.attachments).toEqual([
      {
        documentId: 'doc-1',
        title: 'Attachment 1 — transfer slip for payment of BND 430.00',
        embedding: 'jpeg',
        reason: null,
      },
    ])
    expect(model.payments[0]!.attachmentIndex).toBe(0)
    expect(model.payments[0]!.rows.at(-1)).toEqual({ label: 'Slip', value: 'Attachment 1' })
  })

  test('a WebP slip is a placeholder with a reason, still on file', () => {
    const model = buildPackModel(input({ slips: [document({ mimeType: 'image/webp' })] }))

    expect(model.attachments[0]!.embedding).toBeNull()
    expect(model.attachments[0]!.reason).toMatch(/opens from the booking/)
  })

  test('embeddingFor knows exactly the three pdf-lib can take', () => {
    expect(embeddingFor('image/jpeg')).toBe('jpeg')
    expect(embeddingFor('image/png')).toBe('png')
    expect(embeddingFor('application/pdf')).toBe('pdf')
    expect(embeddingFor('image/webp')).toBeNull()
    expect(embeddingFor('image/heic')).toBeNull()
  })
})

describe('what Helvetica can print', () => {
  test('Latin text with the formatters’ dashes and quotes passes untouched', () => {
    const sample = 'Ahmad bin Ali — BND 430.00 · “paid” ‘twice’ … é ñ ü €'

    expect(toWinAnsi(sample)).toEqual({ text: sample, altered: false })
  })

  test('characters outside the encoding become ? and are flagged', () => {
    expect(toWinAnsi('陈伟 Chen')).toEqual({ text: '?? Chen', altered: true })
    expect(toWinAnsi('احمد')).toEqual({ text: '????', altered: true })
  })

  test('line breaks become spaces, because a row is one line', () => {
    expect(toWinAnsi('two\nlines\ttab')).toEqual({ text: 'two lines tab', altered: false })
  })

  test('a name the pack could not print is stated on the record', () => {
    const model = buildPackModel(input({ booking: booking({ guestName: '陈伟' }) }))

    expect(byLabel(model.cover)['Guest']).toBe('??')
    expect(model.notices).toHaveLength(1)
    expect(model.notices[0]).toMatch(/could not be printed/)
  })

  test('nothing to say when everything printed', () => {
    expect(buildPackModel(input()).notices).toEqual([])
  })

  test('every printed string goes through the printer, so a notice is never missed', () => {
    // The renderer sanitises again as a guard, but silently — so a value the
    // model forgot to run through the printer would lose characters with
    // nothing on the page saying so. This walks what the model produced.
    const model = buildPackModel(
      input({
        booking: booking({
          guestName: 'Ahmad',
          lines: [line('accommodation', '2 nights 陈', 2, bnd(200))],
        }),
        payments: [payment({ observedSender: '伟', matchKind: 'manual', matchReason: '陈' })],
        identityDocuments: [document({ kind: 'identity', paymentId: null })],
        slips: [document()],
      }),
    )

    // Nothing the model produced would be altered a second time, which is
    // what the renderer's guard pass would otherwise do in silence.
    expect(toWinAnsi(JSON.stringify(model)).altered).toBe(false)
    expect(model.notices).toHaveLength(1)
  })
})

describe('the filename', () => {
  test('leads with the reference so a folder sorts by it', () => {
    expect(packFilenameFor('PV-4821')).toBe('PV-4821-accounting-pack.pdf')
  })
})
