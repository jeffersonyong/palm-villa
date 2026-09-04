'use client'

import { Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'

import { saveUnitNotesAction, type UnitActionState } from './actions'

/**
 * The unit's standing note — the answer to open-questions.md N18.
 *
 * ── Why this is a block and not a thread ──────────────────────────────────
 *
 * A booking's notes are a thread: a booking accumulates events, and each one
 * stays true about the moment it was written. A unit's note is the opposite
 * shape. "The shower door sticks" is a fact about the door, and it stops being
 * a fact when somebody fixes it — so a thread would make the current state of
 * a unit something the reader has to reconstruct from the bottom of a list,
 * past three years of things that are no longer wrong.
 *
 * Nothing is lost by making it editable: every change writes an audit event
 * carrying the text before and after, so the history panel is the thread this
 * deliberately is not — with the difference that the card at the top always
 * says what is true now.
 *
 * ── The read state is not a disabled textarea ─────────────────────────────
 *
 * A field that looks like a field but refuses a keystroke is the "affordance
 * that will refuse you" the rest of this screen avoids. So the note reads as
 * prose until Edit is pressed, and the empty state says what belongs there
 * rather than sitting as an empty box.
 *
 * The form is a separate component so that closing the editor on a successful
 * save is a **prop call** rather than a `setState` inside this component's own
 * effect — the same split `booking-actions.tsx` makes between a menu and its
 * dialog, and for the same reason.
 */

interface UnitNotesProps {
  unitId: string
  ref_: string
  notes: string | null
  /** `unit.manage`. A reader without it sees the note and no Edit. */
  canEdit: boolean
}

export function UnitNotes({ unitId, ref_, notes, canEdit }: UnitNotesProps) {
  const [isEditing, setIsEditing] = useState(false)

  if (isEditing) {
    return <NoteForm unitId={unitId} ref_={ref_} notes={notes} onDone={() => setIsEditing(false)} />
  }

  return (
    <div className="grid gap-md">
      {notes ? (
        <p className="text-body-sm whitespace-pre-wrap text-copy">{notes}</p>
      ) : (
        <p className="text-body-sm text-muted-foreground">
          Nothing recorded about this unit. Anything true of the unit itself belongs here — a
          sticking door, a temperamental aircon, where the spare key lives.
        </p>
      )}

      {canEdit ? (
        <div>
          <Button variant="tertiary" onClick={() => setIsEditing(true)}>
            <Pencil aria-hidden />
            {notes ? 'Edit note' : 'Add a note'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

const initialState: UnitActionState = { status: 'idle' }

function NoteForm({
  unitId,
  ref_,
  notes,
  onDone,
}: {
  unitId: string
  ref_: string
  notes: string | null
  onDone: () => void
}) {
  const [state, formAction, isPending] = useActionState(saveUnitNotesAction, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'done') {
      // Only when something actually changed: opening the field and closing it
      // again should not announce a save that did not happen.
      if (state.changed) {
        toast({ tone: 'positive', title: `Note saved for ${ref_}` })
      }

      onDone()
      router.refresh()
    }
  }, [state, ref_, onDone, router])

  return (
    <form action={formAction} className="grid gap-md">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="ref" value={ref_} />

      <Textarea
        name="notes"
        rows={5}
        maxLength={2000}
        defaultValue={notes ?? ''}
        aria-label={`Note about ${ref_}`}
        placeholder="Shower door sticks — lift slightly to close. Spare key with security."
        aria-invalid={Boolean(state.fieldErrors?.notes)}
      />

      {state.fieldErrors?.notes ? (
        <FieldError message={state.fieldErrors.notes} />
      ) : (
        <p className="text-caption text-muted-foreground">
          Every change is recorded against the unit with your name and the time. Clearing the field
          removes the note.
        </p>
      )}

      {state.status === 'error' && !state.fieldErrors ? (
        <FieldError message={state.message} />
      ) : null}

      <div className="flex items-center gap-sm">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save note'}
        </Button>
        <Button type="button" variant="tertiary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
