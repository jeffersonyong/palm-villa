import { EventHistory } from '@/components/portal/event-history'
import type { AuditEventPage } from '@/lib/db/audit'
import { describeAuditEvent } from '@/lib/domain/audit-label'

/**
 * Everything recorded against this deposit, newest first.
 *
 * Three entity types are folded into one trail by the page: the deposit, the
 * inspection that allowed its release, and every charge raised or waived
 * against it. They are separate entities on purpose — `charge.created` is a
 * lookup on one verb, which is what makes "every charge raised this month"
 * answerable — but they are one story, and a reader following a disputed
 * deduction should not have to visit three screens to assemble it.
 *
 * **Figures are read out of the event, not off the row**, which is why the
 * vocabulary reads the payload: prd.md §11's whole point is that an approval is
 * a recorded event, and the deposit may have been added to since. What a line
 * has to say is what was true when somebody signed it.
 *
 * That vocabulary is now `describeAuditEvent`, shared with every other trail —
 * this screen's wording is the one that survived the merge, because a figure in
 * the sentence is the half a reader came for.
 */

interface DepositHistoryProps {
  history: AuditEventPage
  /** The deposit's own address, which page 1 of its history shares. */
  path: string
  /** Display names by `auth.users.id`; an actor with no name renders as system. */
  actorNames: ReadonlyMap<string, string>
}

export function DepositHistory({ history, path, actorNames }: DepositHistoryProps) {
  return (
    <EventHistory
      history={history}
      path={path}
      actorNames={actorNames}
      label={describeAuditEvent}
      emptyMessage="Nothing recorded against this deposit yet."
    />
  )
}
