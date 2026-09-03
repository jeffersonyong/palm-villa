/**
 * The inspection vocabulary (prd.md §11, capability C2).
 *
 * Housekeeping inspects the unit after check-out, and what they record is the
 * fact a deposit release turns on: was the unit as it should be, or is there
 * something to charge for. This module owns that vocabulary and nothing else —
 * the arithmetic of a deposit lives in ./deposit.ts — so the housekeeping field
 * screen can import the outcomes without pulling in a ledger it has no use for.
 *
 * The same relationship to the database that lib/domain/payment.ts has: the
 * closed list below is mirrored by a CHECK constraint on the `inspection`
 * table, so widening it is a code change and a migration, together.
 *
 * ── What this deliberately does not carry ─────────────────────────────────
 *
 * **Photographs.** prd.md §11 requirement 2 asks for them and calls them "the
 * cheapest thing that improves dispute outcomes", which is true and is why they
 * are not faked here: private buckets, signed URLs, permission-gated access and
 * retention expiry are the documents slice (architecture.md §8), and an
 * `inspection_photos` column pointing at nothing would be a promise the product
 * cannot keep. The gap is flagged to the client in scope-of-capabilities.md
 * rather than quietly absorbed.
 */

/**
 * How the unit was found.
 *
 * Two values, and the reason there are only two is that prd.md §11 branches
 * exactly once: "Once condition is confirmed, deposit release is authorised …
 * Damages or charges are deducted before the balance is released." The
 * inspection has to say which side of that sentence the approver is on, and a
 * finer taxonomy — damage, cleaning required, missing items — would be a set of
 * categories nobody has asked for and which the notes already carry in the
 * inspector's own words. **[A]**, recorded in prd.md §11.
 */
export const INSPECTION_OUTCOMES = ['clean', 'issues_found'] as const

export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number]

/** Screen-facing labels. The portal never renders a raw enum value. */
export const INSPECTION_OUTCOME_LABELS: Readonly<Record<InspectionOutcome, string>> = {
  clean: 'Clean',
  issues_found: 'Issues found',
}

/**
 * The notes field's ceiling.
 *
 * Longer than a booking note's 280, because this one is evidence in a dispute
 * about money rather than a line of staff shorthand, and the inspector should
 * not be editing down a description of a broken door.
 */
export const MAX_INSPECTION_NOTES_LENGTH = 2000

/** True when the value is one of the two — for reading a form field. */
export function isInspectionOutcome(value: string): value is InspectionOutcome {
  return (INSPECTION_OUTCOMES as readonly string[]).includes(value)
}

export interface InspectionNotesError {
  code: 'notes_required' | 'notes_too_long'
  message: string
}

export type InspectionNotesResult = { ok: true } | { ok: false; error: InspectionNotesError }

/**
 * Whether these notes may be recorded against this outcome.
 *
 * Notes are required when issues were found, and optional otherwise. An
 * inspection that says something is wrong without saying what is the one shape
 * that cannot support the charge that follows it — the deduction is disputed
 * later and the record says only "issues found".
 *
 * Trimming is part of the rule, not the form's job: three spaces satisfy a
 * browser's `required` and satisfy nobody reading the trail afterwards. The
 * database enforces the same thing last (`inspection_issues_need_notes`).
 */
export function checkInspectionNotes(
  outcome: InspectionOutcome,
  notes: string | null,
): InspectionNotesResult {
  const written = (notes ?? '').trim()

  if (written.length > MAX_INSPECTION_NOTES_LENGTH) {
    return {
      ok: false,
      error: {
        code: 'notes_too_long',
        message: `Keep the notes under ${MAX_INSPECTION_NOTES_LENGTH.toLocaleString('en-GB')} characters.`,
      },
    }
  }

  if (outcome === 'issues_found' && written.length === 0) {
    return {
      ok: false,
      error: {
        code: 'notes_required',
        message: 'Say what was found. A charge against this deposit will be read against it.',
      },
    }
  }

  return { ok: true }
}
