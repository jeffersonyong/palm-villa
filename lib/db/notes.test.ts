import { describe, expect, test } from 'vitest'

import { addBookingNote, listBookingNotes } from './notes'
import { givenBooking } from './test/factory'

/**
 * Booking notes, against the real database.
 *
 * Small surface, and the cases worth having are the ones the pure vocabulary
 * in `lib/domain/note.ts` cannot answer: that the thread comes back newest
 * first, that the housekeeping filter the field screen will use actually
 * narrows, that the author and the time are recorded without the caller
 * supplying them, and that a note dies with the booking it was written about.
 */

const CHECK_IN = '2026-09-14'
const CHECK_OUT = '2026-09-17'

async function givenBookingWithNotes(unitRef: string) {
  const booking = await givenBooking({ unitRef, checkIn: CHECK_IN, checkOut: CHECK_OUT })

  await addBookingNote({
    bookingId: booking.id,
    audience: 'internal',
    body: 'Guest asked about late checkout — quoted BND 15 an hour.',
    authorId: null,
  })

  await addBookingNote({
    bookingId: booking.id,
    audience: 'housekeeping',
    body: 'Extra towels on arrival — four guests, not two.',
    authorId: null,
  })

  return booking
}

describe('booking notes', () => {
  test('come back newest first, both audiences in one thread', async () => {
    // Arrange
    const booking = await givenBookingWithNotes('3B-01')

    // Act
    const notes = await listBookingNotes(booking.id)

    // Assert — the housekeeping note was written second, so it reads first.
    expect(notes.map((note) => note.audience)).toEqual(['housekeeping', 'internal'])
  })

  test('narrow to one audience when asked — the field screen’s query', async () => {
    const booking = await givenBookingWithNotes('3B-02')

    const forHousekeeping = await listBookingNotes(booking.id, 'housekeeping')

    expect(forHousekeeping).toHaveLength(1)
    expect(forHousekeeping[0]?.body).toContain('Extra towels')
  })

  test('record when they were written without the caller saying so', async () => {
    const booking = await givenBooking({
      unitRef: '3B-03',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    })

    const saved = await addBookingNote({
      bookingId: booking.id,
      audience: 'internal',
      body: 'Paid in cash at the desk.',
      authorId: null,
    })

    expect(saved.at).toBeTruthy()
    expect(new Date(saved.at).getTime()).not.toBeNaN()
  })

  test('are trimmed, so trailing whitespace never reaches the thread', async () => {
    const booking = await givenBooking({
      unitRef: '3B-04',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    })

    const saved = await addBookingNote({
      bookingId: booking.id,
      audience: 'internal',
      body: '   Porter has the keys.\n\n  ',
      authorId: null,
    })

    expect(saved.body).toBe('Porter has the keys.')
  })

  test('are refused when they say nothing at all', async () => {
    // The database refuses this too — `btrim(body) <> ''` — which is what makes
    // it a rule rather than a form's opinion. The server action catches it
    // first and puts a sentence beside the box.
    const booking = await givenBooking({
      unitRef: '3B-05',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    })

    await expect(
      addBookingNote({
        bookingId: booking.id,
        audience: 'internal',
        body: '   ',
        authorId: null,
      }),
    ).rejects.toThrow()
  })

  test('a booking with nothing recorded against it has an empty thread', async () => {
    const booking = await givenBooking({
      unitRef: '3B-06',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    })

    expect(await listBookingNotes(booking.id)).toEqual([])
  })

  test('belong to one booking, and never leak into another', async () => {
    const [first, second] = await Promise.all([
      givenBookingWithNotes('3B-07'),
      givenBooking({ unitRef: '3B-08', checkIn: CHECK_IN, checkOut: CHECK_OUT }),
    ])

    expect(await listBookingNotes(first.id)).toHaveLength(2)
    expect(await listBookingNotes(second.id)).toHaveLength(0)
  })
})
