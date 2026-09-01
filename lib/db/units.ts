import {
  deriveUnitStatus,
  type OccupancyStatus,
  type UnitStatus,
} from '@/lib/domain/unit-status'
import type { RegistryPlan } from '@/lib/domain/unit-ref'
import type { StayDate } from '@/lib/domain/dates'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'

/**
 * The units board and the unit registry (capabilities B8, B9 and F6).
 *
 * architecture.md §2: all database access lives in `lib/db`. The reads here are
 * two RPCs — `unit_state()` and `unit_registry()` — rather than PostgREST
 * selects, because both answer a question that spans four tables and a lateral
 * join, and expressing that in filter syntax would mean several round trips per
 * unit.
 *
 * The status itself is **not** read from the database. `unit_state()` returns
 * facts and `deriveUnitStatus()` turns them into a label, for the reason
 * lib/domain/unit-status.ts sets out at length.
 */

export interface UnitOccupant {
  occupancyId: string
  /** `leased` for a long lease; otherwise the booking's own status. */
  status: OccupancyStatus
  /** The guest's name, or the tenant's for a lease. */
  name: string
  start: StayDate
  end: StayDate
  /** Null for a lease — a lease is not a booking and has no reference. */
  bookingReference: string | null
}

export interface UnitState {
  id: string
  ref: string
  /** The unit type's slug, as everywhere else in the app. */
  unitTypeId: string
  unitTypeName: string
  status: UnitStatus
  /** Set only when the status is `out_of_service`. */
  outOfService: { since: StayDate; reason: string } | null
  /**
   * Whoever is in the unit on the day asked about, if anyone.
   *
   * One object rather than five nullable fields, for the reason
   * architecture.md §5.3a gives about `Booking.stay`: they are one fact, and
   * one check should narrow all of them so no screen can read an occupant's
   * name while treating their dates as absent.
   */
  occupant: UnitOccupant | null
  /** The next stay's start, so a free unit can say when it stops being free. */
  nextStart: StayDate | null
  /**
   * A standing fact about the unit itself — the answer to open-questions.md
   * N18. Null when nobody has written one.
   */
  notes: string | null
}

interface UnitStateRow {
  unit_id: string
  ref: string
  unit_type_slug: string
  unit_type_name: string
  out_of_service_since: string | null
  out_of_service_reason: string | null
  notes: string | null
  occupancy_id: string | null
  occupancy_status: string | null
  occupancy_type: string | null
  start_date: string | null
  end_date: string | null
  occupant_name: string | null
  booking_id: string | null
  booking_reference: string | null
  next_start_date: string | null
}

/**
 * Every unit, and what it is doing on `asOf` — today by default, in the
 * property's own timezone, which the function reads from the property row.
 *
 * Unpaginated on purpose. The register is bounded by the building — fifty-odd
 * rows, and a building does not grow between requests — so the board filters
 * and counts in TypeScript over the whole set. That is the opposite of the
 * bookings register, which pages in SQL because bookings grow without limit.
 */
export async function listUnitStates(asOf?: StayDate): Promise<readonly UnitState[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('unit_state', {
    p_property_id: propertyId,
    p_as_of: asOf ?? null,
  })

  if (error) {
    throw new Error(`Could not read the state of the units: ${error.message}`)
  }

  return (data as UnitStateRow[]).map(toUnitState)
}

/** One unit by its human reference, or null. */
export async function getUnitStateByRef(
  ref: string,
  asOf?: StayDate,
): Promise<UnitState | null> {
  const units = await listUnitStates(asOf)

  return units.find((unit) => unit.ref === ref) ?? null
}

