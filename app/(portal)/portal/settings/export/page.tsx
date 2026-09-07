import type { Metadata } from 'next'

import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderRow,
  TableHeader,
  TableRow,
  TableRowHead,
} from '@/components/ui/table'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { EXPORT_TABLES } from '@/lib/db/export'

export const metadata: Metadata = {
  title: 'Export data',
}

// The counts are read on every visit, so a stale page cannot promise rows that
// are no longer there.
export const dynamic = 'force-dynamic'

/**
 * Taking the business's data out (capability F5).
 *
 * scope-of-capabilities.md F5 is worded as a promise rather than a feature —
 * "export all business data at any time in a usable format — the data is
 * yours" — and prd.md §19 makes it an ownership term. So the screen is a list
 * of everything, with no period, no filter and nothing withheld beyond what
 * §8.1 counts as the content of an identity document.
 *
 * One file per table rather than one archive: the person downloading these
 * opens a spreadsheet.
 */
export default async function ExportDataPage() {
  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'config.manage')) {
    return (
      <>
        <PageHeader
          title="Export data"
          description="Every table the business runs on, as a spreadsheet."
        />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Exporting the business data needs the "Edit settings, roles & the unit registry" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const tables = await Promise.all(
    EXPORT_TABLES.map(async (table) => ({
      id: table.id,
      label: table.label,
      description: table.description,
      rows: await table.count(),
    })),
  )

  return (
    <>
      <PageHeader
        title="Export data"
        description="Every table the business runs on, as a spreadsheet. The data is yours — take a copy whenever you want one."
      />

      <section aria-label="Tables to export" className="mt-xl">
        <Table scrollX>
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Table</TableHead>
              <TableHead>What it holds</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="w-[1%]" />
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {tables.map((table) => (
              <TableRow key={table.id}>
                <TableRowHead>{table.label}</TableRowHead>
                <TableCell className="text-muted-foreground">{table.description}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {table.rows.toLocaleString('en-GB')}
                </TableCell>
                <TableCell>
                  {/*
                    A plain anchor rather than `next/link`: this is a file with a
                    name on the end of it, and it has to survive a middle-click
                    and a right-click. `next/link` would also prefetch it on
                    hover, which would build the whole table for nothing.
                  */}
                  <Button asChild variant="tertiary" className="shrink-0 whitespace-nowrap">
                    <a href={`/portal/settings/export/download?table=${table.id}`}>Download CSV</a>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <Notice className="mt-xl" placement="page">
        Files open in Excel or Numbers as they are. Amounts are plain numbers with the currency in
        the column heading, so a column of them adds up. Documents export as a record of what was
        held — never the files themselves, and an identity document’s filename is left out because
        it usually carries the guest’s name and IC number.
      </Notice>
    </>
  )
}
