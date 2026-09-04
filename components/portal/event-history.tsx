import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/components/ui/avatar-identity'
import { InlinePagination } from '@/components/ui/pagination-inline'
import type { AuditEvent, AuditEventPage } from '@/lib/db/audit'
import { formatTimestamp } from '@/lib/domain/dates'

import { HISTORY_PAGE_SIZE, historyHref } from './history-page'

/**
 * An audit trail, newest first, one page at a time.
 *
 * The per-record view of what capability F4 promises property-wide. It reads
 * `audit_event` directly rather than any status field, which is the point of
 * architecture.md §4 keeping approvals as events: a flag can say a booking was
 * cancelled, but only an event can say who cancelled it, when, and why.
 *
 * ── What this owns, and what it does not ──────────────────────────────────
 *
 * It owns the *shape* of a trail — the actor mark, the verb, the timestamp, the
 * quoted reason, and the pages — and nothing about what the verbs mean. Each
 * record type has its own vocabulary and passes it in as `label`: a booking's
 * events read "Checked in", a unit's read "Taken out of service", and folding
 * both into one map here would make this component know about every entity in
 * the product.
 *
 * It became shared when the units board gave the portal a second kind of
 * record with a history, which is the point `booking-history.tsx` said it
 * would — not before.
 *
 * ── Paged, always ──────────────────────────────────────────────────────────
 *
 * Every trail is paged the same way, at `HISTORY_PAGE_SIZE`, in the URL — see
 * `history-page.ts`. The control only appears when there is a second page, so
 * a booking with six events looks exactly as it did before there were pages.
 */

interface EventHistoryProps {
  /** One page of the trail, with the length of the whole — never the whole thing. */
  history: AuditEventPage
  /** The record's own address, which page 1 of its history shares. */
  path: string
  /** Display names by `auth.users.id`; an actor with no name renders as system. */
  actorNames: ReadonlyMap<string, string>
  /** How this record type names each verb. */
  label: (event: AuditEvent) => string
  /** What to say when nothing has happened yet. */
  emptyMessage: string
}

export function EventHistory({
  history,
  path,
  actorNames,
  label,
  emptyMessage,
}: EventHistoryProps) {
  const { events, total, page } = history

  if (events.length === 0) {
    return <p className="text-body-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="grid gap-md">
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
                  <p className="text-body-sm-strong text-foreground">{label(event)}</p>
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

      <InlinePagination
        page={page}
        pageSize={HISTORY_PAGE_SIZE}
        total={total}
        hrefFor={(target) => historyHref(path, target)}
        label="History pages"
        itemLabel="events"
      />
    </div>
  )
}

/** The typed note a staff member left, when the action asked for one. */
function reasonOf(event: AuditEvent): string | null {
  const reason = event.after?.reason

  return typeof reason === 'string' && reason.length > 0 ? reason : null
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
