import { NextResponse } from 'next/server'

import { overlapRangeOf, readChoices } from '@/components/portal/list-params'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { cashOnHandBefore, listCashBankings } from '@/lib/db/cash-banking'
import { listDepositsCollectedBetween } from '@/lib/db/deposits'
import { getUnitTypes, getUnits } from '@/lib/db/inventory'
import { listPayments } from '@/lib/db/payments'
import { listOccupanciesOverlapping, listRevenuePayments } from '@/lib/db/reports'
import { csvFilename, toCsv, type CsvValue } from '@/lib/domain/csv'
import { bruneiWindowBounds, todayInBrunei, type StayWindow } from '@/lib/domain/dates'
import { centsToDecimal } from '@/lib/domain/money'
import {
  CASH_UP_STATES,
  CASH_UP_STATE_LABELS,
  cashUpDays,
  clampWindowToToday,
  isCashUpState,
} from '@/lib/domain/reports/cash-up'
import { occupancyByType, occupancyByUnit } from '@/lib/domain/reports/occupancy'
import { revenueByStream, revenueInWindow } from '@/lib/domain/reports/revenue'
import { BOOKING_STREAM_LABELS } from '@/lib/domain/stream'

import { readReportWindow } from '../report-window'

/**
 * Downloading a report as CSV (capability E5).
 *
 * A route handler rather than a server action, and architecture.md §2 sanctions
 * exactly that — "route handlers only where a server action doesn't fit". A
 * server action returns a value into a React tree; a download is a response
 * with its own content type and filename, reached by an ordinary link somebody
 * can middle-click. It sits in the portal's URL space so `proxy.ts` has already
 * refused anyone with no session, and it re-checks `report.view` because a URL
 * is guessable in a way a link on a gated screen is not.
 *
 * **The file is the screen.** Every table reads through the same `lib/db`
 * readers and the same pure functions the page uses, with the period and
 * filters taken off the same query string — so a download cannot quietly
 * disagree with what somebody was looking at when they asked for it. That is
 * why this is one handler over four reports rather than four endpoints: the
 * period, the permission and the response shape are common, and only the rows
 * differ.
 *
 * **Not paged.** A page boundary is a reading convenience; a spreadsheet has no
 * use for one, and an export that stopped at row 25 would be a trap. The period
 * bounds this, as it bounds the screen.
 *
 * **A missing report is a 404 and a bad one a 400**, but a reader without
 * `report.view` gets the 404 too: an endpoint that answered "forbidden" would
 * confirm the report exists to somebody who may not see it.
 *
 * The BOM is Excel's: without it Excel on Windows reads a UTF-8 file as the
 * system codepage and mangles the dash in a guest's name. Every other reader
 * skips it. `no-store`, because the numbers move whenever a payment is
 * verified.
 */

export const dynamic = 'force-dynamic'

type ReportTable = 'revenue' | 'occupancy-by-type' | 'occupancy-by-unit' | 'cash-up'

const TABLES: readonly ReportTable[] = [
  'revenue',
  'occupancy-by-type',
  'occupancy-by-unit',
  'cash-up',
]

function isReportTable(candidate: string): candidate is ReportTable {
  return (TABLES as readonly string[]).includes(candidate)
}

interface CsvDocument {
  headers: readonly string[]
  rows: readonly (readonly CsvValue[])[]
}

export async function GET(request: Request): Promise<NextResponse> {
  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'report.view')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const params = new URL(request.url).searchParams
  const table = params.get('table') ?? ''

  if (!isReportTable(table)) {
    return new NextResponse('Unknown report', { status: 400 })
  }

  const today = todayInBrunei()
  const { window: requested } = readReportWindow(
    params.get('from') ?? undefined,
    params.get('to') ?? undefined,
    today,
  )

  // The cash-up cannot run past today, exactly as its screen cannot.
  const window = table === 'cash-up' ? clampWindowToToday(requested, today) : requested

  if (!window) {
    return new NextResponse('That period has not happened yet', { status: 400 })
  }

  const document = await build(table, window, params)

  return new NextResponse(`﻿${toCsv(document.headers, document.rows)}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${csvFilename(table, window.from, window.to)}"`,
      'cache-control': 'no-store',
    },
  })
}

async function build(
  table: ReportTable,
  window: StayWindow,
  params: URLSearchParams,
): Promise<CsvDocument> {
  if (table === 'revenue') {
    return buildRevenue(window)
  }

  if (table === 'cash-up') {
    return buildCashUp(window, params)
  }

  return buildOccupancy(table, window, params)
}

