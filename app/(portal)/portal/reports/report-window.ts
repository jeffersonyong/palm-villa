import { readStayWindow } from '@/components/portal/list-params'
import { firstDayOfMonth, monthOf } from '@/components/ui/calendar-month'
import { todayInBrunei, type StayWindow } from '@/lib/domain/dates'

/**
 * The period a reports screen is looking at.
 *
 * ── Why there is a default at all ─────────────────────────────────────────
 *
 * Every other list screen opens unfiltered, because "everything" is a
 * meaningful answer for a register. It is not one for a report: occupancy over
 * all time is a number nobody has a use for, and revenue since go-live is a
 * figure that only grows. So a report always has a period, and the one it
 * opens on is **this month to date** — the span somebody checking in on the
 * business is asking about, and the one that agrees with what the desk has
 * actually recorded.
 *
 * `isExplicit` separates "the reader chose this month" from "nobody chose
 * anything", which is what decides whether a Clear control appears at all.
 * Writing the default as the *absence* of the params is the rule the list
 * screens already follow: an unfiltered view and its first page share a URL.
 */

export interface ReportWindow {
  window: StayWindow
  /** True when the period came from the URL rather than from the default. */
  isExplicit: boolean
}

export function readReportWindow(
  from: string | undefined,
  to: string | undefined,
  today = todayInBrunei(),
): ReportWindow {
  const chosen = readStayWindow(from, to)

  if (chosen) {
    return { window: chosen, isExplicit: true }
  }

  return { window: { from: firstDayOfMonth(monthOf(today)), to: today }, isExplicit: false }
}
