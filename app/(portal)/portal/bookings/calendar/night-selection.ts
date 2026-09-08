import { addDays, nightsBetween, type StayDate } from '@/lib/domain/dates'

/**
 * Choosing a stay by pointing at two days on the tape chart.
 *
 * The grid used to sell a night per click: every free cell was a link to the
 * new-booking screen with `[day, day + 1)` already filled in, so asking for
 * three nights meant clicking one, going back, and clicking the next. The
 * check-out was assumed rather than chosen, which is not how anybody books a
 * room.
 *
 * ── The first click is the arrival, the second is the departure ─────────────
 *
 * Both are *dates*, the way a guest says them and the way the booking form
 * takes them — "the 14th to the 16th". The columns between are **nights**, and
 * the last one is not included: `[14, 16)` is two nights, the 14th and the
 * 15th, which is the half-open convention the exclusion constraint uses and
 * the same arithmetic a bar is drawn from. So the highlight while choosing is
 * exactly the nights the booking would hold — never the check-out column,
 * which stays free and sellable to the next guest.
 *
 * ── A second click that is not after the first starts again ─────────────────
 *
 * The range picker on the filter rows takes its two ends in either order, and
 * that is right for a picker where both ends are equal. Here they are not: one
 * is an arrival and one is a departure, and silently swapping them would mean
 * a click on the 12th after the 16th quietly *dropped* the 16th from the
 * stay. Re-anchoring instead is the reading that matches what was clicked —
 * "start here instead" — and it is how somebody corrects an arrival they got
 * wrong.
 *
 * ── Nothing may be chosen across something already there ───────────────────
 *
 * A span has to be free for its whole length in that unit, and every night in
 * it has to be one the screen would sell — not in the past, not beyond the
 * advance-booking window. A range that crosses a bar is refused outright
 * rather than clamped: a highlight that stops short of the pointer would
 * create a different stay from the one being pointed at.
 */

/** Where a selection started: a unit's row, and the column clicked in it. */
export interface NightAnchor {
  unitId: string
  column: number
}

/** The nights a span covers, as inclusive column indexes. */
export interface NightSpan {
  firstNight: number
  lastNight: number
}

/**
 * The nights a click at `target` would take, or null when it would not take
 * any — a target at or before the anchor, or a span crossing something that
 * cannot be sold.
 *
 * `isSellable` is asked about **nights**, so it is never asked about the
 * check-out column: that day is not held by this stay.
 */
export function spanFor(
  anchor: number,
  target: number,
  isSellable: (column: number) => boolean,
): NightSpan | null {
  if (target <= anchor) {
    return null
  }

  for (let column = anchor; column < target; column += 1) {
    if (!isSellable(column)) {
      return null
    }
  }

  return { firstNight: anchor, lastNight: target - 1 }
}

/** Whether a column is painted while a span is being chosen. */
export function isWithinSpan(span: NightSpan | null, column: number): boolean {
  return span !== null && column >= span.firstNight && column <= span.lastNight
}

/** The stay a span describes: arrival, departure, and how many nights. */
export interface ChosenStay {
  checkIn: StayDate
  checkOut: StayDate
  nights: number
}

/**
 * A span as dates. The departure is the day *after* the last night, which is
 * what makes `[14, 16)` read back as "14th to 16th, two nights".
 */
export function stayFor(span: NightSpan, dayOf: (column: number) => StayDate): ChosenStay {
  const checkIn = dayOf(span.firstNight)
  const checkOut = addDays(dayOf(span.lastNight), 1)

  return { checkIn, checkOut, nights: nightsBetween(checkIn, checkOut) }
}
