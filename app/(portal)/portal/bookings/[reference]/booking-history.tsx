import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/components/ui/avatar-identity'
import type { AuditEvent } from '@/lib/db/audit'
import { formatTimestamp } from '@/lib/domain/dates'

/**
 * Everything recorded against this booking, newest first.
 *
 * This is the "who, what, when" half of capability B3, and the per-booking view
 * of what F4 promises property-wide. It reads the audit trail directly rather
 * than any status field, which is the point of architecture.md §4 keeping
 * approvals as events: a flag can say a booking was cancelled, but only an
 * event can say who cancelled it, when, and why.
 *
 * The action labels live here for the same reason the status labels live in
 * `booking-status-badge` — one table, one place. The F4 audit screen will want
 * this map too; it moves to a shared module when there is a second caller, not
 * before.
 *
 * Events on the booking's **payments** are folded in by the page. They carry
 * `entity_type = 'payment'`, so a trail built only from the booking's own
 * events would show it reaching `confirmed` with no record of what was
 * actually banked — the lie by omission this component is written to avoid.
 */

const ACTION_LABELS: Record<string, string> = {
  'booking.amended': 'Amended',
  'booking.cancel': 'Cancelled',
  'booking.check_in': 'Checked in',
  'booking.check_out': 'Checked out',
  // The booking's own status move, distinct from the payment event beside it.
  // Both are recorded, and labelling both "Payment verified" made the trail
  // say the same thing twice — the money is the payment's event, the status
  // is the booking's.
  'booking.verify_payment': 'Booking confirmed',
  'booking.pay_in_full': 'Booking confirmed',
  'booking.submit_payment': 'Sent for verification',
  'booking.expire': 'Hold expired',
  'booking.mark_no_show': 'Marked no-show',
  'booking.hold': 'Held',
  'payment.recorded': 'Bank transfer awaited',
  'payment.cash_recorded': 'Cash recorded',
  'payment.verified': 'Payment verified',
  'payment.amount_overridden': 'Confirmed at an amount other than the total',
  'payment.matched_manually': 'Matched to this booking by hand',
}

/**
 * Creation reads differently depending on how the guest paid, so it is the one
 * label derived from the event's payload rather than its verb alone.
 *
 * "Paid on the spot" was true of every booking this product could make until
 * the payments slice; it is a lie about a transfer booking, which is created
 * precisely because the money has *not* been confirmed yet.
 */
function createdLabel(event: AuditEvent): string {
  return event.after?.payment_method === 'bank_transfer'
    ? 'Created — walk-in, paying by transfer'
    : 'Created — walk-in, paid on the spot'
}

/**
 * An unmapped action still renders, as its raw verb.
 *
 * Falling back rather than hiding it: an event nobody wrote a label for is
 * still something that happened to this booking, and silently dropping it
 * would make the trail lie by omission.
 */
function actionLabel(event: AuditEvent): string {
  if (event.action === 'booking.created_walk_in') {
    return createdLabel(event)
  }

  return (
    ACTION_LABELS[event.action] ??
    event.action.replace(/^(booking|payment)\./, '').replace(/_/g, ' ')
  )
}

/** The typed note a staff member left, when the action asked for one. */
function reasonOf(event: AuditEvent): string | null {
  const reason = event.after?.reason

  return typeof reason === 'string' && reason.length > 0 ? reason : null
}

interface BookingHistoryProps {
  events: readonly AuditEvent[]
  /** Display names by `auth.users.id`; an actor with no name renders as system. */
  actorNames: ReadonlyMap<string, string>
}

export function BookingHistory({ events, actorNames }: BookingHistoryProps) {
  if (events.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        Nothing recorded against this booking yet.
      </p>
    )
  }

  return (
    <ol className="grid gap-md">
      {events.map((event) => {
        const reason = reasonOf(event)
        const actorName = event.actorId ? actorNames.get(event.actorId) : undefined

        return (
          <li
            key={event.id}
            className="flex gap-md border-b border-divider pb-md last:border-0 last:pb-0"
          >
            <ActorMark id={event.actorId} name={actorName} />
            <div className="grid min-w-0 flex-1 gap-xxs">
              <div className="flex flex-wrap items-baseline justify-between gap-sm">
                <p className="text-body-sm-strong text-foreground">{actionLabel(event)}</p>
                <p className="text-caption text-muted-foreground tabular-nums">
                  {formatTimestamp(event.at)}
                </p>
              </div>
              <p className="text-caption text-muted-foreground">
                {event.actorId ? (actorName ?? 'A former staff member') : 'System'}
              </p>
              {reason ? <p className="mt-xxs text-body-sm text-copy">“{reason}”</p> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Who did it, wearing their identity colour — the 24px in-row avatar, so the
 * trail scans by face before it is read. Every entry carries the mark so the
 * text column keeps one left edge: a departed actor's colour is still derived
 * from their id (it never repaints), and the system wears the neutral,
 * seedless face — an event nobody performed, marked by nobody in particular.
 */
function ActorMark({ id, name }: { id: string | null; name: string | undefined }) {
  return (
    <Avatar className="size-6">
      <AvatarFallback seed={id ?? undefined}>{id ? initials(name ?? '?') : 'PV'}</AvatarFallback>
    </Avatar>
  )
}
