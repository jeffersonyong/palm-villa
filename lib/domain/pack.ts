import { balanceOf, type BalanceState } from './balance'
import { BOOKING_STATUS_LABELS, type BookingStatus } from './booking-state'
import { formatStayDate, formatStayDates, formatTimestamp, type StayDate } from './dates'
import { describeDiscount, type Discount } from './discount'
import { DOCUMENT_KIND_LABELS, type DocumentKind } from './document'
import type { BookingLine } from './lines'
import { formatCents, type Cents } from './money'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentMatchKind,
  type PaymentMethod,
  type PaymentStatus,
} from './payment'
import { BOOKING_STREAM_LABELS, type BookingStream } from './stream'
import { formatVehicles } from './vehicle'

/**
 * What an accounting pack says (capability G5, prd.md §13 requirement 4,
 * architecture.md §8.2).
 *
 * scope-of-capabilities.md G5: "the accounting record pack (transfer slip + IC
 * + confirmation + itemised booking) is generated automatically per booking".
 * This module decides what goes on the pages; lib/pdf/accounting-pack.ts draws
 * it, and lib/db/packs.ts fetches the facts and files the result. The split is
 * the one architecture.md §2 draws everywhere: the decisions are pure and
 * tested here, and nothing here can reach a database or a library.
 *
 * ── Four things the pack deliberately is and is not ───────────────────────
 *
 * **The IC is referenced, never copied in.** prd.md §13 says "IC"; architecture
 * .md §8 says "IC reference", and the reference is what is built. A pack is
 * kept seven years and opens under `booking.view`; an identity document is kept
 * twelve months and opens under `document.view_identity`. Copying the image in
 * would keep it six years past its own retention and hand it to every role
 * capability G2 promises never sees it. The pack records that the IC was
 * collected, when, by whom, and the record's id — and not its filename, which
 * architecture.md §8.1 counts as content. Raised with the client as N24.
 *
 * **"Transaction confirmation" is read as the verification record** [A].
 * Nothing in the system is called a confirmation; what confirms a transfer is
 * somebody checking the bank (prd.md §10.4), and that act — who, when, what
 * they saw, why an odd amount was accepted — is what is printed.
 *
 * **The deposit is a pointer, not a section.** prd.md §11 keeps the security
 * deposit a separate liability with its own statement; repeating it here
 * would make the pack the whole ledger.
 *
 * **Everything is as of assembly.** A pack is rebuilt when its inputs move
 * (architecture.md §8.2), so the status printed is the status at the moment
 * the pack was built, and it says so.
 */

/* ── The facts a pack is built from ───────────────────────────────────────── */

/**
 * Structural subsets of the read models in lib/db, declared here so this
 * module depends on nothing outside lib/domain. A `Booking`, a `Payment` and a
 * `Document` from lib/db satisfy them as they are.
 */
export interface PackBookingFacts {
  reference: string
  stream: BookingStream
  status: BookingStatus
  guestName: string
  guestPhone: string
  vehicles: readonly string[]
  noVehicle: boolean
  chargeableGuests: number
  exemptGuests: number
  stay: { unitRef: string; range: { start: StayDate; end: StayDate } } | null
  lines: readonly BookingLine[]
  total: Cents
  paid: Cents
  securityDeposit: Cents
  /** Why nothing was quoted, when the deposit was waived at creation (B15). */
  depositWaiverReason: string | null
  discount: Discount | null
}

export interface PackPaymentFacts {
  id: string
  method: PaymentMethod
  status: PaymentStatus
  amount: Cents | null
  observedReference: string | null
  observedSender: string | null
  observedOn: StayDate | null
  matchKind: PaymentMatchKind | null
  amountOverrideReason: string | null
  matchReason: string | null
  collectedBy: string | null
  collectedAt: string | null
  verifiedBy: string | null
  verifiedAt: string | null
  createdAt: string
}

export interface PackDocumentFacts {
  id: string
  kind: DocumentKind
  mimeType: string
  uploadedBy: string | null
  uploadedAt: string
  paymentId: string | null
}

export interface BuildPackInput {
  booking: PackBookingFacts
  /** Every payment on the booking, pending ones included. */
  payments: readonly PackPaymentFacts[]
  /** Live identity documents — referenced, never copied. */
  identityDocuments: readonly PackDocumentFacts[]
  /** Live transfer slips — copied in where the file allows it. */
  slips: readonly PackDocumentFacts[]
  /** Display names by `auth.users.id`, as every history panel resolves them. */
  actorNames: ReadonlyMap<string, string>
  assembledAt: Date
}

