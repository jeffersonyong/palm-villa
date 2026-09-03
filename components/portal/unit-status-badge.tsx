import type { StatusTone } from '@/components/portal/status-tone'
import { Badge } from '@/components/ui/badge'
import { UNIT_STATUS_LABELS, type UnitStatus } from '@/lib/domain/unit-status'

/**
 * Unit status, in the portal's status language (capability B8).
 *
 * The status-to-tone mapping lives here and only here, the same discipline
 * `booking-status-badge.tsx` follows: a second copy of this table is how a
 * screen quietly invents its own colour meaning.
 *
 * ── The mapping, and why available is not green ───────────────────────────
 *
 * A unit's state is mostly its occupancy's state, so most of these are the
 * booking tones read through: `held` keeps warning, `booked` keeps positive,
 * `occupied` keeps the brand pair that `checked_in` carries, because it is
 * literally the same fact seen from the unit's side.
 *
 * `available` takes **neutral**, which is the one that looks wrong and is not.
 * Availability is the resting state of a building, not an outcome — forty of
 * forty-eight units are available on an ordinary morning, and forty mint chips
 * is a wall of colour in which the four rows that need attention disappear.
 * Colour is spent on the exceptions. It is also the reason design.md forbids
 * decorative status: a tint here has to mean "look at this".
 *
 * `leased_long_term` is neutral for the same reason — a lease is a settled
 * arrangement, not a thing to act on — and `out_of_service` takes negative,
 * because a unit nobody can be put in is the one state on this board that
 * costs money until somebody fixes it.
 *
 * No fifth tone is introduced. design.md builds each chip as a 10% mix of a mid
 * hue under `*-deep` text, and there is no `info` pair to reach for; inventing
 * one for a status is exactly what §Color roles refuses.
 */

const STATUS_TONES = {
  available: 'neutral',
  held: 'warning',
  booked: 'positive',
  occupied: 'active',
  leased_long_term: 'neutral',
  out_of_service: 'negative',
} as const satisfies Record<UnitStatus, StatusTone>

export type UnitStatusTone = (typeof STATUS_TONES)[UnitStatus]

/**
 * The tone a unit status carries, for the places that show its colour at
 * something other than badge scale — the filter row's option dots and the stat
 * strip's tile marks. Read off the same table as the badge rather than
 * restated, which is the whole point of the table being here.
 */
export function unitStatusTone(status: UnitStatus): UnitStatusTone {
  return STATUS_TONES[status]
}

export function UnitStatusBadge({ status }: { status: UnitStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{UNIT_STATUS_LABELS[status]}</Badge>
}
