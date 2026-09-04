import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

import { formatCents, type Cents } from '@/lib/domain/money'
import { toWinAnsi, type PackAttachment, type PackModel, type PackRow } from '@/lib/domain/pack'

/**
 * Draws an accounting pack (capability G5).
 *
 * The one place pdf-lib is used, and the reason the dependency exists:
 * architecture.md §8 names the pack as the document assembled "with nobody
 * standing in front of it", where a printable page would have nobody to press
 * print. What goes on the pages is decided in lib/domain/pack.ts and tested
 * there; this file only knows how to put a `PackModel` onto A4.
 *
 * ── Built-in fonts, on purpose ────────────────────────────────────────────
 *
 * Helvetica and Courier from the PDF standard set: no font file in the
 * repository, no fontkit, no second dependency. The cost is WinAnsi — the
 * standard fonts encode Latin script and nothing else — and the model has
 * already run every string through `toWinAnsi` and recorded a notice where a
 * character was lost. Every string drawn here goes through it once more, so a
 * caller that forgot cannot make `drawText` throw over a name. That second
 * pass is a guard and not the mechanism: a string only the renderer sanitises
 * loses its characters without the page saying so, because the notice is the
 * model's to add. Anything printed here should already have been through the
 * model's printer.
 *
 * ── A bad attachment never fails the pack ─────────────────────────────────
 *
 * A slip that pdf-lib cannot read — a JPEG with a header it does not know, an
 * encrypted PDF, bytes that are not what their row says — becomes a placeholder
 * page that says the file is on the booking, and the rest of the pack is
 * produced. The alternative is a booking with no accounting record because one
 * screenshot was odd, which is the manual assembly this replaces failing in a
 * new way.
 */

export interface PackAttachmentBytes {
  documentId: string
  bytes: Uint8Array
}

export interface RenderOptions {
  /**
   * False to draw every attachment as a placeholder. lib/db/packs.ts uses it
   * when a pack with its slips copied in would exceed the bucket's ceiling.
   */
  embedAttachments?: boolean
}

/* A4 in PDF points, and the measures the page is laid out in. */
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const FOOTER_HEIGHT = 28

const TITLE_SIZE = 20
const HEADING_SIZE = 12
const BODY_SIZE = 10
const SMALL_SIZE = 8.5
const LINE_HEIGHT = 14
const LABEL_WIDTH = 132

/* The itemised table's column right edges, measured from the page's left. */
const QUANTITY_EDGE = 388
const UNIT_EDGE = 468
const AMOUNT_EDGE = PAGE_WIDTH - MARGIN
const TOTALS_LABEL_X = 340

const INK = rgb(0.11, 0.11, 0.12)
const MUTE = rgb(0.45, 0.45, 0.47)
const RULE = rgb(0.84, 0.84, 0.85)

/**
 * How many pages of one PDF slip are copied in.
 *
 * A bank's receipt is a page, perhaps two. A well-formed PDF under the 4 MiB
 * upload cap can still declare thousands of pages by sharing its page tree,
 * and embedding every one would make the size of the pack — and the time the
 * nightly run spends on it — a function of a file's structure rather than its
 * bytes. Past this the rest are counted and not copied; they are on file.
 */
const MAX_SLIP_PAGES = 10

const NOT_EMBEDDED_REASON =
  'Not copied into this pack: with every slip included the pack would have exceeded its size limit. The file is on the booking.'
const UNREADABLE_REASON =
  'This file could not be read when the pack was assembled. It is on file and opens from the booking.'

export async function renderAccountingPack(
  model: PackModel,
  attachments: readonly PackAttachmentBytes[],
  options: RenderOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fonts: Fonts = {
    body: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  }
  const writer = new Writer(doc, fonts)

  doc.setTitle(`Accounting pack ${model.reference}`)
  doc.setProducer('Palm Villa')

  drawCover(writer, model)
  drawLines(writer, model)
  drawPayments(writer, model)
  drawIdentity(writer, model)
  drawNotices(writer, model)

  const bytesById = new Map(attachments.map((entry) => [entry.documentId, entry.bytes]))

  for (const attachment of model.attachments) {
    await drawAttachment(writer, attachment, bytesById.get(attachment.documentId), options)
  }

  drawFooters(doc, fonts, model)

  return doc.save()
}