function toUnitState(row: UnitStateRow): UnitState {
  const outOfService =
    row.out_of_service_since !== null && row.out_of_service_reason !== null
      ? { since: row.out_of_service_since, reason: row.out_of_service_reason }
      : null

  // The occupancy's five fields travel together or not at all. The
  // `occupancy_id` check is what narrows the rest; a row with an id always
  // carries the others, because the lateral selects them from one row.
  const occupant: UnitOccupant | null =
    row.occupancy_id !== null &&
    row.occupancy_status !== null &&
    row.start_date !== null &&
    row.end_date !== null
      ? {
          occupancyId: row.occupancy_id,
          status: row.occupancy_status as OccupancyStatus,
          name: row.occupant_name ?? 'Unnamed',
          start: row.start_date,
          end: row.end_date,
          bookingReference: row.booking_reference,
        }
      : null

  return {
    id: row.unit_id,
    ref: row.ref,
    unitTypeId: row.unit_type_slug,
    unitTypeName: row.unit_type_name,
    status: deriveUnitStatus({
      outOfServiceSince: outOfService?.since ?? null,
      covering: occupant === null ? null : { status: occupant.status },
    }),
    outOfService,
    occupant,
    nextStart: row.next_start_date,
    notes: row.notes,
  }
}

// ── The registry (capability F6) ─────────────────────────────────────────────

export interface RegistryUnit {
  id: string
  ref: string
  unitTypeId: string
  outOfServiceSince: StayDate | null
  /** Whether anyone has ever occupied it — decides if it may be removed. */
  hasHistory: boolean
}

interface RegistryRow {
  unit_id: string
  ref: string
  unit_type_slug: string
  out_of_service_since: string | null
  has_history: boolean
}

/** Every unit as the registry editor sees it. */
export async function listUnitRegistry(): Promise<readonly RegistryUnit[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('unit_registry', {
    p_property_id: propertyId,
  })

  if (error) {
    throw new Error(`Could not read the unit registry: ${error.message}`)
  }

  return (data as RegistryRow[]).map((row) => ({
    id: row.unit_id,
    ref: row.ref,
    unitTypeId: row.unit_type_slug,
    outOfServiceSince: row.out_of_service_since,
    hasHistory: row.has_history,
  }))
}

// ── Writes ───────────────────────────────────────────────────────────────────
//
// Every one returns a refusal rather than throwing, so a server action can turn
// a domain answer into a sentence on a form and keep a thrown error meaning
// what it should: something broke.

export interface UnitWriteError {
  code: string
  message: string
}

export type UnitWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: UnitWriteError }

interface RpcRefusal {
  ok: false
  error: string
  [key: string]: unknown
}

export async function markUnitOutOfService(input: {
  unitId: string
  reason: string
  actorId: string | null
}): Promise<UnitWriteResult<{ since: StayDate }>> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('set_unit_out_of_service', {
    p_property_id: propertyId,
    p_unit_id: input.unitId,
    p_reason: input.reason,
    p_as_of: null,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not take the unit out of service: ${error.message}`)
  }

  const result = data as { ok: true; since: string } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeOutOfServiceFailure(result) }
  }

  return { ok: true, since: result.since }
}

function describeOutOfServiceFailure(result: RpcRefusal): UnitWriteError {
  if (result.error === 'unit_has_bookings') {
    const count = typeof result.bookings === 'number' ? result.bookings : 0
    const reference = typeof result.reference === 'string' ? result.reference : null
    const noun = count === 1 ? 'booking' : 'bookings'

    return {
      code: result.error,
      message:
        `This unit still has ${count} ${noun} on it` +
        (reference ? `, starting with ${reference}` : '') +
        '. Out of service means nobody can be put in it, so move or cancel those first.',
    }
  }

  if (result.error === 'already_out_of_service') {
    return { code: result.error, message: 'This unit is already out of service.' }
  }

  return { code: result.error, message: 'That unit no longer exists.' }
}

export async function returnUnitToService(input: {
  unitId: string
  actorId: string | null
}): Promise<UnitWriteResult> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('return_unit_to_service', {
    p_property_id: propertyId,
    p_unit_id: input.unitId,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not return the unit to service: ${error.message}`)
  }

  const result = data as { ok: true } | RpcRefusal

  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: result.error,
        message:
          result.error === 'not_out_of_service'
            ? 'This unit is already in service.'
            : 'That unit no longer exists.',
      },
    }
  }

  return { ok: true }
}

