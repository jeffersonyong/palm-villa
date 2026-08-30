/**
 * The payment vocabulary (prd.md §10, architecture.md §6).
 *
 * Pure and I/O-free, and the same relationship to the database that
 * lib/auth/permissions.ts has to role_permission: these closed lists are
 * mirrored by CHECK constraints on the `payment` table, so widening one is a
 * code change and a migration, together.
 */

/**
 * How the money arrived.
 *
 * prd.md §10.1 [C] names exactly two for v1. Card is deferred pending merchant
 * onboarding (NG1, scope X1); adding it widens a check constraint rather than
 * an enum, which migration 000200 explains at length.
 */
export const PAYMENT_METHODS = ['bank_transfer', 'cash'] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/**
 * Where the payment has got to.
 *
 * Two values, not three. There is deliberately no `rejected`: capabilities
 * B4–B7 contain no action for "the transfer never arrived", and inventing a
 * status for an outcome nobody has described would be the schema deciding a
 * product question. Today that outcome is a booking cancellation; prd.md §18
 * N13 asks the client whether it needs an answer of its own.
 *
 * Cash is born `verified` — there is no bank to check, the clerk is holding
 * the notes. prd.md §10.5's "verified by Finance" is the daily cash-up
 * (capability E4) reconciling recorded cash against banked cash, which is a
 * separate later fact and not a mutation of this value.
 */
export const PAYMENT_STATUSES = ['pending_verification', 'verified'] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/**
 * How a payment came to be attached to its booking.
 *
 * `reference` is the ordinary case: the customer quoted the booking reference
 * in the transfer description and it was found. `manual` is prd.md §10.4's
 * escape hatch — the customer omitted it and a staff member tied the two
 * together by hand, which architecture.md §4 counts as an approval-semantic
 * act and therefore always carries a reason.
 */
export const PAYMENT_MATCH_KINDS = ['reference', 'manual'] as const

export type PaymentMatchKind = (typeof PAYMENT_MATCH_KINDS)[number]

/** Screen-facing labels. The portal never renders a raw enum value. */
export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
}

export const PAYMENT_STATUS_LABELS: Readonly<Record<PaymentStatus, string>> = {
  pending_verification: 'Awaiting verification',
  verified: 'Verified',
}
