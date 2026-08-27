import { unitTypeById, type PropertyConfig } from '../config'
import { nightsBetween, todayInBrunei, type StayDate } from '../dates'
import { line, totalOf, type BookingLine } from '../lines'
import type { Cents } from '../money'

/**
 * Short-stay pricing (prd.md §8.2).
 *
 *   total = (base_rate × nights)
 *         + (extra_persons × 7 × nights)
 *         + (sofa_beds × 28)
 *         + (early_checkin_hours × 10)
 *         + (late_checkout_hours × 15)
 *
 * Pure: no database, no clock, no configuration read from module scope. Every
 * input arrives as an argument, including today's date, which is what lets the
 * advance-booking window be tested without freezing time. architecture.md §2
 * makes this one of the two modules where test coverage is mandatory.
 *
 * The security deposit is deliberately NOT a booking line. It is a refundable
 * liability held against the booking (prd.md §11), not revenue, and folding it
 * into the total would misstate both the price and the deposit ledger. It is
 * returned alongside so the form can show "plus BND 100 deposit" without the
 * two ever being summed.
 */

/**
 * A party, split by whether each guest counts towards occupancy.
 *
 * prd.md §8.2 [C]: guests aged 3 and below are not counted. Build one with
 * `partyFromAges` when ages are known, or construct directly when the form
 * collects counts.
 */
export interface StayParty {
  /** Guests above the exempt age. These drive the extra-person charge. */
  chargeableGuests: number
  /** Guests at or below `config.paxExemptAgeMax`, not counted towards pax. */
  exemptGuests: number
}

export interface StayPricingInput {
  unitTypeId: string
  checkIn: StayDate
  checkOut: StayDate
  party: StayParty
  sofaBeds: number
  earlyCheckInHours: number
  lateCheckOutHours: number
}

export type StayPricingErrorCode =
  | 'unknown_unit_type'
  | 'invalid_date_range'
  | 'outside_advance_window'
  | 'exceeds_max_pax'
  | 'no_guests'
  | 'early_check_in_undefined'
  | 'sofa_bed_stock_exceeded'
  | 'negative_quantity'

export interface StayPricingError {
  code: StayPricingErrorCode
  /** Written for a staff member to read on screen, not for a log. */
  message: string
}

export type StayPricingResult =
  | {
      ok: true
      nights: number
      lines: readonly BookingLine[]
      total: Cents
      /** Refundable, collected on arrival. Not part of `total`. */
      securityDeposit: Cents
    }
  | { ok: false; error: StayPricingError }

/**
 * Splits a list of guest ages into chargeable and exempt.
 *
 * This is where `paxExemptAgeMax` is actually applied. A form collecting counts
 * rather than ages can build a `StayParty` directly, but it should label its
 * exempt field using the same config value so the two never drift.
 */
export function partyFromAges(ages: readonly number[], config: PropertyConfig): StayParty {
  const exemptGuests = ages.filter((age) => age <= config.paxExemptAgeMax).length

  return { chargeableGuests: ages.length - exemptGuests, exemptGuests }
}

function fail(code: StayPricingErrorCode, message: string): StayPricingResult {
  return { ok: false, error: { code, message } }
}

/**
 * Prices a short stay.
 *
 * `today` is injected rather than read from the clock so the advance-booking
 * window is testable; it defaults to the real date in the property timezone.
 */