export async function markUnitLeased(input: {
  unitId: string
  occupantName: string
  start: StayDate
  end: StayDate
  actorId: string | null
}): Promise<UnitWriteResult<{ occupancyId: string }>> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('mark_unit_leased', {
    p_property_id: propertyId,
    p_unit_id: input.unitId,
    p_occupant_name: input.occupantName,
    p_start: input.start,
    p_end: input.end,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not mark the unit leased: ${error.message}`)
  }

  const result = data as { ok: true; occupancyId: string } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeLeaseFailure(result.error) }
  }

  return { ok: true, occupancyId: result.occupancyId }
}

function describeLeaseFailure(code: string): UnitWriteError {
  const messages: Record<string, string> = {
    unit_unavailable:
      'Something else already occupies this unit over part of those dates. Check the bookings on it first.',
    unit_out_of_service:
      'This unit is out of service, so nobody can be put in it. Return it to service first.',
    invalid_dates: 'A lease has to end after it starts.',
    not_found: 'That unit no longer exists.',
  }

  return { code, message: messages[code] ?? 'The lease could not be recorded.' }
}

export type LeaseEnding = 'ended' | 'cancelled'

export async function endUnitLease(input: {
  occupancyId: string
  end: StayDate
  actorId: string | null
}): Promise<UnitWriteResult<{ outcome: LeaseEnding }>> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('end_unit_lease', {
    p_property_id: propertyId,
    p_occupancy_id: input.occupancyId,
    p_end: input.end,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not end the lease: ${error.message}`)
  }

  const result = data as { ok: true; outcome: LeaseEnding } | RpcRefusal

  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: result.error,
        message:
          result.error === 'unit_out_of_service'
            ? 'This unit is out of service. Return it to service before changing its lease.'
            : 'That lease no longer exists.',
      },
    }
  }

  return { ok: true, outcome: result.outcome }
}

/**
 * Sets the unit's standing note (open-questions.md N18).
 *
 * Edited in place rather than appended to, because "the shower door sticks" is
 * a fact about the door that stops being true when somebody fixes it — see the
 * migration for why that is the opposite shape from a booking note. Nothing is
 * lost: every edit writes an audit event carrying the text before and after, so
 * the unit's own history is the thread this deliberately is not.
 */
export async function setUnitNotes(input: {
  unitId: string
  notes: string
  actorId: string | null
}): Promise<UnitWriteResult<{ changed: boolean }>> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('set_unit_notes', {
    p_property_id: propertyId,
    p_unit_id: input.unitId,
    p_notes: input.notes,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not save the note: ${error.message}`)
  }

  const result = data as { ok: true; changed: boolean } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: { code: result.error, message: 'That unit no longer exists.' } }
  }

  return { ok: true, changed: result.changed }
}

export interface RegistryOutcome {
  renamed: number
  added: number
  removed: number
}

/**
 * Applies a whole registry plan in one transaction (capability F6).
 *
 * The plan arrives whole because it is one change: a scheme that renames
 * thirty-six units and adds four is not forty decisions, and half of it
 * applied is a building nobody can recognise.
 */
export async function applyUnitRegistry(input: {
  plan: RegistryPlan
  actorId: string | null
}): Promise<UnitWriteResult<{ outcome: RegistryOutcome }>> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('apply_unit_registry', {
    p_property_id: propertyId,
    p_renames: input.plan.renames,
    p_additions: input.plan.additions,
    p_removals: input.plan.removals,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not update the unit registry: ${error.message}`)
  }

  const result = data as ({ ok: true } & RegistryOutcome) | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeRegistryFailure(result) }
  }

  return {
    ok: true,
    outcome: { renamed: result.renamed, added: result.added, removed: result.removed },
  }
}

function describeRegistryFailure(result: RpcRefusal): UnitWriteError {
  const ref = typeof result.ref === 'string' ? result.ref : null

  if (result.error === 'unit_has_history') {
    return {
      code: result.error,
      message:
        `${ref ?? 'That unit'} has hosted bookings and cannot be removed. ` +
        'Mark it out of service instead — it stops appearing in availability and the record stays.',
    }
  }

  if (result.error === 'changed') {
    return {
      code: result.error,
      message:
        'Someone else changed the units while you were working on this. Reload and try again.',
    }
  }

  if (result.error === 'duplicate_ref') {
    return {
      code: result.error,
      message: 'Two units would end up with the same name. Nothing was changed.',
    }
  }

  return { code: result.error, message: 'The units could not be updated. Nothing was changed.' }
}
