import { EventHistory } from '@/components/portal/event-history'
import type { AuditEvent } from '@/lib/db/audit'

/**
 * Everything recorded against this booking, newest first.
 *
 * This is the "who, what, when" half of capability B3. The trail's shape —
 * actor mark, verb, timestamp, quoted reason — is `EventHistory`, which the
 * units board's history shares; what stays here is the vocabulary, for the same
 * reason the status labels live in `booking-status-badge`: one table, one
 * place, and a booking's verbs are not a unit's.
 *
 * Events on the booking's **payments** are folded in by the page. They carry
 * `entity_type = 'payment'`, so a trail built only from the booking's own
 * events would show it reaching `confirmed` with no record of what was
 * actually banked — the lie by omission this component is written to avoid.
 */

const ACTION_LABELS: Record<string, string> = {
  'booking.amended': 'Amended',
  // Its own row rather than a detail inside the amendment, because "show me
  // every discount given" is a question about this verb alone.
  'booking.discounted': 'Discount changed',
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
  // The deposit's own verbs, folded in by the page for the reason the
  // payments' are: a booking whose trail shows a guest checking in with no
  // record of the money taken is a trail lying by omission. Its charges and
  // its inspection stay on the deposit's own screen — that is a second record
  // with a history of its own, and repeating it here would make a booking's
  // trail the whole ledger.
  'deposit.collected': 'Security deposit collected',
  'deposit.release_approved': 'Deposit release approved',
  'deposit.owed_settled': 'Amount owed on the deposit settled',
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
 * One verb, three things that happened.
 *
 * `booking.discounted` is written when a discount is given, when one is
 * changed, and when one is taken away — deliberately, so "show me every
 * discount given this month" stays a lookup on a single action. That makes it
 * the second label that cannot come from the verb alone: "Discount changed"
 * against a removal is not a clumsy phrasing, it is the trail describing an
 * event that did not happen.
 *
 * Which one it was is in the payload. `before` is null on creation, and on an
 * amendment it carries the previous instruction — whose `kind` is null when
 * there was no discount before. `after.kind` is null when the discount has
 * been removed.
 */
function discountLabel(event: AuditEvent): string {
  const had = Boolean(event.before?.kind)
  const has = Boolean(event.after?.kind)

  if (!had) {
    return 'Discount applied'
  }

  return has ? 'Discount changed' : 'Discount removed'
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

  if (event.action === 'booking.discounted') {
    return discountLabel(event)
  }

  return (
    ACTION_LABELS[event.action] ??
    event.action.replace(/^(booking|payment|deposit)\./, '').replace(/_/g, ' ')
  )
}

interface BookingHistoryProps {
  events: readonly AuditEvent[]
  /** Display names by `auth.users.id`; an actor with no name renders as system. */
  actorNames: ReadonlyMap<string, string>
}

export function BookingHistory({ events, actorNames }: BookingHistoryProps) {
  return (
    <EventHistory
      events={events}
      actorNames={actorNames}
      label={actionLabel}
      emptyMessage="Nothing recorded against this booking yet."
    />
  )
}