/* ── Sections ─────────────────────────────────────────────────────────────── */

function drawCover(writer: Writer, model: PackModel): void {
  writer.text('Palm Villa', { size: SMALL_SIZE, color: MUTE, font: writer.fonts.bold })
  writer.gap(4)
  writer.text('Accounting record', { size: TITLE_SIZE, font: writer.fonts.bold })
  writer.gap(2)
  writer.text(model.reference, { size: HEADING_SIZE, font: writer.fonts.mono })
  writer.gap(10)
  writer.rule()
  writer.gap(8)
  writer.rows(model.cover)
}

function drawLines(writer: Writer, model: PackModel): void {
  writer.heading('Itemised booking')
  writer.tableRow(['Description', 'Qty', 'Unit', 'Amount'], {
    font: writer.fonts.bold,
    size: SMALL_SIZE,
    color: MUTE,
  })
  writer.rule()

  for (const entry of model.lines) {
    writer.tableRow(
      [
        entry.description,
        `${entry.quantity}`,
        formatCents(entry.unitPrice),
        formatCents(entry.amount),
      ],
      {},
    )
  }

  writer.rule()
  writer.gap(2)
  writer.total('Total', model.totals.total, true)
  writer.total('Paid', model.totals.paid, false)

  if (model.totals.state === 'outstanding') {
    writer.total('Outstanding', model.totals.outstanding, true)
  } else if (model.totals.state === 'overpaid') {
    writer.total('Overpaid', -model.totals.outstanding, true)
  } else {
    writer.text('Settled in full.', { size: SMALL_SIZE, color: MUTE }, TOTALS_LABEL_X)
  }

  writer.gap(6)

  if (model.discountNote) {
    writer.paragraph(`Discount: ${model.discountNote}`, { size: SMALL_SIZE, color: MUTE })
  }

  writer.paragraph(model.securityDepositNote, { size: SMALL_SIZE, color: MUTE })
}

function drawPayments(writer: Writer, model: PackModel): void {
  writer.heading('Payments')

  if (model.payments.length === 0) {
    writer.paragraph('No payment has been recorded against this booking.', {})

    return
  }

  model.payments.forEach((payment, index) => {
    if (index > 0) {
      writer.gap(8)
    }

    writer.text(payment.heading, { font: writer.fonts.bold })
    writer.gap(2)
    writer.rows(payment.rows)
  })
}

function drawIdentity(writer: Writer, model: PackModel): void {
  writer.heading('Identity document')

  if (model.identity.length === 0) {
    writer.paragraph('No identity document was on file when this pack was assembled.', {})
  }

  model.identity.forEach((rows, index) => {
    if (index > 0) {
      writer.gap(6)
    }

    writer.rows(rows)
  })

  writer.gap(6)
  writer.paragraph(model.identityNote, { size: SMALL_SIZE, color: MUTE })
}

function drawNotices(writer: Writer, model: PackModel): void {
  if (model.notices.length === 0) {
    return
  }

  writer.gap(10)
  writer.rule()
  writer.gap(6)

  for (const notice of model.notices) {
    writer.paragraph(notice, { size: SMALL_SIZE, color: MUTE })
  }
}

/* ── Attachments ──────────────────────────────────────────────────────────── */

async function drawAttachment(
  writer: Writer,
  attachment: PackAttachment,
  bytes: Uint8Array | undefined,
  options: RenderOptions,
): Promise<void> {
  writer.newPage()
  writer.text(attachment.title, { size: SMALL_SIZE, color: MUTE, font: writer.fonts.bold })
  writer.gap(6)
  writer.rule()
  writer.gap(8)

  if (options.embedAttachments === false) {
    writer.paragraph(NOT_EMBEDDED_REASON, { color: MUTE })

    return
  }

  if (attachment.embedding === null || !bytes) {
    writer.paragraph(attachment.reason ?? UNREADABLE_REASON, { color: MUTE })

    return
  }

  try {
    if (attachment.embedding === 'pdf') {
      await drawPdfPages(writer, bytes)
    } else {
      const image =
        attachment.embedding === 'jpeg'
          ? await writer.doc.embedJpg(bytes)
          : await writer.doc.embedPng(bytes)

      drawFitted(writer, image, (placement) => writer.page.drawImage(image, placement))
    }
  } catch {
    // Whatever pdf-lib objected to, the slip is still on file. Say so where
    // the copy would have been, and carry on with the rest of the pack.
    writer.paragraph(UNREADABLE_REASON, { color: MUTE })
  }
}

