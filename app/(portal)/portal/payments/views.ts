import type { PaymentStatus } from '@/lib/domain/payment'

/**
 * What the verification queue is showing.
 *
 * Shared by the page, which validates the URL, and the filter island, which
 * writes it — a client component cannot import from a server page.
 *
 * ── Why this is not "empty means everything" ────────────────────────────────
 *
 * The bookings list treats a cleared filter as "show me all bookings", and
 * that is right for a list. This is a queue. architecture.md §6.2 defines it
 * as "backed by bookings in awaiting_payment_verification", and a queue that
 * opens showing a year of settled payments is not a queue — the outstanding
 * work is the screen's whole subject. So `waiting` is the default, it stays
 * out of the URL, and seeing everything is a deliberate choice.
 */
export const PAYMENT_VIEWS = {
  waiting: 'Waiting',
  verified: 'Verified',
  all: 'Everything',
} as const

export type PaymentView = keyof typeof PAYMENT_VIEWS

/**
 * The view named in the URL, or the default.
 *
 * A hand-edited or stale `?show=` narrows nothing rather than erroring: a
 * mistyped URL should show the queue, not a stack trace.
 */
export function readView(value: string | string[] | undefined): PaymentView {
  const raw = Array.isArray(value) ? value[0] : value

  return raw && raw in PAYMENT_VIEWS ? (raw as PaymentView) : 'waiting'
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
