import type { PaymentStatus } from '@/lib/domain/payment'

/**
 * What the verification queue is showing, and in what order.
 *
 * Shared by the page, which validates the URL, and the filter island, which
 * writes it — a client component cannot import from a server page.
 *
 * ── Everything, waiting first ──────────────────────────────────────────────
 *
 * The screen opens on every bank transfer, with the ones still waiting at the
 * top and the verified ones beneath them (changed 2026-09-04; it opened on
 * the waiting ones alone before). architecture.md §6.2 defines the queue as
 * "backed by bookings in awaiting_payment_verification", and that is still
 * what the top of the table is — but a clerk who has just confirmed a
 * transfer wants to see it move down the list, not vanish, and "did we
 * already verify PV-4821" is a question this screen is asked as often as
 * "what is waiting". The order keeps the queue a queue: the outstanding work
 * is always first, and nothing settled sits above it.
 *
 * `all` is the default, so it stays out of the URL; the two narrower views
 * are a deliberate choice.
 */
export const PAYMENT_VIEWS = {
  all: 'Everything',
  waiting: 'Waiting',
  verified: 'Verified',
} as const

export type PaymentView = keyof typeof PAYMENT_VIEWS

export const DEFAULT_PAYMENT_VIEW: PaymentView = 'all'

/**
 * The view named in the URL, or the default.
 *
 * A hand-edited or stale `?show=` narrows nothing rather than erroring: a
 * mistyped URL should show the queue, not a stack trace.
 */
export function readView(value: string | string[] | undefined): PaymentView {
  const raw = Array.isArray(value) ? value[0] : value

  return raw && raw in PAYMENT_VIEWS ? (raw as PaymentView) : DEFAULT_PAYMENT_VIEW
}

/** The statuses a view asks for. An empty list means no filter. */
export function statusesForView(view: PaymentView): readonly PaymentStatus[] {
  switch (view) {
    case 'waiting':
      return ['pending_verification']
    case 'verified':
      return ['verified']
    default:
      return []
  }
}

/** One payment, as the ordering needs to see it. */
interface QueueRow {
  status: PaymentStatus
  /** When the guest was told what to send — when the wait began. */
  createdAt: string
  verifiedAt: string | null
}

/**
 * The order the queue is worked in.
 *
 * Waiting payments first, and **oldest first** among them: a queue is worked
 * from the top and the longest wait belongs there — for now the only thing
 * standing between a forgotten transfer and a unit blocked indefinitely
 * (prd.md §18 N7 is open, and no job expires a pending transfer yet). Then the
 * verified ones, **newest first**, because that half is read as a log: the one
 * just confirmed is the one somebody is checking for.
 */
export function sortQueue<T extends QueueRow>(payments: readonly T[]): T[] {
  return [...payments].sort((a, b) => {
    const aWaiting = a.status === 'pending_verification'
    const bWaiting = b.status === 'pending_verification'

    if (aWaiting !== bWaiting) {
      return aWaiting ? -1 : 1
    }

    return aWaiting
      ? a.createdAt.localeCompare(b.createdAt)
      : settledAt(b).localeCompare(settledAt(a))
  })
}

function settledAt(payment: QueueRow): string {
  return payment.verifiedAt ?? payment.createdAt
}
