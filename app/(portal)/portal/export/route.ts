import { NextResponse } from 'next/server'

import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { exportTableById } from '@/lib/db/export'
import { exportFilename, toCsv } from '@/lib/domain/csv'
import { todayInBrunei } from '@/lib/domain/dates'

/**
 * One table of the business, as a CSV file (capability F5).
 *
 * A route handler rather than a server action, for the reason the reports
 * export is one (architecture.md §2): the response IS a file with a name on it,
 * which an action cannot return. It sits inside `/portal`, so `proxy.ts` has
 * already refused a caller with no session, and then re-checks the permission —
 * a URL is guessable where a link on a gated screen is not.
 *
 * ── One route, no screen ───────────────────────────────────────────────────
 *
 * It used to hang under a *Export data* screen in Admin that listed all
 * seventeen tables with a row each. The screen is gone: every table is now
 * downloaded from the screen it belongs to — bookings from the register,
 * deposits from the ledger — because the person who wants a spreadsheet of
 * the bookings is looking at the bookings, not hunting through settings for a
 * list of table names. F5 is unchanged and still whole: the grouping in
 * `EXPORT_GROUPS` gives all seventeen a home, and a test holds it to that.
 *
 * **404 rather than 403** to a reader without `config.manage`, exactly as the
 * reports export answers: "forbidden" would confirm to somebody who may not see
 * the business's data that there is business data to see.
 *
 * ── Not logged ─────────────────────────────────────────────────────────────
 *
 * A download writes no audit event. That is the owner's decision, taken
 * deliberately: these are his own screens, opened by him, to take his own data
 * — and a row per click would bury the trail that F4 exists to make readable.
 * Reading a guest's identity document IS logged (G3), and that is the promise
 * that mattered; it is a different act by a different person for a different
 * reason.
 *
 * ── Unpaged ────────────────────────────────────────────────────────────────
 *
 * The whole table, however long. A page boundary is a reading convenience and a
 * spreadsheet has no use for one — the reads behind this are chunked so
 * PostgREST's row cap cannot truncate the file silently.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'config.manage')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const table = exportTableById(new URL(request.url).searchParams.get('table') ?? '')

  if (!table) {
    return new NextResponse('Unknown table', { status: 400 })
  }

  const document = await table.document()

  return new NextResponse(`﻿${toCsv(document.headers, document.rows)}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFilename(table.id, todayInBrunei())}"`,
      // The file is the data as it stands right now; a cached copy would be a
      // different answer to the same question.
      'cache-control': 'no-store',
    },
  })
}