async function buildRevenue(window: StayWindow): Promise<CsvDocument> {
  const payments = await listRevenuePayments(window)
  const revenue = revenueByStream(revenueInWindow(payments, window))

  return {
    headers: ['Stream', 'Cash (BND)', 'Bank transfer (BND)', 'Total (BND)', 'Payments'],
    rows: [
      ...revenue.byStream.map((stream) => [
        BOOKING_STREAM_LABELS[stream.stream],
        centsToDecimal(stream.byMethod.cash),
        centsToDecimal(stream.byMethod.bank_transfer),
        centsToDecimal(stream.total),
        stream.count,
      ]),
      [
        'Total',
        centsToDecimal(revenue.byMethod.cash),
        centsToDecimal(revenue.byMethod.bank_transfer),
        centsToDecimal(revenue.total),
        revenue.count,
      ],
    ],
  }
}

async function buildOccupancy(
  table: 'occupancy-by-type' | 'occupancy-by-unit',
  window: StayWindow,
  params: URLSearchParams,
): Promise<CsvDocument> {
  const range = overlapRangeOf(window)
  const [occupancies, units, unitTypes] = await Promise.all([
    listOccupanciesOverlapping(range),
    getUnits(),
    getUnitTypes(),
  ])

  const byUnit = occupancyByUnit(units, occupancies, range)

  if (table === 'occupancy-by-type') {
    return {
      headers: ['Type', 'Units', 'Nights occupied', 'Nights available', 'Occupancy (%)'],
      rows: occupancyByType(unitTypes, byUnit, range).map((type) => [
        type.name,
        type.unitCount,
        type.occupiedNights,
        type.availableNights,
        percent(type.rate),
      ]),
    }
  }

  // The unit table carries its type filter into the file, because the file is
  // the screen: somebody who narrowed to the semi-detached asked for those.
  const chosen = readChoices(
    params.getAll('type'),
    unitTypes.map((type) => type.id),
    (candidate): candidate is string => unitTypes.some((type) => type.id === candidate),
  )
  const rows =
    chosen.length > 0 ? byUnit.filter((row) => chosen.includes(row.unit.unitTypeId)) : byUnit

  return {
    headers: ['Unit', 'Type', 'Nights occupied', 'Nights available', 'Occupancy (%)'],
    rows: rows.map((row) => [
      row.unit.ref,
      row.unit.unitTypeName,
      row.occupiedNights,
      row.availableNights,
      percent(row.rate),
    ]),
  }
}

async function buildCashUp(window: StayWindow, params: URLSearchParams): Promise<CsvDocument> {
  const bounds = bruneiWindowBounds(window)
  const [payments, deposits, bankings, opening] = await Promise.all([
    listPayments({ methods: ['cash'], collectedFrom: bounds.start, collectedBefore: bounds.end }),
    listDepositsCollectedBetween(bounds, 'cash'),
    listCashBankings(window),
    cashOnHandBefore(window.from),
  ])

  const days = cashUpDays(
    window,
    {
      payments: payments.flatMap((payment) =>
        payment.collectedAt
          ? [{ collectedAt: payment.collectedAt, amount: payment.amount ?? 0 }]
          : [],
      ),
      deposits: deposits.map((deposit) => ({
        collectedAt: deposit.collectedAt,
        amount: deposit.amount,
      })),
      bankings: bankings.map((banking) => ({
        businessDate: banking.businessDate,
        amount: banking.amount,
      })),
    },
    opening,
  )

  const chosen = readChoices(params.getAll('state'), CASH_UP_STATES, isCashUpState)
  const visible = chosen.length > 0 ? days.filter((day) => chosen.includes(day.state)) : days

  return {
    headers: [
      'Date',
      'Cash recorded (BND)',
      'Payments',
      'Deposits taken (BND)',
      'Banked (BND)',
      'Bankings',
      'Cash on hand (BND)',
      'State',
    ],
    // Oldest first, the direction a running balance is read in. The screen
    // shows newest first because a reader wants today at the top; a spreadsheet
    // column that counts forwards should count forwards.
    rows: [...visible]
      .reverse()
      .map((day) => [
        day.date,
        centsToDecimal(day.recorded),
        day.paymentCount,
        centsToDecimal(day.depositCash),
        centsToDecimal(day.banked),
        day.bankingCount,
        centsToDecimal(day.balance),
        CASH_UP_STATE_LABELS[day.state],
      ]),
  }
}

/** A rate as a bare number, or empty where there was nothing to occupy. */
function percent(rate: number | null): CsvValue {
  return rate === null ? null : Math.round(rate * 100)
}