/**
 * Every page of a PDF slip, each scaled onto its own page under the header.
 *
 * Embedded rather than copied: `copyPages` would append the bank's pages as
 * they are, with no header saying whose payment they evidence, and a page
 * torn out of a different document reads that way. Drawing them as embedded
 * pages keeps every page of the pack in the pack's own frame.
 *
 * One page at a time, because pdf-lib refuses to embed a page with no content
 * stream — a blank trailing page, which some banks' exports carry — and one
 * such page should cost one placeholder line, not the whole slip.
 */
async function drawPdfPages(writer: Writer, bytes: Uint8Array): Promise<void> {
  const source = await PDFDocument.load(bytes)
  const indices = source.getPageIndices()
  const copied = indices.slice(0, MAX_SLIP_PAGES)
  const left = indices.length - copied.length

  for (const index of copied) {
    if (index > 0) {
      writer.newPage()
    }

    // Under the header of the last copied page, before its content, because
    // after a page-filling embed there is no room left below it.
    if (left > 0 && index === copied[copied.length - 1]) {
      writer.paragraph(
        `${left} further pages of this file were not copied in. The file is on the booking.`,
        { color: MUTE },
      )
      writer.gap(4)
    }

    // pdf-lib embeds lazily, at save — so a page it will refuse has to be
    // recognised here, and the one thing it refuses is a page with no content
    // stream. Asked up front rather than caught, because by save time there
    // is no page left to put a placeholder on.
    if (!source.getPage(index).node.Contents()) {
      writer.paragraph(`Page ${index + 1} of this file is blank.`, { color: MUTE })
      continue
    }

    const [page] = await writer.doc.embedPdf(source, [index])

    if (page) {
      drawFitted(writer, page, (placement) => writer.page.drawPage(page, placement))
    }
  }
}

interface Placement {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Scales something with a width and a height into what is left of the page,
 * never up: a screenshot is drawn at its own size or smaller, so a small
 * image does not become a blurred large one.
 */
function drawFitted(
  writer: Writer,
  content: Pick<PDFImage, 'width' | 'height'>,
  draw: (placement: Placement) => void,
): void {
  const box = writer.remainingBox()
  const scale = Math.min(box.width / content.width, box.height / content.height, 1)
  const width = content.width * scale
  const height = content.height * scale

  draw({ x: MARGIN, y: box.top - height, width, height })
  writer.y = box.top - height
}

/* ── Footers, once the page count is known ────────────────────────────────── */

function drawFooters(doc: PDFDocument, fonts: Fonts, model: PackModel): void {
  const pages = doc.getPages()

  pages.forEach((page, index) => {
    const text = safe(
      `${model.reference} · Accounting pack · Page ${index + 1} of ${pages.length} · Assembled ${model.assembledAt}`,
    )

    page.drawText(text, {
      x: MARGIN,
      y: MARGIN - FOOTER_HEIGHT / 2,
      size: SMALL_SIZE - 1,
      font: fonts.body,
      color: MUTE,
    })
  })
}

/* ── The writer: a cursor down the page ───────────────────────────────────── */

interface Fonts {
  body: PDFFont
  bold: PDFFont
  mono: PDFFont
}

interface TextOptions {
  font?: PDFFont
  size?: number
  color?: ReturnType<typeof rgb>
}

type TableCells = readonly [string, string, string, string]

/** Where the next line goes, and a new page when there is no room. */
class Writer {
  page: PDFPage
  y: number

  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN
  }

