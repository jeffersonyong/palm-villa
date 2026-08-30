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
  'booking.created_walk_in': 'Created — walk-in, paid on the spot',
  'booking.amended': 'Amended',
  'booking.cancel': 'Cancelled',
  'booking.check_in': 'Checked in',
  'booking.check_out': 'Checked out',
  'booking.verify_payment': 'Payment verified',
  'booking.submit_payment': 'Payment submitted',
  'booking.pay_in_full': 'Paid in full',
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
 * An unmapped action still renders, as its raw verb.
 *
 * Falling back rather than hiding it: an event nobody wrote a label for is
 * still something that happened to this booking, and silently dropping it
 * would make the trail lie by omission.
 */
function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/^(booking|payment)\./, '').replace(/_/g, ' ')
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

        return (
          <li
            key={event.id}
            className="grid gap-xxs border-b border-divider pb-md last:border-0 last:pb-0"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-sm">
              <p className="text-body-sm-strong text-foreground">{actionLabel(event.action)}</p>
              <p className="text-caption text-muted-foreground tabular-nums">
                {formatTimestamp(event.at)}
              </p>
            </div>
            <p className="text-caption text-muted-foreground">
              {event.actorId
                ? (actorNames.get(event.actorId) ?? 'A former staff member')
                : 'System'}
            </p>
            {reason ? <p className="mt-xxs text-body-sm text-copy">“{reason}”</p> : null}
          </li>
        )
      })}
    </ol>
  )
}
