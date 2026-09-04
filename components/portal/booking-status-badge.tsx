import { Badge } from '@/components/ui/badge'
import type { StatusTone } from '@/components/portal/status-tone'
import { BOOKING_STATUS_LABELS, type BookingStatus } from '@/lib/domain/booking-state'

/**
 * Booking status, rendered in the portal's status language.
 *
 * The words come from the state machine's own table — a document with no
 * screen behind it (the accounting pack) has to name a status too, and
 * lib/domain cannot ask a component. The status-to-tone mapping lives here and
 * only here. design.md is normative
 * for it — "aqua is never a success indicator; that is positive" — and a second
 * copy of this table somewhere else is how a screen quietly invents its own
 * colour meaning.
 *
 * design.md specifies tones for the states staff see on a queue: confirmed,
 * awaiting payment, the three failure exits, and checked-in. It says nothing
 * about `held`, `completed` or `draft`, so those take `neutral` rather than a
 * tone invented here. If the client or design.md later gives them a meaning,
 * this table is the one place it changes.
 */

const STATUS_TONE = {
  draft: 'neutral',
  held: 'neutral',
  awaiting_payment_verification: 'warning',
  confirmed: 'positive',
  checked_in: 'active',
  completed: 'neutral',
  expired: 'negative',
  cancelled: 'negative',
  no_show: 'negative',
} as const satisfies Record<BookingStatus, StatusTone>

/**
 * The tones a booking status actually uses — a subset of {@link StatusTone},
 * narrowed by this table rather than restated.
 */
export type BookingStatusTone = (typeof STATUS_TONE)[BookingStatus]

/** The staff-facing name for a status, for filter options and prose. */
export function bookingStatusLabel(status: BookingStatus): string {
  return BOOKING_STATUS_LABELS[status]
}

/**
 * The tone a status carries, for the places that show its colour at something
 * other than badge scale — the filter row's option dots, so far. Read off the
 * same table as the badge rather than restated, which is the whole point of the
 * table being here.
 */
export function bookingStatusTone(status: BookingStatus): BookingStatusTone {
  return STATUS_TONE[status]
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{BOOKING_STATUS_LABELS[status]}</Badge>
}
