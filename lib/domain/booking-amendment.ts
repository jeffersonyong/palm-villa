import { formatStayDate, type StayDate } from './dates'
import { describeDiscount, type Discount } from './discount'
import { formatCents, type Cents } from './money'
import { formatVehicles } from './vehicle'

/**
 * What changed in an amendment, in words a staff member can check.
 *
 * Amending a booking changes what a guest pays, so the write is preceded by a
 * confirmation that states the change rather than implying it. This module
 * produces that statement — and the same list gates the Save button, since
 * design.md requires an edit form's Save to be dirty until the draft actually
 * differs from what the server holds.
 *
 * Pure, and deliberately not the audit record: `amend_booking()` builds its own
 * `before`/`after` snapshots inside the transaction, where they cannot
 * disagree with what was written. This is the human-readable half.
 *
 * Labels use the domain's own vocabulary ("chargeable" / "exempt") rather than
 * the age-derived wording the booking form uses, because that wording comes
 * from `config.paxExemptAgeMax` and this module takes no config.
 */

export interface AmendmentSnapshot {
  unitRef: string
  checkIn: StayDate
  checkOut: StayDate
  chargeableGuests: number
  exemptGuests: number
  /** Every plate on the booking, in order (prd.md §2, §13 [C]). */
  vehicles: readonly string[]
  /** The guest asserted they are arriving without one. */
  noVehicle: boolean
  guestName: string
  guestPhone: string
  /**
   * The discount instruction, not its resolved cents. Carried as its own row
   * so a reworded reason at the same figure still reads as a change — the
   * total would not move, and the Save gate would otherwise call it clean.
   */
  discount: Discount | null
  total: Cents
}

export type AmendmentField = keyof AmendmentSnapshot

export interface AmendmentChange {
  field: AmendmentField
  /** Sentence case, as it appears in the confirm dialog. */
  label: string
  from: string
  to: string
}

/** Shown where a value is absent, so a blank never reads as a rendering fault. */
const ABSENT = '—'

const asCount = (value: number): string => String(value)
const asDate = (value: StayDate): string => formatStayDate(value)
const asMoney = (value: Cents): string => `BND ${formatCents(value)}`

/**
 * The fields, in reading order.
 *
 * Order is part of the behaviour, not presentation left to the caller: the
 * change a staff member made comes first and the price it caused comes last,
 * so the dialog reads as cause then consequence.
 */
const FIELDS: readonly {
  field: AmendmentField
  label: string
  render: (snapshot: AmendmentSnapshot) => string
}[] = [
  { field: 'unitRef', label: 'Unit', render: (s) => s.unitRef },
  { field: 'checkIn', label: 'Check-in', render: (s) => asDate(s.checkIn) },
  { field: 'checkOut', label: 'Check-out', render: (s) => asDate(s.checkOut) },
  {
    field: 'chargeableGuests',
    label: 'Chargeable guests',
    render: (s) => asCount(s.chargeableGuests),
  },
  { field: 'exemptGuests', label: 'Exempt guests', render: (s) => asCount(s.exemptGuests) },
  {
    field: 'vehicles',
    label: 'Vehicles',
    render: (s) => formatVehicles(s.vehicles) ?? (s.noVehicle ? 'None' : ABSENT),
  },
  { field: 'guestName', label: 'Guest', render: (s) => s.guestName },
  { field: 'guestPhone', label: 'Phone', render: (s) => s.guestPhone },
  { field: 'discount', label: 'Discount', render: (s) => describeDiscount(s.discount) },
  { field: 'total', label: 'Total', render: (s) => asMoney(s.total) },
]

/**
 * The fields that moved between two snapshots, in reading order.
 *
 * Compared on what each field *renders*, not on the raw value. `!==` was enough
 * while every field was a string or a number; the vehicle list is an array, and
 * two arrays holding the same plates are never `!==`-equal, so every save would
 * have claimed the vehicles changed. Comparing the rendered text is exactly the
 * question this module answers — "would a staff member see a difference?" — and
 * it holds for the scalar fields unchanged, because their renderers are
 * injective on the values that reach them.
 *
 * `noVehicle` therefore carries no row of its own: it is the second half of how
 * the vehicles line reads, and a diff showing "Vehicles: BAA1234 → None"
 * beside "No vehicle: no → yes" would state one change twice.
 */
export function describeAmendment(
  before: AmendmentSnapshot,
  after: AmendmentSnapshot,
): readonly AmendmentChange[] {
  return FIELDS.map(({ field, label, render }) => ({
    field,
    label,
    from: render(before),
    to: render(after),
  })).filter((change) => change.from !== change.to)
}

/** True when the draft differs from what the server holds — the Save gate. */
export function hasAmendment(before: AmendmentSnapshot, after: AmendmentSnapshot): boolean {
  return describeAmendment(before, after).length > 0
}
