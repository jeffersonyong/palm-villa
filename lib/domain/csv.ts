/**
 * CSV, for the reporting screens' download (capability E5).
 *
 * A report nobody can get out of the browser is half a tool: the accountant
 * works in a spreadsheet, and a screenshot cannot be summed. So every report
 * table offers the rows behind it, for the period and filters actually on
 * screen — the file is the screen, not a second query that could disagree
 * with it.
 *
 * ── Money and dates are values, not labels ────────────────────────────────
 *
 * A cell holding `BND 2,360.00` is a string a spreadsheet cannot add up, and
 * the grouping comma would split it across two columns besides. Amounts are
 * written as bare decimals (`2360.00`), the currency is named in the column
 * header instead, and dates go out ISO (`2026-09-08`) so they sort and parse
 * anywhere. `formatCents` already omits the symbol, which is why it is the
 * same helper the screen uses.
 *
 * ── Formula injection ─────────────────────────────────────────────────────
 *
 * A guest types their own name and a clerk types a banking note, and both end
 * up in a file somebody opens in Excel. A cell beginning `=`, `+`, `-`, `@`,
 * a tab or a carriage return is read by Excel and LibreOffice as a **formula**
 * — `=1+1` computes, and the well-known cases reach out to a URL or invoke a
 * local command with the reader's own privileges. The file is not the attack;
 * the spreadsheet's willingness to execute it is, and neither quoting nor
 * escaping prevents it because the value is syntactically fine.
 *
 * So a **text** cell that opens with one of those characters is prefixed with
 * an apostrophe, which every spreadsheet reads as "this is text" and does not
 * display. Numbers are written through untouched: they are ours rather than
 * anybody's input, and guarding them would turn a negative balance into the
 * string `'-50.00`, breaking the arithmetic this file exists for. That the two
 * are told apart by type rather than by inspecting the characters is the whole
 * reason `CsvValue` distinguishes them.
 *
 * Pure and I/O-free. The BOM and the headers belong to the response, not here.
 */

/** A cell. Numbers are written as-is; strings are escaped and guarded. */
export type CsvValue = string | number | null | undefined

const NEEDS_QUOTING = /[",\r\n]/
const FORMULA_LEAD = /^[=+\-@\t\r]/

/** One cell, escaped for CSV and made inert as a formula. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }

  const guarded = FORMULA_LEAD.test(value) ? `'${value}` : value

  return NEEDS_QUOTING.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded
}

/**
 * A CSV document: a header row, then the rows.
 *
 * CRLF line endings, which RFC 4180 asks for and Excel on Windows is happiest
 * with; every other reader accepts them.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

/**
 * A filename that says what the file holds and for when, e.g.
 * `palm-villa-revenue-2026-09-01-to-2026-09-08.csv`.
 *
 * The period is in the name because two downloads of the same report differ
 * only by it, and a folder of `report.csv (3)` is what this avoids.
 */
export function csvFilename(report: string, from: string, to: string): string {
  return `palm-villa-${report}-${from}-to-${to}.csv`
}

/**
 * A filename for a whole-table export, e.g.
 * `palm-villa-bookings-2026-09-12.csv`.
 *
 * Dated rather than ranged, because F5 exports a table rather than a period —
 * what varies between two downloads is the day they were taken, and a folder of
 * `bookings.csv (3)` is what this avoids.
 */
export function exportFilename(table: string, on: string): string {
  return `palm-villa-${table}-${on}.csv`
}
