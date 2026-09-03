import type { Cents } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'
import type { DepositWriteError, DepositWriteResult } from './deposits'

/**
 * Itemised charges against a deposit (capability E3).
 *
 * prd.md §11 requirement 3: "Charges are itemised with a reason and an
 * author." Both are columns, and the reason is required by the database rather
 * than only by the form — this is somebody's money being kept, and the first
 * question asked about it later is what for.
 *
 * A waived charge stays. `charge.waive` is its own permission (prd.md §4,
 * Finance), so waiving is a decision somebody took, and a decision that leaves
 * no row is a decision nobody can review. It is excluded from the arithmetic
 * by `activeChargesTotal()` and shown on the screen with its reason.
 */

export interface ChargeWaiver {
  at: string
  by: string | null
  reason: string
}

export interface DepositCharge {
  id: string
  depositId: string
  amount: Cents
  reason: string
  createdBy: string | null
  createdAt: string
  /** Null while the charge stands. */
  waived: ChargeWaiver | null
}

interface DepositChargeRow {
  id: string
  deposit_id: string
  amount_cents: number
  reason: string
  created_by: string | null
  created_at: string
  waived_at: string | null
  waived_by: string | null
  waive_reason: string | null
}

const CHARGE_COLUMNS =
  'id, deposit_id, amount_cents, reason, created_by, created_at, waived_at, waived_by, waive_reason'

function toCharge(row: DepositChargeRow): DepositCharge {
  return {
    id: row.id,
    depositId: row.deposit_id,
    amount: row.amount_cents,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    waived:
      row.waived_at === null || row.waive_reason === null
        ? null
        : { at: row.waived_at, by: row.waived_by, reason: row.waive_reason },
  }
}

/**
 * Every charge against a deposit, oldest first.
 *
 * Ascending, unlike every other list in the portal, because this one is a bill:
 * it is read down the page and totalled at the bottom, and the order things
 * were found in is the order they are explained in.
 */
export async function listDepositCharges(depositId: string): Promise<readonly DepositCharge[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('deposit_charge')
    .select(CHARGE_COLUMNS)
    .eq('property_id', propertyId)
    .eq('deposit_id', depositId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    throw new Error(`Could not read the charges against this deposit: ${error.message}`)
  }

  return (data as unknown as DepositChargeRow[]).map(toCharge)
}

interface RpcRefusal {
  ok: false
  error: string
  [key: string]: unknown
}

export async function addDepositCharge(input: {
  depositId: string
  amount: Cents
  reason: string
  actorId: string | null
}): Promise<DepositWriteResult<{ chargeId: string }>> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('add_deposit_charge', {
    p_property_id: propertyId,
    p_deposit_id: input.depositId,
    p_amount_cents: input.amount,
    p_reason: input.reason,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not record the charge: ${error.message}`)
  }

  const result = data as { ok: true; charge_id: string } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeChargeFailure(result) }
  }

  return { ok: true, chargeId: result.charge_id }
}

export async function waiveDepositCharge(input: {
  chargeId: string
  reason: string
  actorId: string | null
}): Promise<DepositWriteResult> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('waive_deposit_charge', {
    p_property_id: propertyId,
    p_charge_id: input.chargeId,
    p_reason: input.reason,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not waive the charge: ${error.message}`)
  }

  const result = data as { ok: true } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeChargeFailure(result) }
  }

  return { ok: true }
}

function describeChargeFailure(result: RpcRefusal): DepositWriteError {
  switch (result.error) {
    case 'already_released':
      return {
        code: result.error,
        message:
          'This deposit has already been released, so its charges are closed. The statement is what was approved.',
      }
    case 'already_waived':
      return { code: result.error, message: 'This charge has already been waived.' }
    case 'invalid_amount':
      return { code: result.error, message: 'Enter an amount greater than zero.' }
    case 'reason_required':
      return { code: result.error, message: 'Say what this is for.' }
    default:
      return { code: result.error, message: 'That deposit no longer exists.' }
  }
}
