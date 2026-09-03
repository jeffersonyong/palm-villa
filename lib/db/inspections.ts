import type { InspectionOutcome } from '@/lib/domain/inspection'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'
import type { DepositWriteError, DepositWriteResult } from './deposits'

/**
 * Unit inspections (capability C2, portal half).
 *
 * prd.md §11 [C]: "Housekeeping inspects the unit after check-out. Once
 * condition is confirmed, deposit release is authorised by the approving
 * role." This module writes the first half. The second is
 * `approveDepositRelease()` in ./deposits.ts, behind a different permission,
 * because §4 [C] puts the two with different people on purpose.
 *
 * The write is keyed by booking and stored against that booking's occupancy —
 * the shape prd.md §6.2 sketches, so a lease that ends and is inspected needs
 * no second table when phase three arrives. Screens hold a booking reference,
 * so the seam is here rather than in every caller.
 *
 * **Read and write, and nothing else.** There is no update and no delete, the
 * position `lib/db/notes.ts` takes: an inspection is what somebody found, and
 * a release was approved against it. Correcting one should be a deliberate
 * addition to this module rather than something a screen can already do.
 *
 * No photographs. See the note on the table.
 */

export interface Inspection {
  id: string
  occupancyId: string
  outcome: InspectionOutcome
  notes: string | null
  inspectedBy: string | null
  inspectedAt: string
}

interface InspectionRow {
  id: string
  occupancy_id: string
  outcome: string
  notes: string | null
  inspected_by: string | null
  inspected_at: string
}

function toInspection(row: InspectionRow): Inspection {
  return {
    id: row.id,
    occupancyId: row.occupancy_id,
    outcome: row.outcome as InspectionOutcome,
    notes: row.notes,
    inspectedBy: row.inspected_by,
    inspectedAt: row.inspected_at,
  }
}

/**
 * The inspection recorded against a booking's stay, if there is one.
 *
 * `deposit_summary` already carries this for any booking that has a deposit,
 * so this exists for the case it cannot answer: a stay with no deposit — one
 * quoting none, or a booking checked in before this slice existed — which can
 * still have been inspected.
 */
export async function getInspectionForBooking(bookingId: string): Promise<Inspection | null> {
  const propertyId = await currentPropertyId()

  const { data: occupancy, error: occupancyError } = await dataClient()
    .from('occupancy')
    .select('id')
    .eq('property_id', propertyId)
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (occupancyError) {
    throw new Error(`Could not read the stay for booking ${bookingId}: ${occupancyError.message}`)
  }

  if (!occupancy) {
    return null
  }

  const { data, error } = await dataClient()
    .from('inspection')
    .select('id, occupancy_id, outcome, notes, inspected_by, inspected_at')
    .eq('property_id', propertyId)
    .eq('occupancy_id', (occupancy as { id: string }).id)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read the inspection: ${error.message}`)
  }

  return data ? toInspection(data as unknown as InspectionRow) : null
}

interface RpcRefusal {
  ok: false
  error: string
  [key: string]: unknown
}

export async function recordInspection(input: {
  bookingId: string
  outcome: InspectionOutcome
  notes: string | null
  actorId: string | null
}): Promise<DepositWriteResult<{ inspectionId: string }>> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('record_inspection', {
    p_property_id: propertyId,
    p_booking_id: input.bookingId,
    p_outcome: input.outcome,
    p_notes: input.notes,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not record the inspection: ${error.message}`)
  }

  const result = data as { ok: true; inspection_id: string } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeInspectionFailure(result) }
  }

  return { ok: true, inspectionId: result.inspection_id }
}

function describeInspectionFailure(result: RpcRefusal): DepositWriteError {
  switch (result.error) {
    case 'booking_not_completed':
      return {
        code: result.error,
        message:
          'This stay has not ended yet. A unit is inspected after the guest has checked out.',
      }
    case 'already_inspected':
      return { code: result.error, message: 'This stay has already been inspected.' }
    case 'no_occupancy':
      return {
        code: result.error,
        message: 'This booking occupies no unit, so there is nothing to inspect.',
      }
    case 'notes_required':
      return {
        code: result.error,
        message: 'Say what was found. A charge against this deposit will be read against it.',
      }
    case 'invalid_outcome':
      return { code: result.error, message: 'Choose how the unit was found.' }
    default:
      return { code: result.error, message: 'That booking no longer exists.' }
  }
}
