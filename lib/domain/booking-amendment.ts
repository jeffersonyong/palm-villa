import { formatStayDate, type StayDate } from './dates'
import { formatCents, type Cents } from './money'

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
  vehicleRegistration: string | null
  guestName: string
  guestPhone: string
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

const asText = (value: string | null): string => value ?? ABSENT
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
    field: 'vehicleRegistration',
    label: 'Vehicle',
    render: (s) => asText(s.vehicleRegistration),
  },
  { field: 'guestName', label: 'Guest', render: (s) => s.guestName },
  { field: 'guestPhone', label: 'Phone', render: (s) => s.guestPhone },
  { field: 'total', label: 'Total', render: (s) => asMoney(s.total) },
]

/** The fields that moved between two snapshots, in reading order. */
export function describeAmendment(
  before: AmendmentSnapshot,
  after: AmendmentSnapshot,
): readonly AmendmentChange[] {
  return FIELDS.filter(({ field }) => before[field] !== after[field]).map(
    ({ field, label, render }) => ({
      field,
      label,
      from: render(before),
      to: render(after),
    }),
  )
}

/** True when the draft differs from what the server holds — the Save gate. */
export function hasAmendment(before: AmendmentSnapshot, after: AmendmentSnapshot): boolean {
  return describeAmendment(before, after).length > 0
}
