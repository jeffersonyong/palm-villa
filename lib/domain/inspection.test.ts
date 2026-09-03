import { describe, expect, test } from 'vitest'

import {
  checkInspectionNotes,
  INSPECTION_OUTCOME_LABELS,
  INSPECTION_OUTCOMES,
  isInspectionOutcome,
  MAX_INSPECTION_NOTES_LENGTH,
} from './inspection'

/**
 * What Housekeeping records, and what a release is then read against.
 *
 * Small module, mandatory coverage: the notes rule is the only thing standing
 * between "issues found" and a charge nobody can justify later, and prd.md §11
 * makes the inspection the evidence a disputed deduction turns on.
 */

describe('isInspectionOutcome', () => {
  test.each(INSPECTION_OUTCOMES)('%s is an outcome', (outcome) => {
    expect(isInspectionOutcome(outcome)).toBe(true)
  })

  test('anything else is refused rather than coerced', () => {
    expect(isInspectionOutcome('damaged')).toBe(false)
    expect(isInspectionOutcome('Clean')).toBe(false)
    expect(isInspectionOutcome('')).toBe(false)
  })
})

describe('INSPECTION_OUTCOME_LABELS', () => {
  test('every outcome has a label, so no screen renders a raw enum value', () => {
    for (const outcome of INSPECTION_OUTCOMES) {
      expect(INSPECTION_OUTCOME_LABELS[outcome]).toBeTruthy()
    }
  })
})

describe('checkInspectionNotes', () => {
  test('a clean unit needs no explanation', () => {
    // Arrange / Act
    const result = checkInspectionNotes('clean', null)

    // Assert
    expect(result).toEqual({ ok: true })
  })

  test('a clean unit may still carry notes', () => {
    expect(checkInspectionNotes('clean', 'Aircon filter due a clean next turnaround.')).toEqual({
      ok: true,
    })
  })

  test('issues found without saying what were found is refused', () => {
    const result = checkInspectionNotes('issues_found', null)

    expect(result).toMatchObject({ ok: false, error: { code: 'notes_required' } })
  })

  test('whitespace is not an explanation', () => {
    // Three spaces satisfy a browser's `required` and satisfy nobody reading
    // the trail in a dispute, so trimming is part of the rule.
    expect(checkInspectionNotes('issues_found', '   \n  ')).toMatchObject({
      ok: false,
      error: { code: 'notes_required' },
    })
  })

  test('issues found with a description is recorded', () => {
    expect(checkInspectionNotes('issues_found', 'Shower screen cracked, bottom left.')).toEqual({
      ok: true,
    })
  })

  test('notes have a ceiling, and it is stated in the refusal', () => {
    const result = checkInspectionNotes('clean', 'x'.repeat(MAX_INSPECTION_NOTES_LENGTH + 1))

    expect(result).toMatchObject({ ok: false, error: { code: 'notes_too_long' } })
  })

  test('notes exactly at the ceiling are accepted', () => {
    expect(checkInspectionNotes('clean', 'x'.repeat(MAX_INSPECTION_NOTES_LENGTH))).toEqual({
      ok: true,
    })
  })
})