/* ── The pack ─────────────────────────────────────────────────────────────── */

/** One labelled line of prose. Both halves are already safe to print. */
export interface PackRow {
  label: string
  value: string
}

/** How a slip's bytes reach the page, or null where they cannot. */
export type PackEmbedding = 'jpeg' | 'png' | 'pdf'

export interface PackAttachment {
  documentId: string
  /** The header line above the copied file. */
  title: string
  embedding: PackEmbedding | null
  /** Why it is a placeholder rather than the file, when `embedding` is null. */
  reason: string | null
}

export interface PackPayment {
  heading: string
  rows: readonly PackRow[]
  /** Index into `attachments` of this payment's slip, or null with none. */
  attachmentIndex: number | null
}

export interface PackTotals {
  total: Cents
  paid: Cents
  outstanding: Cents
  state: BalanceState
}

export interface PackModel {
  reference: string
  filename: string
  /** Formatted, in Brunei time. */
  assembledAt: string
  cover: readonly PackRow[]
  lines: readonly BookingLine[]
  totals: PackTotals
  /** Null when no discount was given. */
  discountNote: string | null
  securityDepositNote: string
  payments: readonly PackPayment[]
  /** One row-set per identity document on file; empty when none. */
  identity: readonly (readonly PackRow[])[]
  identityNote: string
  attachments: readonly PackAttachment[]
  /** Sentences for the foot of the record, e.g. that a name lost characters. */
  notices: readonly string[]
}

const UNPRINTABLE_NOTICE =
  "Some characters in this record could not be printed and are shown as '?'. The booking screen has them in full."

/** How the pack explains the IC it does not contain. See the module header. */
const IDENTITY_NOTE =
  'Identity documents are referenced here and not copied in: an identity document is kept for twelve months and opened only by staff with permission to view one, while this pack is kept for seven years and opened by anyone who can view the booking. The record above shows that registration was done; the document itself is on the booking.'

export function buildPackModel(input: BuildPackInput): PackModel {
  const { booking, assembledAt } = input
  const printer = new Printer()
  const attachments = attachmentsOf(input, printer)
  const attachmentIndexByPayment = new Map(
    input.slips.map((slip, index) => [slip.paymentId, index] as const),
  )

  const payments = [...input.payments]
    .sort((a, b) => compare(a.createdAt, b.createdAt))
    .map((payment) => paymentSection(payment, input.actorNames, attachmentIndexByPayment, printer))

  const identity = [...input.identityDocuments]
    .sort((a, b) => compare(a.uploadedAt, b.uploadedAt))
    .map((document) => identityRows(document, input.actorNames, printer))

  const balance = balanceOf(booking.total, booking.paid)

  return {
    reference: booking.reference,
    filename: packFilenameFor(booking.reference),
    assembledAt: formatTimestamp(assembledAt.toISOString()),
    cover: coverRows(booking, assembledAt, printer),
    lines: booking.lines.map((entry) => ({
      ...entry,
      description: printer.text(entry.description),
    })),
    totals: {
      total: balance.total,
      paid: balance.paid,
      outstanding: balance.outstanding,
      state: balance.state,
    },
    discountNote: booking.discount ? printer.text(describeDiscount(booking.discount)) : null,
    // A waived deposit is a decision the accountant should see as one, with
    // its reason, not as a booking that happened to quote nothing.
    securityDepositNote:
      booking.securityDeposit > 0
        ? `Security deposit quoted: BND ${formatCents(booking.securityDeposit)}. Held separately and not part of this total; see the deposit statement.`
        : booking.depositWaiverReason
          ? `Security deposit waived at booking: ${printer.text(booking.depositWaiverReason)}. Nothing was held against this stay.`
          : 'No security deposit was quoted on this booking.',
    payments,
    identity,
    identityNote: IDENTITY_NOTE,
    attachments,
    notices: printer.altered ? [UNPRINTABLE_NOTICE] : [],
  }
}

/** `PV-4821-accounting-pack.pdf` — the reference first, so a folder sorts by it. */
export function packFilenameFor(reference: string): string {
  return `${reference}-accounting-pack.pdf`
}

