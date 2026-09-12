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
  /** The transfer slip on file, on whichever row the money is (N39). */
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
 * **A slip, since A6.** It used to have none: attaching one meant a
 * `payment_id` (architecture.md §8.1) and a deposit is not a payment, so the
 * cell carried a sentence saying so. [N39](../../../../docs/open-questions.md)
 * answered that with a second pointer rather than a second kind, so a deposit
 * now reads *On file* exactly as a payment does — and since every online stay
 * pays the deposit and nothing else, this is the row the customer'''s screenshot
 * usually lands on.
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
    // The booking's quote, not the row's figure. `verify_deposit()` matches
    // against the quote read live under the row lock, so an amendment that
    // repriced the deposit after the promise was raised would otherwise
    // pre-fill this dialog with a figure SQL refuses without a reason.
    due: deposit.quoted,
    expected: deposit.quoted,
    amount: null,
    createdAt: deposit.promisedAt ?? deposit.collectedAt ?? '',
    verifiedAt: null,
    slipDocumentId: deposit.slipDocumentId,
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

/** Which rows a page of the queue is made of. */
export interface QueueSlice {
  /** The waiting entries falling on this page, in order. */
  waiting: readonly QueueEntry[]
  /**
   * The window of settled rows to read, or null when this page is all waiting
   * work. An offset rather than a page number, because the settled rows do not
   * start at a page boundary — the waiting ones came first.
   */
  settled: { offset: number; limit: number } | null
}

/**
 * One page of the queue, split across its two halves.
 *
 * The screen is two lists shown as one: everything still waiting, and beneath
 * it everything already settled. They have different shapes over time — the
 * waiting half is bounded by work somebody is clearing, the settled half
 * accumulates for the life of the building — so the waiting half is read whole
 * and the settled half a page at a time from the database.
 *
 * This is the arithmetic joining them, and it is pure so a test can walk the
 * boundary rather than a person clicking to page three. The rule it depends on
 * is `sortQueue`'s: **every waiting row sorts above every settled one**, so the
 * concatenation is already ordered and a page is simply a window over it.
 */
export function queueSlice(
  waiting: readonly QueueEntry[],
  page: number,
  pageSize: number,
): QueueSlice {
  if (pageSize <= 0) {
    return { waiting: [], settled: null }
  }

  const offset = Math.max(0, (Math.max(1, Math.trunc(page)) - 1) * pageSize)
  const onPage = waiting.slice(offset, offset + pageSize)
  const remaining = pageSize - onPage.length

  // A page entirely inside the waiting half needs no settled read at all,
  // which is the ordinary case: the queue is worked from the top.
  if (remaining <= 0) {
    return { waiting: onPage, settled: null }
  }

  return {
    waiting: onPage,
    // Once the waiting rows are exhausted the settled ones continue from where
    // the page's offset falls past them. `max(0, …)` covers the page that
    // straddles the join, where the offset is still inside the waiting half.
    settled: { offset: Math.max(0, offset - waiting.length), limit: remaining },
  }
}
