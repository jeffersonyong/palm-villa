'use client'

import { useActionState, useEffect, useRef, useState } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/components/ui/avatar-identity'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import type { BookingNote } from '@/lib/db/notes'
import { formatTimestamp } from '@/lib/domain/dates'
import {
  MAX_NOTE_LENGTH,
  NOTE_AUDIENCE_HINTS,
  NOTE_AUDIENCE_LABELS,
  type NoteAudience,
} from '@/lib/domain/note'

import { addBookingNoteAction, type AddNoteState } from './actions'

/**
 * The notes on a booking, and the box for adding one.
 *
 * One thread, both audiences, each note labelled — an office note and a
 * housekeeping note about the same guest belong beside each other, and two
 * separate lists would hide the second from whoever wrote the first.
 *
 * A client island because the compose box is stateful and the thread has to
 * empty itself after a save; the rest of the detail screen stays a server
 * component. The list arrives as a prop and is re-fetched by the action's
 * `revalidatePath`, so nothing here holds a second copy of the notes.
 *
 * Append-only, deliberately (see the migration). There is no edit and no
 * delete: a correction is a further note, which is also how the trail reads
 * best when somebody is trying to reconstruct what was known and when.
 */

const initialState: AddNoteState = { status: 'idle' }

interface BookingNotesProps {
  bookingId: string
  notes: readonly BookingNote[]
  /** Staff ids to display names, resolved by the page. */
  actorNames: ReadonlyMap<string, string>
}

/**
 * The composer is unconditional: the detail screen has already refused anyone
 * without `booking.view`, and that is the permission the action gates on. A
 * second check here would only be able to disagree with the first.
 */
export function BookingNotes({ bookingId, notes, actorNames }: BookingNotesProps) {
  return (
    <div className="grid gap-lg">
      <NoteComposer bookingId={bookingId} />

      {notes.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          Nothing recorded yet. Anything the desk needs to remember about this booking goes here.
        </p>
      ) : (
        <ul className="grid gap-lg">
          {notes.map((note) => (
            <li
              key={note.id}
              className="grid gap-sm border-b border-divider pb-lg last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-sm">
                {/* `size-6` and the seeded fallback, matching the history
                    panel below it — the same person is the same chip in both. */}
                <Avatar className="size-6">
                  <AvatarFallback seed={note.authorId ?? undefined}>
                    {note.authorId ? initials(actorNames.get(note.authorId) ?? '?') : 'PV'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-body-sm text-foreground">
                  {note.authorId
                    ? (actorNames.get(note.authorId) ?? 'a former staff member')
                    : 'the system'}
                </span>
                <span className="text-caption text-muted-foreground">
                  {formatTimestamp(note.at)}
                </span>
                {/* Only the housekeeping notes are badged. Internal is the
                    default and the majority, and a label on every row would
                    make the exception harder to spot rather than easier. */}
                {note.audience === 'housekeeping' ? (
                  <Badge tone="neutral">{NOTE_AUDIENCE_LABELS.housekeeping}</Badge>
                ) : null}
              </div>

              {/* `whitespace-pre-wrap`, because staff paste lists into these
                  and a note that collapses into one paragraph loses the shape
                  its author gave it. */}
              <p className="text-body-sm whitespace-pre-wrap text-copy">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The compose box. Split out so the thread above it is plain markup. */
function NoteComposer({ bookingId }: { bookingId: string }) {
  const [state, formAction, isPending] = useActionState(addBookingNoteAction, initialState)
  const [audience, setAudience] = useState<NoteAudience>('internal')
  const [body, setBody] = useState('')

  // Cleared on success rather than by the browser: React resets an
  // uncontrolled field once a form action settles, which would also have wiped
  // a note that was refused — and asking somebody to retype a paragraph they
  // just wrote is how a feature stops being used.
  const settled = useRef(state)

  useEffect(() => {
    if (state !== settled.current && state.status === 'done') {
      setBody('')
      toast({ tone: 'positive', title: 'Note added' })
    }

    settled.current = state
  }, [state])

  return (
    <form action={formAction} className="grid gap-sm">
      <input type="hidden" name="bookingId" value={bookingId} />

      <Label htmlFor="body">Add a note</Label>
      <Textarea
        id="body"
        name="body"
        rows={3}
        maxLength={MAX_NOTE_LENGTH}
        value={body}
        placeholder="Guest is arriving late — porter has been told"
        aria-invalid={state.fieldErrors?.body ? true : undefined}
        onChange={(event) => setBody(event.target.value)}
      />
      <FieldError message={state.fieldErrors?.body} />

      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className="grid gap-sm">
          <Label htmlFor="audience">Who is this for?</Label>
          <Select
            name="audience"
            value={audience}
            onValueChange={(next) => setAudience(next as NoteAudience)}
          >
            <SelectTrigger id="audience" className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">{NOTE_AUDIENCE_LABELS.internal}</SelectItem>
              <SelectItem value="housekeeping">{NOTE_AUDIENCE_LABELS.housekeeping}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" variant="secondary" disabled={isPending || body.trim().length === 0}>
          {isPending ? 'Saving…' : 'Add note'}
        </Button>
      </div>

      <p className="text-caption text-muted-foreground">{NOTE_AUDIENCE_HINTS[audience]}</p>

      {state.status === 'error' && !state.fieldErrors?.body ? (
        <FieldError message={state.message} />
      ) : null}
    </form>
  )
}
