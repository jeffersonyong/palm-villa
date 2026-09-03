import { EventHistory } from '@/components/portal/event-history'
import type { AuditEvent } from '@/lib/db/audit'
import { INSPECTION_OUTCOME_LABELS, isInspectionOutcome } from '@/lib/domain/inspection'
import { formatCents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/domain/payment'

/**
 * Everything recorded against this deposit, newest first.
 *
 * The third history on `EventHistory`, after a booking's and a unit's — which
 * is the seam that component was extracted for. What stays here is the
 * vocabulary, because a deposit's verbs are not a booking's.
 *
 * Three entity types are folded into one trail by the page: the deposit, the
 * inspection that allowed its release, and every charge raised or waived
 * against it. They are separate entities on purpose — `charge.created` is a
 * lookup on one verb, which is what makes "every charge raised this month"
 * answerable — but they are one story, and a reader following a disputed
 * deduction should not have to visit three screens to assemble it.
 *
 * **Figures are read out of the event, not off the row.** prd.md §11's whole
 * point is that an approval is a recorded event: the deposit may have been
 * added to since, and what this line has to say is what was true when somebody
 * signed it.
 */

const ACTION_LABELS: Record<string, string> = {
  'deposit.collected': 'Security deposit collected',
  'deposit.release_approved': 'Release approved',
  'deposit.owed_settled': 'Amount owed settled',
  'inspection.recorded': 'Inspection recorded',
  'charge.created': 'Charge added',
  'charge.waived': 'Charge waived',
}

function cents(value: unknown): string | null {
  return typeof value === 'number' ? formatCents(value) : null
}

function methodLabel(value: unknown): string | null {
  return typeof value === 'string' && value in PAYMENT_METHOD_LABELS
    ? PAYMENT_METHOD_LABELS[value as PaymentMethod].toLowerCase()
    : null
}

/**
 * Four of the six verbs carry a figure, and the figure is the point of the
 * line. "Charge added" says less than half of what "Charge added — BND 130.00"
 * says, and the trail is read to answer questions about amounts.
 */
function actionLabel(event: AuditEvent): string {
  const amount = cents(event.after?.amount_cents)

  switch (event.action) {
    case 'deposit.collected': {
      const method = methodLabel(event.after?.method)

      return `Security deposit collected${amount ? ` — BND ${amount}` : ''}${method ? `, in ${method}` : ''}`
    }

    case 'deposit.release_approved': {
      const owed = cents(event.after?.owed_cents)
      const returned = cents(event.after?.released_amount_cents)

      if (owed !== null && event.after?.owed_cents !== 0) {
        return `Release approved — BND ${owed} owed by the guest`
      }

      return returned === null ? 'Release approved' : `Release approved — BND ${returned} returned`
    }

    case 'deposit.owed_settled': {
      const owed = cents(event.after?.owed_cents)
      const method = methodLabel(event.after?.method)

      return `Amount owed settled${owed ? ` — BND ${owed}` : ''}${method ? `, in ${method}` : ''}`
    }

    case 'inspection.recorded': {
      const outcome = event.after?.outcome

      return typeof outcome === 'string' && isInspectionOutcome(outcome)
        ? `Inspection recorded — ${INSPECTION_OUTCOME_LABELS[outcome].toLowerCase()}`
        : 'Inspection recorded'
    }

    case 'charge.created':
      return amount === null ? 'Charge added' : `Charge added — BND ${amount}`

    case 'charge.waived':
      return amount === null ? 'Charge waived' : `Charge waived — BND ${amount}`

    default:
      // An unmapped verb still renders, as itself. An event nobody wrote a
      // label for is still something that happened to this deposit, and
      // dropping it would make the trail lie by omission.
      return ACTION_LABELS[event.action] ?? event.action.replace(/_/g, ' ')
  }
}

interface DepositHistoryProps {
  events: readonly AuditEvent[]
  /** Display names by `auth.users.id`; an actor with no name renders as system. */
  actorNames: ReadonlyMap<string, string>
}

export function DepositHistory({ events, actorNames }: DepositHistoryProps) {
  return (
    <EventHistory
      events={events}
      actorNames={actorNames}
      label={actionLabel}
      emptyMessage="Nothing recorded against this deposit yet."
    />
  )
}