export function priceStay(
  input: StayPricingInput,
  config: PropertyConfig,
  today: StayDate = todayInBrunei(),
): StayPricingResult {
  const { party, sofaBeds, earlyCheckInHours, lateCheckOutHours } = input

  if (
    sofaBeds < 0 ||
    earlyCheckInHours < 0 ||
    lateCheckOutHours < 0 ||
    party.chargeableGuests < 0
  ) {
    return fail('negative_quantity', 'Quantities cannot be negative.')
  }

  let unitType
  try {
    unitType = unitTypeById(config, input.unitTypeId)
  } catch {
    return fail('unknown_unit_type', `No such unit type: ${input.unitTypeId}.`)
  }

  const nights = nightsBetween(input.checkIn, input.checkOut)

  if (nights < 1) {
    return fail('invalid_date_range', 'Check-out must be at least one night after check-in.')
  }

  // [C] Maximum advance booking period is two months (prd.md §9.1). Past dates
  // are refused here too: a walk-in is booked on the day or forward, and
  // back-dating a booking is a correction, not a sale.
  const daysAhead = nightsBetween(today, input.checkIn)

  if (daysAhead < 0) {
    return fail('outside_advance_window', 'Check-in cannot be in the past.')
  }

  if (daysAhead > config.maxAdvanceBookingDays) {
    return fail(
      'outside_advance_window',
      `Bookings open up to ${config.maxAdvanceBookingDays} days ahead.`,
    )
  }

  if (party.chargeableGuests < 1) {
    return fail('no_guests', 'A booking needs at least one guest above the exempt age.')
  }

  // --- prd.md §18 N2: the two readings of `maxPax` -------------------------
  //
  // Under `hard_cap` the stated maximum is a ceiling and an over-capacity party
  // simply cannot book. Under `surcharge_threshold` it is the point above which
  // the confirmed BND 7 per-person charge starts. The PRD states both and
  // resolves neither, so both are implemented and the config flag selects.
  const guestsAboveMax = Math.max(0, party.chargeableGuests - unitType.maxPax)

  if (config.paxPolicy === 'hard_cap' && guestsAboveMax > 0) {
    return fail(
      'exceeds_max_pax',
      `${unitType.name} takes up to ${unitType.maxPax} guests; this party is ${party.chargeableGuests}.`,
    )
  }

  const extraPersons = config.paxPolicy === 'surcharge_threshold' ? guestsAboveMax : 0

  if (config.sofaBedStock !== null && sofaBeds > config.sofaBedStock) {
    return fail(
      'sofa_bed_stock_exceeded',
      `Only ${config.sofaBedStock} sofa beds are available across the property.`,
    )
  }

  // prd.md §18 N6: without a standard check-in time, "early" has no definition,
  // so the hours cannot be counted and the extra is not sellable. Refusing is
  // the honest behaviour — charging against an undefined baseline is not.
  if (earlyCheckInHours > 0 && config.standardCheckInTime === null) {
    return fail(
      'early_check_in_undefined',
      'Early check-in cannot be priced until the standard check-in time is confirmed.',
    )
  }

  const lines: BookingLine[] = [
    line(
      'accommodation',
      `${unitType.name} — ${nights} ${nights === 1 ? 'night' : 'nights'}`,
      nights,
      unitType.baseRatePerNight,
    ),
  ]

  if (extraPersons > 0) {
    lines.push(
      line(
        'extra_person',
        `Extra ${extraPersons === 1 ? 'guest' : 'guests'} above ${unitType.maxPax} — ${extraPersons} × ${nights} ${nights === 1 ? 'night' : 'nights'}`,
        extraPersons * nights,
        config.extraPersonPerNight,
      ),
    )
  }

  if (sofaBeds > 0) {
    lines.push(
      line(
        'sofa_bed',
        `Sofa bed${sofaBeds === 1 ? '' : 's'} (includes pillow and blanket)`,
        sofaBeds,
        config.sofaBedFlatFee,
      ),
    )
  }

  if (earlyCheckInHours > 0) {
    lines.push(
      line(
        'early_check_in',
        `Early check-in — ${earlyCheckInHours} ${earlyCheckInHours === 1 ? 'hour' : 'hours'}`,
        earlyCheckInHours,
        config.earlyCheckInPerHour,
      ),
    )
  }

  if (lateCheckOutHours > 0) {
    lines.push(
      line(
        'late_check_out',
        `Late check-out — ${lateCheckOutHours} ${lateCheckOutHours === 1 ? 'hour' : 'hours'}`,
        lateCheckOutHours,
        config.lateCheckOutPerHour,
      ),
    )
  }

  return {
    ok: true,
    nights,
    lines,
    total: totalOf(lines),
    securityDeposit: config.securityDeposit,
  }
}