/**
 * How a stored file can be copied onto a page.
 *
 * pdf-lib embeds JPEG and PNG and can draw the pages of a PDF; it cannot read
 * WebP, which the slip kinds accept. A WebP slip is on file and openable from
 * the booking — it is only the copy into this pack that is a placeholder.
 */
export function embeddingFor(mimeType: string): PackEmbedding | null {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpeg'
    case 'image/png':
      return 'png'
    case 'application/pdf':
      return 'pdf'
    default:
      return null
  }
}

/* ── Sections ─────────────────────────────────────────────────────────────── */

function coverRows(booking: PackBookingFacts, assembledAt: Date, printer: Printer): PackRow[] {
  const rows: PackRow[] = [
    { label: 'Booking reference', value: booking.reference },
    { label: 'Assembled', value: formatTimestamp(assembledAt.toISOString()) },
    { label: 'Status at assembly', value: BOOKING_STATUS_LABELS[booking.status] },
    { label: 'Type', value: BOOKING_STREAM_LABELS[booking.stream] },
    { label: 'Guest', value: printer.text(booking.guestName) },
    { label: 'Phone', value: printer.text(booking.guestPhone) },
    { label: 'Vehicles', value: printer.text(vehiclesOf(booking)) },
    {
      label: 'Unit',
      value: booking.stay ? printer.text(booking.stay.unitRef) : 'Occupies no unit',
    },
  ]

  if (booking.stay) {
    rows.push({ label: 'Stay', value: printer.text(stayOf(booking.stay)) })
  }

  rows.push({ label: 'Party', value: partyOf(booking) })

  return rows
}

/**
 * The stay, joined by an en dash rather than the screens' arrow.
 *
 * `formatStayDates` joins two dates with `→`, which the pack's built-in font
 * cannot encode — printed as-is it becomes a `?` between two dates, which
 * reads as data the system does not have rather than as a range. An en dash
 * is in WinAnsi, is what a printed document uses for a span anyway, and keeps
 * the dates themselves the ones every screen shows.
 */
function stayOf(stay: NonNullable<PackBookingFacts['stay']>): string {
  return formatStayDates(stay.range.start, stay.range.end).replace('→', '–')
}

function vehiclesOf(booking: PackBookingFacts): string {
  const listed = formatVehicles(booking.vehicles)

  if (listed) {
    return listed
  }

  return booking.noVehicle ? 'Arriving without a vehicle' : 'Not recorded'
}

function partyOf(booking: PackBookingFacts): string {
  const counted = `${booking.chargeableGuests}`

  return booking.exemptGuests > 0
    ? `${counted}, plus ${booking.exemptGuests} not counted towards occupancy`
    : counted
}

function paymentSection(
  payment: PackPaymentFacts,
  actorNames: ReadonlyMap<string, string>,
  attachmentIndexByPayment: ReadonlyMap<string | null, number>,
  printer: Printer,
): PackPayment {
  const method = PAYMENT_METHOD_LABELS[payment.method]
  const heading =
    payment.amount === null
      ? `${method} — awaiting verification`
      : `${method} — BND ${formatCents(payment.amount)}`
  const rows: PackRow[] = [{ label: 'Status', value: PAYMENT_STATUS_LABELS[payment.status] }]

  if (payment.method === 'cash' && payment.collectedAt) {
    rows.push({
      label: 'Collected',
      value: `${formatTimestamp(payment.collectedAt)} by ${printer.name(payment.collectedBy, actorNames)}`,
    })
  } else if (payment.verifiedAt) {
    rows.push({
      label: 'Verified',
      value: `${formatTimestamp(payment.verifiedAt)} by ${printer.name(payment.verifiedBy, actorNames)}`,
    })
  }

  if (payment.observedReference) {
    rows.push({ label: 'Bank reference', value: printer.text(payment.observedReference) })
  }

  if (payment.observedSender) {
    rows.push({ label: 'Sender', value: printer.text(payment.observedSender) })
  }

  if (payment.observedOn) {
    rows.push({ label: 'Appeared on', value: formatStayDate(payment.observedOn) })
  }

  if (payment.matchKind === 'manual') {
    rows.push({
      label: 'Matched',
      value: `By hand — ${printer.text(payment.matchReason ?? 'no reason recorded')}`,
    })
  } else if (payment.matchKind === 'reference') {
    rows.push({ label: 'Matched', value: 'By payment reference' })
  }

  if (payment.amountOverrideReason) {
    rows.push({ label: 'Amount differs', value: printer.text(payment.amountOverrideReason) })
  }

  const attachmentIndex = attachmentIndexByPayment.get(payment.id) ?? null

  rows.push({ label: 'Slip', value: slipNote(payment, attachmentIndex) })

  return { heading, rows, attachmentIndex }
}