  /** The unused area below the cursor, above the footer. */
  remainingBox(): { top: number; width: number; height: number } {
    return {
      top: this.y,
      width: CONTENT_WIDTH,
      height: this.y - MARGIN - FOOTER_HEIGHT,
    }
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN + FOOTER_HEIGHT) {
      this.newPage()
    }
  }

  gap(points: number): void {
    this.y -= points
  }

  rule(): void {
    this.ensure(LINE_HEIGHT / 2)
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 2 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y - 2 },
      thickness: 0.5,
      color: RULE,
    })
    this.y -= 6
  }

  heading(title: string): void {
    this.gap(14)
    this.ensure(LINE_HEIGHT * 3)
    this.text(title.toUpperCase(), { size: SMALL_SIZE, color: MUTE, font: this.fonts.bold })
    this.gap(2)
    this.rule()
    this.gap(2)
  }

  /** One line, no wrapping — for things that are one line by construction. */
  text(value: string, options: TextOptions, x: number = MARGIN): void {
    const size = options.size ?? BODY_SIZE
    const height = Math.max(LINE_HEIGHT, size * 1.3)

    this.ensure(height)
    this.page.drawText(safe(value), {
      x,
      y: this.y - size,
      size,
      font: options.font ?? this.fonts.body,
      color: options.color ?? INK,
    })
    this.y -= height
  }

  /** Wrapped to the content width. */
  paragraph(value: string, options: TextOptions): void {
    const font = options.font ?? this.fonts.body
    const size = options.size ?? BODY_SIZE

    for (const line of wrap(safe(value), font, size, CONTENT_WIDTH)) {
      this.text(line, { ...options, font, size })
    }
  }

  /** Label in the margin voice, value beside it, wrapped in the value column. */
  rows(rows: readonly PackRow[]): void {
    for (const row of rows) {
      const valueLines = wrap(
        safe(row.value),
        this.fonts.body,
        BODY_SIZE,
        CONTENT_WIDTH - LABEL_WIDTH,
      )

      this.ensure(LINE_HEIGHT * valueLines.length)

      const top = this.y

      this.text(row.label, { size: SMALL_SIZE, color: MUTE })
      this.y = top

      for (const line of valueLines) {
        this.text(line, {}, MARGIN + LABEL_WIDTH)
      }
    }
  }

  /** Description wrapped in the first column; the three figures right-aligned. */
  tableRow(cells: TableCells, options: TextOptions): void {
    const font = options.font ?? this.fonts.body
    const size = options.size ?? BODY_SIZE
    const [description, quantity, unit, amount] = cells
    const lines = wrap(safe(description), font, size, QUANTITY_EDGE - MARGIN - 48)

    this.ensure(LINE_HEIGHT * lines.length)

    const top = this.y

    for (const line of lines) {
      this.text(line, { ...options, font, size })
    }

    const bottom = this.y

    for (const [value, edge] of [
      [quantity, QUANTITY_EDGE],
      [unit, UNIT_EDGE],
      [amount, AMOUNT_EDGE],
    ] as const) {
      this.y = top
      this.rightAligned(value, edge, { ...options, font, size })
    }

    this.y = bottom
  }

  total(label: string, amount: Cents, strong: boolean): void {
    const font = strong ? this.fonts.bold : this.fonts.body
    const top = this.y

    this.text(label, { font }, TOTALS_LABEL_X)
    this.y = top
    this.rightAligned(`BND ${formatCents(amount)}`, AMOUNT_EDGE, { font })
  }

  private rightAligned(value: string, rightEdge: number, options: TextOptions): void {
    const font = options.font ?? this.fonts.body
    const size = options.size ?? BODY_SIZE
    const text = safe(value)

    this.text(text, { ...options, font, size }, rightEdge - font.widthOfTextAtSize(text, size))
  }
}

/** What the standard fonts can encode; the model has done this once already. */
function safe(value: string): string {
  return toWinAnsi(value).text
}

/** Greedy word wrap. A single word wider than the column stands alone. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  let current = ''

  for (const word of text.split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`

    if (current === '' || font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }

  lines.push(current)

  return lines
}
