import { bnd, type Cents } from './money'

/**
 * Property configuration.
 *
 * Every number the pricing engine uses lives here rather than inline, for two
 * reasons. Rates, fees and policies are per-property configuration and never
 * constants (architecture.md §11), and — more immediately — several of them are
 * still open questions with the client. prd.md §7.2 sanctions exactly this
 * handling: a pending decision becomes "a settings change rather than a code
 * change".
 *
 * Values carrying a `TODO(client)` are provisional. They are placeholders that
 * let the engine run, NOT decisions. CLAUDE.md is explicit that a gap in the
 * PRD is a question for the client, not a design decision to make silently, so
 * each one names the prd.md §18 item that answers it.
 *
 * Grep `TODO(client)` in this file for the list to put in front of Jason.
 */

/**
 * How a unit type's stated maximum occupancy behaves.
 *
 * prd.md §18 N2 is open, and §8.2 records why: "Max for 8 pax" alongside "7 per
 * extra person" is contradictory — one reads as a ceiling, the other as a
 * surcharge above a threshold. They imply different products, so both are
 * implemented and this flag selects between them. It is not a preference to be
 * tuned; it is a question awaiting an answer.
 *
 * - `hard_cap` — a party above `maxPax` cannot book the unit at all. The
 *   extra-person charge is then unreachable.
 * - `surcharge_threshold` — a party above `maxPax` books and pays
 *   `extraPersonPerNight` for each guest above it.
 */
export type PaxPolicy = 'hard_cap' | 'surcharge_threshold'

export interface UnitTypeConfig {
  id: string
  /** URL-safe identifier, shared with the public site's content module. */
  slug: string
  name: string
  /** Nightly base rate (prd.md §7.1, all [C]). */
  baseRatePerNight: Cents
  /** Stated maximum occupancy. Its meaning depends on `paxPolicy` — see N2. */
  maxPax: number
  /** Car parking spaces included (prd.md §7.1). */
  carParks: number
}

export interface DayPassAgeBand {
  id: string
  label: string
  /** Inclusive lower bound in years. */
  minAge: number
  /**
   * Exclusive upper bound in years, or `null` for the open-ended top band.
   * Bands must not overlap — see the N3 note on `dayPassAgeBands`.
   */
  maxAgeExclusive: number | null
  pricePerPerson: Cents
}

export interface DayPassBundle {
  id: string
  label: string
  /** Required headcount per age-band id, e.g. `{ adult: 2, child: 1 }`. */
  composition: Readonly<Record<string, number>>
  price: Cents
}

export interface PropertyConfig {
  propertyId: string
  name: string

  // --- Stay pricing (prd.md §8.2) -----------------------------------------

  unitTypes: readonly UnitTypeConfig[]

  /**
   * TODO(client): prd.md §18 N2 — is stated max pax a hard cap, or the point
   * above which the extra-person charge applies? Provisionally
   * `surcharge_threshold`, because it is the only reading under which the
   * confirmed BND 7 extra-person charge is ever chargeable. Confirm before
   * launch: the two behave differently for every over-capacity party.
   */
  paxPolicy: PaxPolicy

  /** [C] BND 7 per extra person per night (prd.md §7.1, §8.2). */
  extraPersonPerNight: Cents

  /**
   * [C] Guests aged this age and below are not counted towards occupancy
   * (prd.md §8.2). Stated for the apartments; assumption A3 extends it to the
   * semi-detached, which prd.md §8.2 flags as unconfirmed but safe to assume.
   */
  paxExemptAgeMax: number

  /** [C] BND 28, includes one pillow and one blanket (prd.md §8.2). */
  sofaBedFlatFee: Cents

  /**
   * TODO(client): prd.md §18 N8 — total sofa beds across the property is
   * unknown. Modelled as property-level add-on stock, per §8.2, not per unit.
   * `null` means "unknown, do not constrain" so the fee still prices correctly;
   * a number here starts enforcing availability.
   */
  sofaBedStock: number | null

  /** [C] BND 10 per hour (prd.md §8.2). */
  earlyCheckInPerHour: Cents

  /** [C] BND 15 per hour (prd.md §8.2). */
  lateCheckOutPerHour: Cents

  /**
   * TODO(client): prd.md §18 N6 — standard check-in time is not stated, so
   * "early check-in" has no definition and the charge above cannot be applied
   * to a real number of hours. `null` disables early check-in as a sellable
   * extra until answered.
   *
   * Note also prd.md §8.2 [A]: early check-in needs an availability check, not
   * just a charge — selling it blind puts guests in units still being cleaned.
   * That check belongs with the schema slice; this field only defines "early".
   */
  standardCheckInTime: string | null

  /** [C] Check-out is 12:00; units target readiness by 14:00 (prd.md §8.2). */
  standardCheckOutTime: string

  // --- Deposit (prd.md §11) ------------------------------------------------

