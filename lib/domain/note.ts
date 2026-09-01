/**
 * Booking notes — the internal scratchpad, and the one thing housekeeping is
 * told about a stay.
 *
 * Pure and I/O-free, with the same relationship to the database that
 * lib/domain/payment.ts has to the `payment` table: this closed list is
 * mirrored by a CHECK constraint on `booking_note`, so widening it is a code
 * change and a migration, together.
 *
 * ── Why an audience rather than two note systems ──────────────────────────
 *
 * "Notes for the team" and "notes for the cleaner" are the same act — a staff
 * member writing down something about this stay that no field on the booking
 * carries — differing only in who needs to read it. One table with an audience
 * tag means one place to write, one place to read, and one filter for the
 * housekeeping field screen when that screen exists. Two tables would be two
 * of everything, and would have to be reconciled the first time somebody wrote
 * the same sentence in both.
 *
 * A note about the UNIT rather than the stay — "the shower door sticks" —
 * is deliberately not modelled here. It outlives every booking, so hanging it
 * off one would lose it the moment the guest leaves. It belongs to the
 * inspections slice (prd.md §11) and is nobody's guess to make today.
 */

/**
 * Who a note is written for.
 *
 * `internal` is the default and the ordinary case: anything the office needs
 * to remember about this booking. `housekeeping` is the subset that has to
 * reach the person cleaning the unit, and is the only audience the field
 * screens will show — which is why it is a tag on the note and not a tone of
 * voice inside one.
 */
export const NOTE_AUDIENCES = ['internal', 'housekeeping'] as const

export type NoteAudience = (typeof NOTE_AUDIENCES)[number]

/** Screen-facing labels. The portal never renders a raw enum value. */
export const NOTE_AUDIENCE_LABELS: Readonly<Record<NoteAudience, string>> = {
  internal: 'Internal',
  housekeeping: 'Housekeeping',
}

/**
 * What each audience means, said to the person about to choose one.
 *
 * Staff pick the audience at the moment they are typing, and "housekeeping"
 * without this sentence reads as a filing category rather than as "the cleaner
 * will see this on their phone".
 */
export const NOTE_AUDIENCE_HINTS: Readonly<Record<NoteAudience, string>> = {
  internal: 'Office only. Nobody outside the portal sees this.',
  housekeeping: 'Shown to housekeeping alongside this unit on the field screen.',
}

/**
 * The longest a note may be.
 *
 * Generous, because this is explicitly a dumping ground — the whole point is
 * that staff do not have to decide whether something is worth recording. The
 * cap exists so one paste of a WhatsApp thread cannot make the detail screen
 * unreadable, not to ration what may be said.
 */
export const MAX_NOTE_LENGTH = 2000

export type NoteErrorCode = 'empty' | 'too_long'

/**
 * Whether this note may be saved.
 *
 * Trimming is part of the rule, not the form's job: a note of three spaces
 * satisfies `required` in a browser and tells the next reader nothing.
 */
export function checkNoteBody(body: string): { ok: true } | { ok: false; code: NoteErrorCode } {
  const trimmed = body.trim()

  if (trimmed.length === 0) {
    return { ok: false, code: 'empty' }
  }

  if (trimmed.length > MAX_NOTE_LENGTH) {
    return { ok: false, code: 'too_long' }
  }

  return { ok: true }
}

export function isNoteAudience(value: string): value is NoteAudience {
  return (NOTE_AUDIENCES as readonly string[]).includes(value)
}
