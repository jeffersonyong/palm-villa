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

/** Adds a number of days to a stay date, returning a new stay date. */
export function addDays(date: StayDate, days: number): StayDate {
  const shifted = new Date(
    Date.parse(`${parseStayDate(date)}T00:00:00Z`) + days * MILLISECONDS_PER_DAY,
  )

  return shifted.toISOString().slice(0, 10)
}
