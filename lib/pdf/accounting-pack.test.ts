import { PDFDocument } from 'pdf-lib'
import { describe, expect, test } from 'vitest'

import { sniffMimeType } from '@/lib/domain/document'
import { line } from '@/lib/domain/lines'
import { bnd } from '@/lib/domain/money'
import type { PackModel } from '@/lib/domain/pack'

import { renderAccountingPack } from './accounting-pack'
import { ONE_PIXEL_JPEG, ONE_PIXEL_PNG } from './test/fixtures'

/**
 * That the renderer produces a PDF, puts each attachment on its own page, and
 * survives an attachment it cannot read. What the pages *say* is
 * lib/domain/pack.test.ts's business; this checks that whatever the model says
 * reaches paper without the library objecting.
 */

function model(overrides: Partial<PackModel> = {}): PackModel {
  return {
    reference: 'PV-4821',
    filename: 'PV-4821-accounting-pack.pdf',
    assembledAt: '8 Sept 2026, 10:15',
    cover: [
      { label: 'Booking reference', value: 'PV-4821' },
      { label: 'Guest', value: 'Ahmad bin Ali' },
      { label: 'Stay', value: 'Thu 10 – Sat 12 Sept' },
    ],
    lines: [line('accommodation', '2 nights, 3-bedroom', 2, bnd(200))],
    totals: { total: bnd(400), paid: bnd(400), outstanding: 0, state: 'settled' },
    discountNote: null,
    securityDepositNote: 'Security deposit quoted: BND 100.00.',
    payments: [
      {
        heading: 'Bank transfer — BND 400.00',
        rows: [
          { label: 'Status', value: 'Verified' },
          { label: 'Verified', value: '7 Sept 2026, 12:00 by Aisyah' },
        ],
        attachmentIndex: null,
      },
    ],
    identity: [],
    identityNote: 'Identity documents are referenced and not copied in.',
    attachments: [],
    notices: [],
    ...overrides,
  }
}

async function pagesOf(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes)

  return doc.getPageCount()
}

describe('rendering a pack', () => {
  test('produces a PDF the document layer will recognise as one', async () => {
    const bytes = await renderAccountingPack(model(), [])

    expect(sniffMimeType(bytes)).toBe('application/pdf')
    expect(await pagesOf(bytes)).toBe(1)
  })

  test('a JPEG, a PNG and a PDF slip each get a page of their own', async () => {
    const source = await PDFDocument.create()
    source.addPage().drawText('Page one of a bank receipt')
    source.addPage().drawText('Page two of a bank receipt')
    const twoPagePdf = await source.save()

    const bytes = await renderAccountingPack(
      model({
        attachments: [
          { documentId: 'jpg', title: 'Attachment 1', embedding: 'jpeg', reason: null },
          { documentId: 'png', title: 'Attachment 2', embedding: 'png', reason: null },
          { documentId: 'pdf', title: 'Attachment 3', embedding: 'pdf', reason: null },
        ],
      }),
      [
        { documentId: 'jpg', bytes: ONE_PIXEL_JPEG },
        { documentId: 'png', bytes: ONE_PIXEL_PNG },
        { documentId: 'pdf', bytes: twoPagePdf },
      ],
    )

    // The record, one page each for the two images, two for the two-page PDF.
    expect(await pagesOf(bytes)).toBe(5)
  })

  test('a blank page inside a PDF slip costs a line, not the slip', async () => {
    const source = await PDFDocument.create()
    source.addPage().drawText('Page one')
    source.addPage()
    const withBlank = await source.save()

    const bytes = await renderAccountingPack(
      model({
        attachments: [{ documentId: 'pdf', title: 'Attachment 1', embedding: 'pdf', reason: null }],
      }),
      [{ documentId: 'pdf', bytes: withBlank }],
    )

    expect(await pagesOf(bytes)).toBe(3)
  })

  test('an attachment pdf-lib cannot read becomes a placeholder page, not a failure', async () => {
    const garbage = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02])

    const bytes = await renderAccountingPack(
      model({
        attachments: [
          { documentId: 'bad', title: 'Attachment 1', embedding: 'jpeg', reason: null },
          { documentId: 'webp', title: 'Attachment 2', embedding: null, reason: 'Stored as WebP.' },
          { documentId: 'missing', title: 'Attachment 3', embedding: 'png', reason: null },
        ],
      }),
      [{ documentId: 'bad', bytes: garbage }],
    )

    expect(await pagesOf(bytes)).toBe(4)
  })

  test('a PDF slip with too many pages has the first ten copied and the rest counted', async () => {
    const source = await PDFDocument.create()

    for (let index = 0; index < 40; index += 1) {
      source.addPage().drawText(`Page ${index + 1}`)
    }

    const bytes = await renderAccountingPack(
      model({
        attachments: [{ documentId: 'pdf', title: 'Attachment 1', embedding: 'pdf', reason: null }],
      }),
      [{ documentId: 'pdf', bytes: await source.save() }],
    )

    // The record plus ten copied pages, and not forty.
    expect(await pagesOf(bytes)).toBe(11)
  })

  test('embedAttachments: false draws a placeholder for every slip', async () => {
    const bytes = await renderAccountingPack(
      model({
        attachments: [
          { documentId: 'jpg', title: 'Attachment 1', embedding: 'jpeg', reason: null },
        ],
      }),
      [{ documentId: 'jpg', bytes: ONE_PIXEL_JPEG }],
      { embedAttachments: false },
    )

    expect(await pagesOf(bytes)).toBe(2)
  })

  test('text the font cannot encode does not throw, even when the model missed it', async () => {
    const bytes = await renderAccountingPack(
      model({
        cover: [{ label: 'Guest', value: '陈伟' }],
        notices: ['Some characters could not be printed.'],
      }),
      [],
    )

    expect(sniffMimeType(bytes)).toBe('application/pdf')
  })

  test('a long record flows onto a second page rather than off the bottom', async () => {
    const payments = Array.from({ length: 12 }, (_, index) => ({
      heading: `Bank transfer ${index + 1} — BND 10.00`,
      rows: [
        { label: 'Status', value: 'Verified' },
        { label: 'Verified', value: '7 Sept 2026, 12:00 by Aisyah' },
        { label: 'Matched', value: 'By payment reference' },
        { label: 'Slip', value: 'None on file' },
      ],
      attachmentIndex: null,
    }))

    expect(await pagesOf(await renderAccountingPack(model({ payments }), []))).toBeGreaterThan(1)
  })
})
