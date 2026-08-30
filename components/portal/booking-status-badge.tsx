import { Badge } from '@/components/ui/badge'
import type { BookingStatus } from '@/lib/domain/booking-state'

/**
 * Booking status, rendered in the portal's status language.
 *
 * The status-to-tone mapping lives here and only here. design.md is normative
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

const STATUS_PRESENTATION = {
  draft: { label: 'Draft', tone: 'neutral' },
  held: { label: 'Held', tone: 'neutral' },
  awaiting_payment_verification: { label: 'Awaiting payment', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'positive' },
  checked_in: { label: 'Checked in', tone: 'active' },
  completed: { label: 'Completed', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'negative' },
  cancelled: { label: 'Cancelled', tone: 'negative' },
  no_show: { label: 'No show', tone: 'negative' },
} as const satisfies Record<
  BookingStatus,
  { label: string; tone: 'positive' | 'warning' | 'negative' | 'active' | 'neutral' }
>

/** The semantic tones design.md allows a status to carry. */
export type BookingStatusTone = (typeof STATUS_PRESENTATION)[BookingStatus]['tone']

/** The staff-facing name for a status, for filter options and prose. */
export function bookingStatusLabel(status: BookingStatus): string {
  return STATUS_PRESENTATION[status].label
}

/**
 * The tone a status carries, for the places that show its colour at something
 * other than badge scale — the filter row's option dots, so far. Read off the
 * same table as the badge rather than restated, which is the whole point of the
 * table being here.
 */
export function bookingStatusTone(status: BookingStatus): BookingStatusTone {
  return STATUS_PRESENTATION[status].tone
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { label, tone } = STATUS_PRESENTATION[status]

  return <Badge tone={tone}>{label}</Badge>
}
