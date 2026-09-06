import { formatStayRange, type StayDate, type StayWindow } from '@/lib/domain/dates'
import type { Cents } from '@/lib/domain/money'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'

/**
 * Cash banked against a business day (capability E4, prd.md §10.5).
 *
 * **List and record, and deliberately nothing else.** A banking is a physical
 * act with a witness, so editing one rewrites what somebody says they did: a
 * correction is a second entry, and the day's variance moves with it. That is
 * a product rule rather than a trigger — the position lib/db/notes.ts and the
 * inspection take — and this module is where it is kept. Adding an update or a
 * delete here is the change that breaks it, which is why there is no private
 * helper waiting to be exported.
 *
 * What a day reconciles to is not read from here at all: it is derived from
 * these rows, the day's cash payments and its deposits, by
 * lib/domain/reports/cash-up.ts.
 */

export interface CashBanking {
  id: string
  /** The Brunei day the cash was taken, not the day it reached the bank. */
  businessDate: StayDate
  amount: Cents
  note: string | null
  bankedBy: string | null
  bankedAt: string
}

interface CashBankingRow {
  id: string
  business_date: StayDate
  amount_cents: number
  note: string | null
  banked_by: string | null
  banked_at: string
}

const COLUMNS = 'id, business_date, amount_cents, note, banked_by, banked_at'

function toBanking(row: CashBankingRow): CashBanking {
  return {
    id: row.id,
    businessDate: row.business_date,
    amount: row.amount_cents,
    note: row.note,
    bankedBy: row.banked_by,
    bankedAt: row.banked_at,
  }
}

/**
 * The bankings filed against a window of days, oldest first.
 *
 * Plain dates here, not instants: `business_date` is a `date` column — the day
 * somebody chose, not a moment — so it is the one comparison in this slice
 * that needs no timezone conversion.
 */
export async function listCashBankings(window: StayWindow): Promise<readonly CashBanking[]> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('cash_banking')
    .select(COLUMNS)
    .eq('property_id', propertyId)
    .gte('business_date', window.from)
    .lte('business_date', window.to)
    .order('business_date', { ascending: true })
    .order('banked_at', { ascending: true })

  if (error) {
    throw new Error(`Could not read what has been banked: ${error.message}`)
  }

  return (data as CashBankingRow[]).map(toBanking)
}

export type CashBankingErrorCode =
  'date_required' | 'future_date' | 'invalid_amount' | 'note_too_long' | 'not_found'

export interface CashBankingError {
  code: CashBankingErrorCode
  message: string
}

export type CashBankingResult =
  { ok: true; bankingId: string } | { ok: false; error: CashBankingError }

interface RpcRefusal {
  ok: false
  error: CashBankingErrorCode
  today?: StayDate
}

/**
 * Records that cash was taken to the bank.
 *
 * The refusals are the database's, not this module's: `record_cash_banking()`
 * checks the business date against today in the property's own timezone, which
 * is a question a server running in UTC cannot answer for itself for the first
 * eight hours of every Brunei day.
 */
export async function recordCashBanking(input: {
  businessDate: StayDate
  amount: Cents
  note: string | null
  actorId: string | null
}): Promise<CashBankingResult> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient().rpc('record_cash_banking', {
    p_property_id: propertyId,
    p_business_date: input.businessDate,
    p_amount_cents: input.amount,
    p_note: input.note,
    p_actor_id: input.actorId,
  })

  if (error) {
    throw new Error(`Could not record the banking: ${error.message}`)
  }

  const result = data as { ok: true; banking_id: string } | RpcRefusal

  if (!result.ok) {
    return { ok: false, error: describeBankingFailure(result) }
  }

  return { ok: true, bankingId: result.banking_id }
}

function describeBankingFailure(result: RpcRefusal): CashBankingError {
  switch (result.error) {
    case 'date_required':
      return { code: result.error, message: 'Pick the day the cash was taken.' }
    case 'future_date':
      return {
        code: result.error,
        message: result.today
          ? `Cash cannot be banked against a day that has not happened. Today is ${formatStayRange(result.today, result.today)}.`
          : 'Cash cannot be banked against a day that has not happened.',
      }
    case 'invalid_amount':
      return { code: result.error, message: 'Enter how much went to the bank.' }
    case 'note_too_long':
      return { code: result.error, message: 'Keep the note under 280 characters.' }
    default:
      return { code: 'not_found', message: 'That property no longer exists.' }
  }
}
