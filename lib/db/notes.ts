import { currentPropertyId } from '@/lib/db/property'
import type { NoteAudience } from '@/lib/domain/note'
import { dataClient } from '@/lib/supabase/data'

/**
 * Booking notes — reads and the one write.
 *
 * A plain table rather than an RPC, unlike every booking and payment write in
 * this directory. Those exist because several rows have to move together or
 * not at all — a booking whose occupancy moved but whose lines did not is a
 * guest charged for a stay they are not having. A note is one row and nothing
 * else, with no audit event beside it to keep atomic, so a transaction would
 * buy nothing. `recordAuditEvent` in ./audit.ts is the same shape for the same
 * reason.
 *
 * There is deliberately no update and no delete. Notes are append-only in the
 * product (see 20260902000100_discounts_and_notes.sql for why that is a
 * product rule here and a trigger on `audit_event`), and a correction is a
 * further note.
 */

export interface BookingNote {
  id: string
  audience: NoteAudience
  body: string
  /** auth.users.id, or null for a note with no signed-in author behind it. */
  authorId: string | null
  /** ISO timestamp, formatted at the edge. */
  at: string
}

interface BookingNoteRow {
  id: string
  audience: NoteAudience
  body: string
  author_id: string | null
  created_at: string
}

function toNote(row: BookingNoteRow): BookingNote {
  return {
    id: row.id,
    audience: row.audience,
    body: row.body,
    authorId: row.author_id,
    at: row.created_at,
  }
}

/**
 * Every note on a booking, newest first.
 *
 * Both audiences, because the portal shows one thread with each note labelled
 * — an office note and a housekeeping note about the same guest belong next to
 * each other, and splitting them into two lists would hide the second from
 * whoever wrote the first. `audience` narrows it where a screen needs only one
 * side of that, which today is the housekeeping field screen and nothing else.
 */
export async function listBookingNotes(
  bookingId: string,
  audience?: NoteAudience,
): Promise<readonly BookingNote[]> {
  const propertyId = await currentPropertyId()

  let query = dataClient()
    .from('booking_note')
    .select('id, audience, body, author_id, created_at')
    .eq('property_id', propertyId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })

  if (audience) {
    query = query.eq('audience', audience)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Could not read the notes on this booking: ${error.message}`)
  }

  return (data as unknown as BookingNoteRow[]).map(toNote)
}

export interface AddBookingNoteInput {
  bookingId: string
  audience: NoteAudience
  /** Already trimmed and length-checked by `checkNoteBody` in lib/domain. */
  body: string
  /**
   * From requirePermission()'s Actor. Required, not defaulted: a note whose
   * author nobody recorded is most of a note's value gone, and a caller with
   * no actor should have to say `null` out loud.
   */
  authorId: string | null
}

export async function addBookingNote(input: AddBookingNoteInput): Promise<BookingNote> {
  const propertyId = await currentPropertyId()

  const { data, error } = await dataClient()
    .from('booking_note')
    .insert({
      property_id: propertyId,
      booking_id: input.bookingId,
      audience: input.audience,
      body: input.body.trim(),
      author_id: input.authorId,
    })
    .select('id, audience, body, author_id, created_at')
    .single()

  if (error) {
    throw new Error(`Could not save the note: ${error.message}`)
  }

  return toNote(data as unknown as BookingNoteRow)
}