  /**
   * [C] BND 100, refundable, collected on arrival (prd.md §11).
   *
   * Named `securityDeposit` deliberately and never just "deposit": prd.md §9.5
   * N5 flags that "the deposit is forfeited on cancellation" is ambiguous
   * between this and the booking payment, and §9.5 asks for the two to be named
   * distinctly in the product before the ambiguity reaches the schema.
   */
  securityDeposit: Cents

  // --- Booking policy (prd.md §9.1) ---------------------------------------

  /** [C] Maximum advance booking period is two months (prd.md §9.1). */
  maxAdvanceBookingDays: number

  /**
   * TODO(client): prd.md §18 N7 — hold duration is unagreed. §9.3 suggests 60
   * minutes for stays and 30 for day passes. Unused by walk-in bookings, which
   * are paid on the spot (§9.4), so this is inert until the public flow lands.
   */
  holdMinutesStay: number
  holdMinutesDayPass: number

  // --- Day pass pricing (prd.md §8.1) -------------------------------------

  /**
   * TODO(client): prd.md §18 N3 — the client's bands ("1 to 12" and "12 and
   * above") overlap at 12, and pricing under age 1 is undefined. Bands here are
   * non-overlapping by construction because an overlap has no computable
   * meaning; the boundary below is a provisional reading, not the answer.
   * Under-1 is provisionally free.
   */
  dayPassAgeBands: readonly DayPassAgeBand[]

  /**
   * TODO(client): prd.md §18 N4 — bundles are defined only for 2 adults + 1
   * child and 2 adults + 2 children. Any other family shape has no stated rule.
   * See `priceDayPass` for how the gap is handled and what needs confirming.
   */
  dayPassBundles: readonly DayPassBundle[]
}

/**
 * The Palm Villa configuration.
 *
 * Confirmed values come from prd.md §7.1, §8 and §11. Provisional values carry
 * a `TODO(client)` on their field above. When these move into the database
 * (schema slice), this object becomes the seed.
 */
export const palmVillaConfig: PropertyConfig = {
  propertyId: 'palm-villa',
  name: 'Palm Villa',

  unitTypes: [
    {
      id: 'two-bedroom',
      slug: 'two-bedroom',
      name: '2-bedroom',
      baseRatePerNight: bnd(180),
      // prd.md §7.1 states "4 adults + 2 children" for this type alone. Read as
      // 6 under `surcharge_threshold`; N2 governs what the number means.
      maxPax: 6,
      carParks: 2,
    },
    {
      id: 'three-bedroom',
      slug: 'three-bedroom',
      name: '3-bedroom',
      baseRatePerNight: bnd(200),
      maxPax: 8,
      carParks: 2,
    },
    {
      id: 'four-bedroom',
      slug: 'four-bedroom',
      name: '4-bedroom',
      baseRatePerNight: bnd(250),
      maxPax: 10,
      carParks: 2,
    },
    {
      id: 'semi-detached',
      slug: 'semi-detached',
      name: 'Semi-detached',
      baseRatePerNight: bnd(320),
      maxPax: 20,
      carParks: 4,
    },
  ],

  paxPolicy: 'surcharge_threshold',
  extraPersonPerNight: bnd(7),
  paxExemptAgeMax: 3,

  sofaBedFlatFee: bnd(28),
  sofaBedStock: null,

  earlyCheckInPerHour: bnd(10),
  lateCheckOutPerHour: bnd(15),
  standardCheckInTime: null,
  standardCheckOutTime: '12:00',

  securityDeposit: bnd(100),

  maxAdvanceBookingDays: 62,

  holdMinutesStay: 60,
  holdMinutesDayPass: 30,

  dayPassAgeBands: [
    {
      id: 'infant',
      label: 'Under 1',
      minAge: 0,
      maxAgeExclusive: 1,
      pricePerPerson: bnd(0),
    },
    {
      id: 'child',
      label: 'Child',
      minAge: 1,
      maxAgeExclusive: 12,
      pricePerPerson: bnd(5),
    },
    {
      id: 'adult',
      label: 'Adult',
      minAge: 12,
      maxAgeExclusive: null,
      pricePerPerson: bnd(10),
    },
  ],

  dayPassBundles: [
    {
      id: 'family-2a1c',
      label: '2 adults + 1 child',
      composition: { adult: 2, child: 1 },
      price: bnd(20),
    },
    {
      id: 'family-2a2c',
      label: '2 adults + 2 children',
      composition: { adult: 2, child: 2 },
      price: bnd(25),
    },
  ],
}

/** Looks up a unit type by id, throwing when it does not exist. */
export function unitTypeById(config: PropertyConfig, unitTypeId: string): UnitTypeConfig {
  const unitType = config.unitTypes.find((candidate) => candidate.id === unitTypeId)

  if (!unitType) {
    throw new Error(`Unknown unit type: ${unitTypeId}`)
  }

  return unitType
}
