'use client'

import { ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ExportTableRef } from '@/lib/db/export'

/**
 * "Download CSV", at the top right of the table it takes (capability F5).
 *
 * The reports screens have exported themselves since E5, as a `tertiary`
 * button on a section's title line or at the actions end of its control row —
 * the one action that acts on the section as a whole. This is that button
 * everywhere else, so a spreadsheet is taken from the screen showing the
 * records rather than from a list of table names filed under Admin.
 *
 * ── Why some of them open a menu ───────────────────────────────────────────
 *
 * A screen is rarely one table. The register shows bookings, but a booking
 * also has priced lines, vehicles, notes, a guest and documents, and each of
 * those is its own sheet — an accountant cannot use a column of nested JSON.
 * So a screen with satellites lists them, and a screen with one table is a
 * plain button with no menu to open. Both wear the same label and the same
 * `tertiary`, because they are the same offer.
 *
 * ── Anchors, always ────────────────────────────────────────────────────────
 *
 * Every item is a real `<a href>`: this is a file with a name on the end of
 * it, and it has to survive a middle-click, a right-click and a browser that
 * has not run the page's JavaScript yet. Never `next/link` — that would
 * prefetch on hover and build the whole table for nothing.
 *
 * The caller decides whether to render this at all. Every export is gated on
 * `config.manage` and the route answers 404 without it, so a screen shows the
 * button only to a reader who has it: an affordance for a screen that will
 * refuse you is worse than no affordance (architecture.md §3).
 */

/** The one route behind all of them. */
export function exportHref(tableId: string): string {
  return `/portal/export?table=${tableId}`
}

interface ExportCsvButtonProps {
  /** This screen's tables, from `exportGroup(...)`. */
  tables: readonly ExportTableRef[]
  /**
   * An export of the screen *as filtered*, listed first under its own heading.
   * Only the reports screens have one, and it is a different thing from the
   * tables below it — the file is the screen, period and filters included —
   * so it is named as such rather than mixed in with them.
   */
  view?: { label: string; href: string }
}

export function ExportCsvButton({ tables, view }: ExportCsvButtonProps) {
  const firstTable = tables[0]

  if (view === undefined && tables.length === 1 && firstTable !== undefined) {
    return (
      <Button asChild variant="tertiary" className="shrink-0 whitespace-nowrap">
        <a href={exportHref(firstTable.id)}>Download CSV</a>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" className="shrink-0 whitespace-nowrap">
          Download CSV
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {view ? (
          <>
            <DropdownMenuLabel>This view</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <a href={view.href}>{view.label}</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Whole tables</DropdownMenuLabel>
          </>
        ) : null}

        {tables.map((table) => (
          <DropdownMenuItem key={table.id} asChild>
            <a href={exportHref(table.id)}>{table.label}</a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