function slipNote(payment: PackPaymentFacts, attachmentIndex: number | null): string {
  if (attachmentIndex !== null) {
    return `Attachment ${attachmentIndex + 1}`
  }

  return payment.method === 'cash' ? 'None — cash is counted at the desk' : 'None on file'
}

function identityRows(
  document: PackDocumentFacts,
  actorNames: ReadonlyMap<string, string>,
  printer: Printer,
): PackRow[] {
  return [
    { label: 'Document', value: DOCUMENT_KIND_LABELS[document.kind] },
    {
      label: 'Attached',
      value: `${formatTimestamp(document.uploadedAt)} by ${printer.name(document.uploadedBy, actorNames)}`,
    },
    { label: 'Record', value: document.id },
  ]
}

function attachmentsOf(input: BuildPackInput, printer: Printer): PackAttachment[] {
  const paymentsById = new Map(input.payments.map((payment) => [payment.id, payment] as const))

  return input.slips.map((slip, index) => {
    const payment = slip.paymentId ? paymentsById.get(slip.paymentId) : undefined
    const embedding = embeddingFor(slip.mimeType)
    const money =
      payment?.amount === null || payment?.amount === undefined
        ? 'payment awaiting verification'
        : `payment of BND ${formatCents(payment.amount)}`

    return {
      documentId: slip.id,
      title: printer.text(`Attachment ${index + 1} — transfer slip for ${money}`),
      embedding,
      reason:
        embedding === null
          ? 'This slip is stored in a format the pack cannot copy in. It is on file and opens from the booking.'
          : null,
    }
  })
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/* ── What Helvetica can print ─────────────────────────────────────────────── */

/**
 * The characters WinAnsi carries beyond Latin-1: the printable half of the
 * 0x80–0x9F block, which is where the dashes and curly quotes the date and
 * money formatters emit actually live.
 */
const WIN_ANSI_EXTRAS: ReadonlySet<string> = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'))

const FIRST_PRINTABLE = 0x20
const LAST_ASCII_PRINTABLE = 0x7e
const FIRST_LATIN_1_PRINTABLE = 0xa0
const LAST_LATIN_1 = 0xff

/**
 * The text as pdf-lib's standard Helvetica can encode it.
 *
 * The pack is drawn with the built-in fonts (architecture.md §8.2: no font
 * file, no second dependency), and those speak WinAnsi and nothing else — a
 * guest name in Chinese or Jawi script makes `drawText` throw. Each character
 * outside the encoding becomes `?`, and `altered` lets the caller say so on
 * the page rather than print a name that looks complete and is not. Line
 * breaks become spaces because a row is one line.
 */
export function toWinAnsi(text: string): { text: string; altered: boolean } {
  let altered = false

  const printable = Array.from(text).map((character) => {
    const code = character.codePointAt(0) ?? 0

    if (character === '\n' || character === '\r' || character === '\t') {
      return ' '
    }

    if (
      (code >= FIRST_PRINTABLE && code <= LAST_ASCII_PRINTABLE) ||
      (code >= FIRST_LATIN_1_PRINTABLE && code <= LAST_LATIN_1) ||
      WIN_ANSI_EXTRAS.has(character)
    ) {
      return character
    }

    altered = true

    return '?'
  })

  return { text: printable.join(''), altered }
}

/** Runs every string through `toWinAnsi` and remembers whether any changed. */
class Printer {
  altered = false

  text(value: string): string {
    const result = toWinAnsi(value)

    this.altered = this.altered || result.altered

    return result.text
  }

  /** Who did something, in the words every history panel uses. */
  name(actorId: string | null, actorNames: ReadonlyMap<string, string>): string {
    if (!actorId) {
      return 'the system'
    }

    return this.text(actorNames.get(actorId) ?? 'a former colleague')
  }
}
