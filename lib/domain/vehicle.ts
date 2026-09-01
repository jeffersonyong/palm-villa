/**
 * Vehicle registrations, normalised.
 *
 * prd.md §2 lists the vehicle registration among the things collected at
 * booking time, and §13 [C] makes it required "for records and security". §12.5
 * says why it has to be *searchable*: "vehicle registration lookup is a
 * first-class path, not a fallback" — a car arrives, the guard sees a plate,
 * and expects that lookup to carry more traffic than QR scanning.
 *
 * That last point is what makes normalisation a domain concern rather than a
 * form detail. A plate typed `baa 1234` at the desk and read `BAA1234` at the
 * gate is the same car, and the lookup is an equality match on an indexed
 * column (`booking_vehicle_property_registration_idx`). So the shape is decided
 * once, here, on the way in — never at the point of comparison, where a second
 * copy of these rules would drift from this one.
 *
 * What it deliberately does NOT do is validate a format. Brunei plates are not
 * one shape, and a pattern that refuses a legitimate plate at a front desk with
 * a guest standing at it is worse than a permissive field. The database agrees:
 * `booking_vehicle.registration` checks only that it is non-blank.
 */

/**
 * The longest plate accepted, matching `TextField`'s own limit.
 *
 * A bound on typing, not a rule about plates — nothing real is close to it.
 */
export const MAX_VEHICLE_REGISTRATION_LENGTH = 20

/**
 * How many vehicles one booking may list.
 *
 * **Not a parking rule.** prd.md §7.1 gives each unit type a `car_allowance`
 * (2 to 4) and open question R3 asks how many bays the property actually has;
 * neither is answered by refusing a plate. A family that arrives in three cars
 * for a two-car unit is a fact Security needs recorded, not a booking the
 * system should reject — the allowance is a charging and capacity question for
 * whoever answers R3. This is only a bound on the repeated field, so a stuck
 * key cannot write a thousand rows.
 */
export const MAX_VEHICLES_PER_BOOKING = 10

/**
 * One plate as it is stored: upper case, trimmed, internal runs of whitespace
 * collapsed to a single space. Blank comes back as `null`, because an empty
 * row in a repeated field is a row the staff member did not fill in, not a
 * vehicle with no name.
 */
export function normaliseVehicleRegistration(raw: string): string | null {
  const normalised = raw.trim().replace(/\s+/g, ' ').toUpperCase()

  return normalised.length > 0 ? normalised : null
}

/**
 * A booking's plates: normalised, blanks dropped, duplicates removed, order
 * kept.
 *
 * Order is the order they were given, which is the order they are shown in and
 * the order `booking_vehicle.sort_order` stores. De-duplication is not a
 * convenience — the table's `unique (property_id, booking_id, registration)`
 * would otherwise refuse the whole write because someone typed the same car
 * into two rows.
 */
export function normaliseVehicleRegistrations(raw: readonly string[]): readonly string[] {
  const seen = new Set<string>()

  for (const entry of raw) {
    const plate = normaliseVehicleRegistration(entry)

    if (plate) {
      seen.add(plate)
    }
  }

  return [...seen]
}

/**
 * Whether what the form collected is a legal answer to "which vehicles?".
 *
 * The two legal answers are "these ones" and "none, deliberately". The illegal
 * one is silence, which is what the field used to allow and what §13 [C] does
 * not. `create_walk_in_booking()` and `amend_booking()` refuse the same
 * combination, so this is the courtesy that turns a raised exception into a
 * message beside the field.
 */
export function hasVehicleAnswer(vehicles: readonly string[], noVehicle: boolean): boolean {
  return noVehicle || vehicles.length > 0
}

/** Plates as one line, for a table cell or a readout. */
export function formatVehicles(vehicles: readonly string[]): string | null {
  return vehicles.length > 0 ? vehicles.join(' · ') : null
}
