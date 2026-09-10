import { bnd, type Cents } from './money'

/**
 * Property configuration — the shape, and the values the property ships with.
 *
 * Every number the pricing engine uses is on this type rather than inline,
 * because rates, fees and policies are per-property configuration and never
 * constants (architecture.md §11).
 *
 * ── Where the live values come from ────────────────────────────────────────
 *
 * **Not from here.** Since 20260912000100 the figures are rows, and the engine
 * reads them through `getPropertyConfig()` in lib/db/property-config.ts. That
 * is what makes prd.md §7.2's promise true — a pending decision "becomes a
 * settings change rather than a code change" — and capability F3 is the screen
 * that changes them.
 *
 * `palmVillaConfig` below is what the property was seeded WITH, kept for two
 * jobs: it is the fixture the pure pricing tests price against, and it is the
 * documented statement of the shipped defaults, which lib/db/property-config
 * .test.ts asserts the database still agrees with. It is not read by anything
 * that quotes a real booking.
 *
 * Values carrying a `TODO(client)` are provisional — placeholders that let the
 * engine run, NOT decisions — and each names the prd.md §18 item that answers
 * it. They are now provisional *settings* rather than provisional code: the
 * client can change them himself, which is the whole point of the slice.
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

  /**
   * [C] BND 15 per hour (prd.md §8.2), reconfirmed 10 September 2026.
   *
   * The client's illustration of it did not match the rate he gave — a 15:00
   * check-out was described as "another 15", where three hours at this rate
   * is 45. Priced per hour, which is what the rate and the price list say;
   * open-questions.md N30 settles whether it is really a flat fee.
   */
  lateCheckOutPerHour: Cents

  /**
   * [C] 14:00 (open-questions.md N6, answered 10 September 2026). "Early" now
   * has a baseline, so the engine counts early check-in hours against a real
   * number instead of refusing to price them.
   *
   * It stays nullable because the field's meaning is "the time this property
   * checks guests in", and a second property may not have said yet.
   *
   * **Answering N6 did not make early check-in sellable.** prd.md §8.2 [A]
   * needs an availability check, not just a charge, and the client's own answer
   * is the same position — it is "up for discussion as we may or may not have
   * room ready". The booking form therefore sends zero early hours and says so.
   * The rule that would let it ask is open-questions.md N31.
   */
  standardCheckInTime: string | null

  /** [C] Check-out is 12:00; units target readiness by 14:00 (prd.md §8.2). */
  standardCheckOutTime: string

  // --- Deposit (prd.md §11) ------------------------------------------------

  /**
   * [C] BND 100, refundable, collected when the booking is made — it is what
   * secures the booking (prd.md §9.1, §11).
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

  // There are no hold durations, and that is open-questions.md N7 answered
  // (10 September 2026): a unit is held **indefinitely**, until a person
  // checks. Nothing expires a hold and nothing should, so the two fields that
  // used to sit here were deleted with capability F3 rather than given a
  // settings row — a number the client can change that changes nothing invites
  // him to shorten a timer that does not exist. If the public flow (phase two)
  // wants to state an expectation to a customer, that is a screen decision
  // with nothing behind it.

  // --- Day pass pricing (prd.md §8.1) -------------------------------------

  /**
   * [A] The overlap at 12 is settled (2026-09-05, Jeff): 1 to 11 is BND 5, 12
   * and above is BND 10. That is what the bands below already computed, so this
   * confirms the provisional reading rather than changing a price.
   *
   * TODO(client): pricing under age 1 is still not stated. Under-1 is free
   * here, inferred from the stays rule that guests aged 3 and below are not
   * counted — an inference, not an answer. See prd.md §18 N3.
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
 * The values Palm Villa was seeded with (supabase/seed.sql and
 * `seed_property_settings()` in 20260912000100).
 *
 * Confirmed values come from prd.md §7.1, §8 and §11; provisional ones carry a
 * `TODO(client)` on their field above. This is a **fixture and a statement of
 * the defaults**, not the live configuration — see the module header. Changing
 * a number here changes what a fresh database is seeded with and what the pure
 * pricing tests price against, and changes nothing about a booking taken
 * tomorrow.
 *
 * `propertyId` is the slug rather than the database uuid the live config
 * carries. Nothing reads the field; it is here because a config that could not
 * name its property would be an odd shape to hand to a second one.
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
  standardCheckInTime: '14:00',
  standardCheckOutTime: '12:00',

  securityDeposit: bnd(100),

  maxAdvanceBookingDays: 62,

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
