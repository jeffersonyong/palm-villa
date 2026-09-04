'use client'

import { useActionState, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/components/ui/avatar-identity'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
 * The notes on a booking, and the dialog for adding one.
 *
 * One thread, both audiences, each note labelled — an office note and a
 * housekeeping note about the same guest belong beside each other, and two
 * separate lists would hide the second from whoever wrote the first.
 *
 * The composer used to stand open at the top of the thread, a textarea and a
 * select on every booking whether or not anyone had anything to say. It is
 * now a dialog behind "Add note" on the section's title line, so the section
 * is the notes — or, on most bookings, a plain statement that there are none.
 *
 * A client island because the dialog is stateful; the rest of the detail
 * screen stays a server component. The list arrives as a prop and is
 * re-fetched by the action's `revalidatePath`, so nothing here holds a second
 * copy of the notes.
 *
 * Append-only, deliberately (see the migration). There is no edit and no
 * delete: a correction is a further note, which is also how the trail reads
 * best when somebody is trying to reconstruct what was known and when.
 */

const initialState: AddNoteState = { status: 'idle' }

interface BookingNotesProps {
  notes: readonly BookingNote[]
  /** Staff ids to display names, resolved by the page. */
  actorNames: ReadonlyMap<string, string>
}

export function BookingNotes({ notes, actorNames }: BookingNotesProps) {
  if (notes.length === 0) {
    return (
      <EmptyState
        // 6px inside a 12px card, as any nested gray panel is (card.tsx).
        className="rounded-md"
        title="No notes yet"
        description="Anything the desk needs to remember about this booking goes here."
      />
    )
  }

  return (
    <ul className="grid gap-lg">
      {notes.map((note) => (
        <li
          key={note.id}
          className="grid gap-sm border-b border-divider pb-lg last:border-0 last:pb-0"
        >
          <div className="flex flex-wrap items-center gap-sm">
            {/* `size-6` and the seeded fallback, matching the history panel
                below it — the same person is the same chip in both. */}
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
            <span className="text-caption text-muted-foreground">{formatTimestamp(note.at)}</span>
            {/* Only the housekeeping notes are badged. Internal is the default
                and the majority, and a label on every row would make the
                exception harder to spot rather than easier. */}
            {note.audience === 'housekeeping' ? (
              <Badge tone="neutral">{NOTE_AUDIENCE_LABELS.housekeeping}</Badge>
            ) : null}
          </div>

          {/* `whitespace-pre-wrap`, because staff paste lists into these and a
              note that collapses into one paragraph loses the shape its author
              gave it. */}
          <p className="text-body-sm whitespace-pre-wrap text-copy">{note.body}</p>
        </li>
      ))}
    </ul>
  )
}

/**
 * The "Add note" control, for the section's title line.
 *
 * Unconditional: the detail screen has already refused anyone without
 * `booking.view`, and that is the permission the action gates on. A second
 * check here would only be able to disagree with the first.
 */
export function AddNote({ bookingId }: { bookingId: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant="tertiary" onClick={() => setIsOpen(true)}>
        <Plus aria-hidden />
        Add note
      </Button>

      {/* Mounted only while open, so it opens empty and with fresh action
          state rather than last time's refusal. */}
      {isOpen ? <AddNoteDialog bookingId={bookingId} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function AddNoteDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(addBookingNoteAction, initialState)
  const [audience, setAudience] = useState<NoteAudience>('internal')
  // Controlled, so a note the server refused is still in the box when the
  // refusal arrives — React empties an uncontrolled field once a form action
  // settles, and asking somebody to retype a paragraph they just wrote is how
  // a feature stops being used.
  const [body, setBody] = useState('')

  useEffect(() => {
    if (state.status === 'done') {
      toast({ tone: 'positive', title: 'Note added' })
      onClose()
    }
  }, [state.status, onClose])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add a note</DialogTitle>
          <DialogDescription>
            Kept on this booking with your name and the time. Notes are never edited or deleted — a
            correction is a further note.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="bookingId" value={bookingId} />

          <div className="grid gap-sm">
            <Label htmlFor="audience">Who is this for?</Label>
            <Select
              name="audience"
              value={audience}
              onValueChange={(next) => setAudience(next as NoteAudience)}
            >
              <SelectTrigger id="audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">{NOTE_AUDIENCE_LABELS.internal}</SelectItem>
                <SelectItem value="housekeeping">{NOTE_AUDIENCE_LABELS.housekeeping}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-caption text-muted-foreground">{NOTE_AUDIENCE_HINTS[audience]}</p>
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="body">Note</Label>
            <Textarea
              id="body"
              name="body"
              rows={4}
              maxLength={MAX_NOTE_LENGTH}
              value={body}
              placeholder="Guest is arriving late — porter has been told"
              aria-invalid={state.fieldErrors?.body ? true : undefined}
              onChange={(event) => setBody(event.target.value)}
            />
            <FieldError message={state.fieldErrors?.body} />
          </div>

          {state.status === 'error' && !state.fieldErrors?.body ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || body.trim().length === 0}>
              {isPending ? 'Saving…' : 'Add note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
