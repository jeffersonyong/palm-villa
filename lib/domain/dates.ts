/**
 * Stay dates.
 *
 * A stay date is a calendar date in the property's timezone, not an instant.
 * "12 September" means the same day to a guest in Brunei regardless of where
 * the server runs, so stay dates are stored and passed as `YYYY-MM-DD` strings
 * (`date` in Postgres) and never as `Date` objects, which carry a time and a
 * zone and will silently shift a booking by a day (architecture.md §5.1).
 *
 * Brunei is UTC+8 with no daylight saving, which is what makes the plain-string
 * approach safe here.
 */

/** A calendar date in `YYYY-MM-DD` form, interpreted in the property timezone. */
export type StayDate = string

/** The property timezone (architecture.md §5.1). No DST. */
export const PROPERTY_TIME_ZONE = 'Asia/Brunei'

const STAY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MILLISECONDS_PER_DAY = 86_400_000

/** True when the value is a well-formed calendar date that actually exists. */
export function isStayDate(value: string): value is StayDate {
  if (!STAY_DATE_PATTERN.test(value)) {
    return false
  }

  // Round-tripping catches values that match the shape but are not real dates:
  // 2026-02-30 parses to 2 March, which serialises back differently.
  const parsed = new Date(`${value}T00:00:00Z`)

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Parses a stay date, throwing on anything malformed. */
export function parseStayDate(value: string): StayDate {
  if (!isStayDate(value)) {
    throw new Error(`Not a valid calendar date: ${value}. Expected YYYY-MM-DD.`)
  }

  return value
}

/**
 * Today's date in the property timezone.
 *
 * `en-CA` is used because its short date format is ISO-ordered (`YYYY-MM-DD`),
 * which makes this a formatting call rather than manual arithmetic on offsets.
 */
export function todayInBrunei(now: Date = new Date()): StayDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PROPERTY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Nights between check-in and check-out.
 *
 * Ranges are half-open `[checkIn, checkOut)`: a guest arriving on the 12th and
 * leaving on the 14th stays 2 nights and occupies the 12th and 13th. This is
 * the same convention as the database exclusion constraint (architecture.md
 * §5.2), which is what makes checkout day and next check-in day legal on the
 * same unit.
 */
export function nightsBetween(checkIn: StayDate, checkOut: StayDate): number {
  const start = Date.parse(`${parseStayDate(checkIn)}T00:00:00Z`)
  const end = Date.parse(`${parseStayDate(checkOut)}T00:00:00Z`)

  return Math.round((end - start) / MILLISECONDS_PER_DAY)
}

/**
 * Formats a stay date for display, e.g. `Fri 12 Sep`.
 *
 * UTC is deliberate: stay dates are calendar dates, so formatting through any
 * real timezone risks shifting the day the guest was told.
 */
export function formatStayDate(date: StayDate): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${parseStayDate(date)}T00:00:00Z`))
}

/**
 * A stay's own dates as one string, e.g. `14 → 16 Sept 2026`.
 *
 * The arrival-to-departure pair, for the places one cell has to hold what two
 * columns used to — the bookings register, whose date column collapsed when the
 * list took on streams that have no such pair at all (prd.md §6.1).
 *
 * Shares its elision with `formatStayRange` below, so a date reads the same in
 * a filter chip and in the table the chip filters. What differs is the
 * separator and what it means: an **arrow**, because these ends are a
 * half-open occupancy — the guest leaves *on* the second date and does not
 * sleep there — where the dash of a filter span joins two days that are both
 * included.
 */
export function formatStayDates(checkIn: StayDate, checkOut: StayDate): string {
  const from = parseStayDate(checkIn)
  const to = parseStayDate(checkOut)

  return `${formatRangeStart(from, to)} → ${formatRangeEnd(to)}`
}

/** Adds a number of days to a stay date, returning a new stay date. */
export function addDays(date: StayDate, days: number): StayDate {
  const shifted = new Date(
    Date.parse(`${parseStayDate(date)}T00:00:00Z`) + days * MILLISECONDS_PER_DAY,
  )

  return shifted.toISOString().slice(0, 10)
}

/**
 * Formats an instant for display, e.g. `15 Sept 2026, 07:30`.
 *
 * In the property's timezone, deliberately, and not the reader's: an audit
 * trail exists so people can agree on when something happened, and rendering
 * the same event on two different days depending on who opened the screen
 * would defeat it. Stay dates format in UTC for the opposite reason — those are
 * calendar dates, not instants.
 *
 * 24-hour, because a front office reading times off a screen should never have
 * to work out whether 1:05 is lunch or the small hours.
 */
export function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: PROPERTY_TIME_ZONE,
  }).format(new Date(timestamp))
}

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 1440

/**
 * Whole minutes between an instant and now.
 *
 * The verification queue's "time waiting" column (capability B4). Clamped at
 * zero: a timestamp in the future means the database clock and this process
 * disagree, and "waiting -3 minutes" helps nobody.
 */
export function elapsedMinutes(since: string, now: Date = new Date()): number {
  const elapsed = now.getTime() - new Date(since).getTime()

  return Math.max(0, Math.floor(elapsed / 60_000))
}

/**
 * A coarse duration for display, e.g. `12m`, `4h 12m`, `3 days`.
 *
 * Deliberately coarse, and it drops the minutes past a day: the queue is
 * refreshed by hand, so a figure accurate to the minute is precision the
 * screen cannot honour. What a staff member needs from this column is the
 * order of magnitude — minutes, hours, or too long.
 */
export function formatElapsed(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) {
    return `${minutes}m`
  }

  if (minutes < MINUTES_PER_DAY) {
    const hours = Math.floor(minutes / MINUTES_PER_HOUR)

    return `${hours}h ${minutes % MINUTES_PER_HOUR}m`
  }

  const days = Math.floor(minutes / MINUTES_PER_DAY)

  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/**
 * Formats an inclusive span of stay dates for a label, e.g. `1 – 7 Sept 2026`.
 *
 * Shared parts are written once — the reader already knows the month and year
 * from the other end of the dash — which is what keeps a two-date value short
 * enough to sit inside a filter chip. The year is always present: a staff
 * member scanning a filtered list needs to know they are looking at next
 * January, and "this year is implied" stops being true the moment someone
 * bookmarks the URL.
 *
 * Both ends are inclusive. Occupancy ranges elsewhere are half-open — see
 * `nightsBetween` — but a span a person picked off a calendar is the days they
 * pointed at, and rendering the last one as the day after would be a lie.
 */
export function formatStayRange(start: StayDate, end: StayDate): string {
  const from = parseStayDate(start)
  const to = parseStayDate(end)

  if (from > to) {
    throw new Error(`Range ends before it starts: ${from} to ${to}.`)
  }

  if (from === to) {
    return formatRangeEnd(from)
  }

  return `${formatRangeStart(from, to)} – ${formatRangeEnd(to)}`
}

/**
 * The opening half of a range: only the parts the closing half does not
 * already supply.
 */
function formatRangeStart(from: StayDate, to: StayDate): string {
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return formatDayNumber(from)
  }

  if (from.slice(0, 4) === to.slice(0, 4)) {
    return formatDayAndMonth(from)
  }

  return formatRangeEnd(from)
}

function formatWith(date: StayDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

function formatDayNumber(date: StayDate): string {
  return formatWith(date, { day: 'numeric' })
}

function formatDayAndMonth(date: StayDate): string {
  return formatWith(date, { day: 'numeric', month: 'short' })
}

function formatRangeEnd(date: StayDate): string {
  return formatWith(date, { day: 'numeric', month: 'short', year: 'numeric' })
}
