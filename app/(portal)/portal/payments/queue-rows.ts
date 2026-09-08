import type { Deposit } from '@/lib/db/deposits'
import type { Payment } from '@/lib/db/payments'
import type { Cents } from '@/lib/domain/money'
import type { StayDate } from '@/lib/domain/dates'

import { sortQueue, type PaymentView } from './views'

/**
 * The queue holds two kinds of money, and this is what makes them one list.
 *
 * A booking payment and a security deposit promised at booking (capability
 * B16) are the same job for whoever works this screen: somebody said they
 * transferred something, and a person has to open the bank app and check. They
 * are two tables underneath for the reason prd.md §9.1 gives — a deposit
 * recorded as a payment would make every deposit-secured booking read as short
 * against its own total — but that is a fact about the schema, and a clerk
 * should not have to work two screens because of it.
 *
 * So the rows are flattened to what the queue actually shows, and `kind`
 * carries the difference through to the one place it matters: which dialog
 * opens, and therefore which function verifies it.
 *
 * Pure and tested, like `views.ts` beside it, because the ordering rule is the
 * screen's whole behaviour and a queue that sorts wrong is a queue that leaves
 * somebody waiting.
 */

export type QueueEntryKind = 'payment' | 'deposit'

export interface QueueEntry {
  id: string
  kind: QueueEntryKind
  status: 'pending_verification' | 'verified'
  bookingReference: string
  guestName: string
  /** The stay's first night, or a day pass's date. Null where neither exists. */
  arriving: StayDate | null
  /** What the guest was asked for, while waiting. */
  due: Cents
  /** What was raised against, for the "of X due" line. Equal to `due` on a deposit. */
  expected: Cents
  /** What actually arrived, or null while nobody has looked. */
  amount: Cents | null
  /** When the wait began. */
  createdAt: string
  verifiedAt: string | null
  /** A slip lives on a payment. A deposit has none — see below. */
  slipDocumentId: string | null
}

/** A payment, as the queue sees it. */
export function paymentEntry(payment: Payment): QueueEntry {
  return {
    id: payment.id,
    kind: 'payment',
    status: payment.status,
    bookingReference: payment.bookingReference,
    guestName: payment.guestName,
    arriving: payment.checkIn ?? payment.passDate ?? null,
    due: payment.due,
    expected: payment.expected,
    amount: payment.amount,
    createdAt: payment.createdAt,
    verifiedAt: payment.verifiedAt,
    slipDocumentId: payment.slipDocumentId,
  }
}

/**
 * A promised deposit, as the queue sees it.
 *
 * **Always pending.** A verified deposit leaves this queue entirely — it is on
 * the ledger, which is the screen that answers what the property holds. A
 * verified *payment* stays, because the queue's second half is a log of what
 * was confirmed and there is no other screen for it.
 *
 * **No slip.** Attaching one is `payment.verify` against a `payment_id`
 * (architecture.md §8.1), and a deposit is not a payment, so there is nothing
 * to hang a document on. The cell says so rather than showing an empty space
 * that reads as a slip somebody forgot.
 *
 * The wait starts at `promised_at` — the moment the customer pressed the
 * button — falling back to when the row was written, which is the same instant
 * for anything this flow created.
 */
export function depositEntry(deposit: Deposit): QueueEntry {
  return {
    id: deposit.id,
    kind: 'deposit',
    status: 'pending_verification',
    bookingReference: deposit.bookingReference,
    guestName: deposit.guestName,
    arriving: deposit.stay?.range.start ?? null,
    due: deposit.amount,
    expected: deposit.amount,
    amount: null,
    createdAt: deposit.promisedAt ?? deposit.collectedAt ?? '',
    verifiedAt: null,
    slipDocumentId: null,
  }
}

/**
 * The queue, in the order it is worked.
 *
 * The deposits join the payments and the whole lot is sorted together by
 * `sortQueue` — waiting first, oldest at the top — rather than being stacked
 * in a section of their own. A clerk working down the screen is answering one
 * question in one order, and two lists would mean the oldest thing on the
 * screen is not necessarily the one at the top.
 *
 * The `verified` view holds no deposits at all, and that is not an omission:
 * see `depositEntry`.
 */
export function buildQueue(
  payments: readonly Payment[],
  deposits: readonly Deposit[],
  view: PaymentView,
): QueueEntry[] {
  const entries = payments.map(paymentEntry)

  if (view !== 'verified') {
    entries.push(...deposits.map(depositEntry))
  }

  return sortQueue(entries)
}

/** How many of these are still waiting on somebody. */
export function countWaiting(entries: readonly QueueEntry[]): number {
  return entries.filter((entry) => entry.status === 'pending_verification').length
}
