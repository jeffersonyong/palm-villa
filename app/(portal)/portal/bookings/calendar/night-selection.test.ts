import { describe, expect, test } from 'vitest'

import { isWithinSpan, spanFor, stayFor } from './night-selection'

/** September 2026: column 0 is the 1st. */
const dayOf = (column: number) => `2026-09-${String(column + 1).padStart(2, '0')}`
const anythingSells = () => true

describe('spanFor', () => {
  test('takes the nights between the two days, and not the day left on', () => {
    // Arrange — the 14th clicked, then the 16th. Columns are 0-based.
    const anchor = 13
    const target = 15

    // Act
    const span = spanFor(anchor, target, anythingSells)

    // Assert — the 14th and the 15th; the 16th stays free.
    expect(span).toEqual({ firstNight: 13, lastNight: 14 })
  })

  test('a departure the day after the arrival is one night', () => {
    // Arrange / Act
    const span = spanFor(13, 14, anythingSells)

    // Assert
    expect(span).toEqual({ firstNight: 13, lastNight: 13 })
  })

  test('refuses a second click on the day already chosen', () => {
    // Arrange / Act / Assert — a stay of no nights is not a stay.
    expect(spanFor(13, 13, anythingSells)).toBeNull()
  })

  test('refuses a second click before the first, so the caller can start again', () => {
    // Arrange / Act / Assert — never silently swapped: the earlier day is an
    // arrival being corrected, not a departure.
    expect(spanFor(13, 9, anythingSells)).toBeNull()
  })

  test('refuses a span that crosses a night already taken', () => {
    // Arrange — the 17th is held by somebody else.
    const isSellable = (column: number) => column !== 16

    // Act / Assert
    expect(spanFor(13, 20, isSellable)).toBeNull()
  })

  test('allows a span that stops on the night before a taken one', () => {
    // Arrange — the 17th is held; arriving the 14th and leaving the 17th only
    // needs the 14th, 15th and 16th.
    const isSellable = (column: number) => column !== 16

    // Act
    const span = spanFor(13, 16, isSellable)

    // Assert — the check-out day is never asked about: it is not held.
    expect(span).toEqual({ firstNight: 13, lastNight: 15 })
  })

  test('refuses when the arrival itself cannot be sold', () => {
    // Arrange / Act / Assert
    expect(spanFor(13, 15, (column) => column !== 13)).toBeNull()
  })
})

describe('isWithinSpan', () => {
  test('paints the nights and neither day outside them', () => {
    // Arrange
    const span = { firstNight: 13, lastNight: 14 }

    // Act / Assert
    expect([12, 13, 14, 15].map((column) => isWithinSpan(span, column))).toEqual([
      false,
      true,
      true,
      false,
    ])
  })

  test('paints nothing when there is no span', () => {
    expect(isWithinSpan(null, 13)).toBe(false)
  })
})

describe('stayFor', () => {
  test('reads back as the dates a guest would say', () => {
    // Arrange
    const span = { firstNight: 13, lastNight: 14 }

    // Act
    const stay = stayFor(span, dayOf)

    // Assert
    expect(stay).toEqual({ checkIn: '2026-09-14', checkOut: '2026-09-16', nights: 2 })
  })

  test('one night leaves the next morning', () => {
    // Arrange / Act
    const stay = stayFor({ firstNight: 13, lastNight: 13 }, dayOf)

    // Assert
    expect(stay).toEqual({ checkIn: '2026-09-14', checkOut: '2026-09-15', nights: 1 })
  })

  test('carries a stay over the end of the month', () => {
    // Arrange / Act — the 29th and the 30th, leaving on 1 October.
    const stay = stayFor({ firstNight: 28, lastNight: 29 }, dayOf)

    // Assert
    expect(stay).toEqual({ checkIn: '2026-09-29', checkOut: '2026-10-01', nights: 2 })
  })
})
